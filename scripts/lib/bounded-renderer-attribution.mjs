// Private diagnostic only. Trace/realm sampling perturbs execution, never acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { summarizeMemoryInfraTrace } from "./memory-infra-attribution.mjs";

export const ATTRIBUTION_LIMITS = Object.freeze({ chromiumBufferBytes: 4194304,
  maximumSerializedBytes: 16777216, maximumDumps: 8, maximumRealmRows: 1024,
  realmIntervalMs: 100, ioReadBytes: 262144 });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function deadline(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Attribution shutdown deadline")), ms);
  })]); } finally { clearTimeout(timer); }
}
export async function startBoundedRendererAttribution(session, realms) {
  await session.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: {
    recordMode: "recordUntilFull", traceBufferSizeInKb: ATTRIBUTION_LIMITS.chromiumBufferBytes / 1024,
    includedCategories: ["disabled-by-default-memory-infra"], excludedCategories: ["*"],
    memoryDumpConfig: { allowed_dump_modes: ["light"], triggers: [] } } });
  const dumps = [], realmRows = [];
  let live = true, realmRowsEvicted = 0, samplingError = null, stopping = null, dumpPending = null;
  const pump = (async () => {
    try {
      while (live) {
        const startedAt = Date.now(), value = await realms.sample();
        if (realmRows.length === ATTRIBUTION_LIMITS.maximumRealmRows) { realmRows.shift(); realmRowsEvicted++; }
        realmRows.push({ startedAt, finishedAt: Date.now(), value });
        await delay(ATTRIBUTION_LIMITS.realmIntervalMs);
      }
    } catch (error) { samplingError = String(error).slice(0, 512); live = false; }
  })();
  return {
    async dump(phase, processes = null) {
      assert.equal(dumpPending, null, "Only one outstanding memory dump");
      assert.ok(dumps.length < ATTRIBUTION_LIMITS.maximumDumps, "Memory dump cap");
      const row = { phase, timestamp: new Date().toISOString(), processes, memoryDump: null };
      dumps.push(row);
      dumpPending = session.send("Tracing.requestMemoryDump", { levelOfDetail: "light", deterministic: false });
      try { row.memoryDump = await dumpPending; }
      catch (error) { row.memoryDump = { success: false, dumpGuid: null, error: String(error).slice(0, 512) }; }
      finally { dumpPending = null; row.finishedAt = new Date().toISOString(); }
      return row.memoryDump;
    },
    stop() {
      stopping ??= (async () => {
        live = false; await pump; if (dumpPending) await dumpPending.catch(() => {});
        const completed = new Promise(resolve => session.once("Tracing.tracingComplete", resolve));
        await session.send("Tracing.end");
        const result = await deadline(completed, 15000);
        assert.ok(result.stream, "Trace stream required");
        const chunks = []; let bytes = 0, overflow = false, trace = null, summary = null, parseError = null;
        const hash = createHash("sha256");
        try {
          for (;;) {
            const chunk = await session.send("IO.read", { handle: result.stream, size: ATTRIBUTION_LIMITS.ioReadBytes });
            const data = chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : Buffer.from(chunk.data);
            assert.ok(data.length <= ATTRIBUTION_LIMITS.ioReadBytes, "Bounded trace read");
            bytes += data.length;
            if (bytes > ATTRIBUTION_LIMITS.maximumSerializedBytes) { overflow = true; break; }
            hash.update(data); chunks.push(data); if (chunk.eof) break;
          }
        } finally { await session.send("IO.close", { handle: result.stream }); }
        if (!overflow) {
          try {
            trace = JSON.parse(Buffer.concat(chunks).toString());
            summary = summarizeMemoryInfraTrace(trace, dumps);
          } catch (error) { parseError = String(error).slice(0, 512); }
        }
        const dataLossOccurred = result.dataLossOccurred ?? null;
        return { scope: "bounded-private-renderer-allocation-attribution-not-acceptance", limits: ATTRIBUTION_LIMITS,
          perturbsMemory: true, acceptanceMetric: false,
          status: overflow || dataLossOccurred !== false || parseError || samplingError || dumps.some(row => !row.memoryDump?.success)
            ? "failed-diagnostic" : "completed-diagnostic",
          trace: { serializedBytes: bytes, sha256: overflow ? null : hash.digest("hex"),
            overflow, dataLossOccurred, parseError, events: trace?.traceEvents?.length ?? null,
            compactedBeforeRelease: Boolean(summary), rawRetained: false },
          dumps, allocatorSummary: summary, realmRows, realmRowsEvicted, samplingError,
          allocatorValuesOverlap: true, summedAllocatorTotal: null };
      })();
      return stopping;
    },
  };
}
