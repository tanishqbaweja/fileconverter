// Bounded diagnostic snapshots, not conversion data or an acceptance sampler.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { traceHexBytes } from "./memory-infra-attribution.mjs";
export const LIFECYCLE_LIMITS = Object.freeze({ checkpoints: 6, chromiumBufferKiB: 2048,
  serializedBytes: 8388608, compressedBytes: 1048576, readBytes: 262144, processAllocators: 256, events: 100000 });
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function summarizeLifecycleTrace(trace, reply, processes) {
  assert.ok(Array.isArray(trace.traceEvents) && trace.traceEvents.length <= LIFECYCLE_LIMITS.events);
  assert.equal(reply.success, true); assert.equal(typeof reply.dumpGuid, "string");
  const starts = trace.traceEvents.filter(row => row.name === "GlobalMemoryDump" && row.ph === "b" && row.args?.dump_guid === reply.dumpGuid);
  assert.equal(starts.length, 1); const start = starts[0];
  const ends = trace.traceEvents.filter(row => row.name === "GlobalMemoryDump" && row.ph === "e" && row.pid === start.pid && row.id2?.local === start.id2?.local && row.ts >= start.ts);
  assert.equal(ends.length, 1); const end = ends[0];
  const names = new Map(trace.traceEvents.filter(row => row.name === "process_name").map(row => [row.pid, row.args?.name ?? null]));
  const result = [];
  for (const event of trace.traceEvents.filter(row => row.ph === "v" && row.ts >= start.ts && row.ts <= end.ts && row.args?.dumps)) {
    const allocators = {}, dump = event.args.dumps;
    for (const [name, value] of Object.entries(dump.allocators ?? {})) {
      // Keep each V8 heap/malloc/code subtree, not only the overlapping root.
      if (name.includes("/") && !name.startsWith("v8/") && !/wasm|array_buffer/.test(name) && !/^blink_gc\/(?:main|workers)$/.test(name)) continue;
      assert.ok(Object.keys(allocators).length < LIFECYCLE_LIMITS.processAllocators && name.length <= 256);
      allocators[name] = Object.fromEntries(Object.entries(value.attrs ?? {}).filter(([, attr]) => attr.type === "scalar" && attr.units === "bytes")
        .map(([key, attr]) => [key, traceHexBytes(attr.value)]));
    }
    const os = processes.find(row => row.pid === event.pid);
    result.push({ pid: event.pid, traceName: names.get(event.pid) ?? null, identity: os ?? null,
      privateFootprintBytes: traceHexBytes(dump.process_totals?.private_footprint_bytes), allocators });
  }
  assert.ok(result.length > 0 && result.length <= 64);
  return { guid: reply.dumpGuid, traceIntervalMicroseconds: [start.ts, end.ts], processes: result,
    allocatorValuesOverlap: true, summedAllocatorTotal: null, acceptanceMetric: false };
}
async function timed(operation, ms = 15000) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Lifecycle attribution deadline")), ms); })]); }
  finally { clearTimeout(timer); }
}
export function createLifecycleAttribution({ root, reportBase, createSession, getProcesses, getRealms, getState }) {
  assert.equal(path.dirname(reportBase), path.join(root, "outputs/reports"));
  const checkpoints = []; let pending = null, closing = false;
  const report = () => ({ scope: "bounded-loaded-save-error-lifecycle-allocation-diagnostic", limits: LIFECYCLE_LIMITS,
    checkpoints, maximumPending: 1, queuedRequests: 0, perturbsMemory: true, acceptanceMetric: false,
    noForcedGc: true, noEngineChanges: true, summedAllocatorTotal: null });
  return {
    async capture(phase) {
      assert.equal(closing, false); assert.equal(pending, null, "Never queue or overlap lifecycle traces");
      assert.match(phase, /^[a-z0-9-]{1,64}$/); assert.ok(checkpoints.length < LIFECYCLE_LIMITS.checkpoints);
      const row = { phase, startedAt: new Date().toISOString(), finishedAt: null, processes: null, realms: null,
        state: null, summary: null, rawArchive: null, error: null, detached: false };
      checkpoints.push(row);
      pending = (async () => {
        let session, tracing = false;
        try {
          row.processes = await getProcesses(); row.realms = await getRealms(); row.state = await getState();
          session = await createSession();
          await timed(session.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: {
            recordMode: "recordUntilFull", traceBufferSizeInKb: LIFECYCLE_LIMITS.chromiumBufferKiB,
            includedCategories: ["disabled-by-default-memory-infra"], excludedCategories: ["*"],
            memoryDumpConfig: { allowed_dump_modes: ["light"], triggers: [] } } })); tracing = true;
          const reply = await timed(session.send("Tracing.requestMemoryDump", { levelOfDetail: "light", deterministic: false }));
          const completed = new Promise(resolve => session.once("Tracing.tracingComplete", resolve));
          await timed(session.send("Tracing.end")); tracing = false;
          const result = await timed(completed); assert.equal(result.dataLossOccurred, false); assert.ok(result.stream);
          const chunks = []; let bytes = 0;
          try {
            for (;;) {
              const chunk = await timed(session.send("IO.read", { handle: result.stream, size: LIFECYCLE_LIMITS.readBytes }));
              const data = Buffer.from(chunk.data, chunk.base64Encoded ? "base64" : "utf8");
              assert.ok(data.length <= LIFECYCLE_LIMITS.readBytes); bytes += data.length; assert.ok(bytes <= LIFECYCLE_LIMITS.serializedBytes);
              chunks.push(data); if (chunk.eof) break;
            }
          } finally { await timed(session.send("IO.close", { handle: result.stream })); }
          const raw = Buffer.concat(chunks), zip = gzipSync(raw, { level: 9 }); assert.ok(zip.length <= LIFECYCLE_LIMITS.compressedBytes);
          const file = reportBase + `-lifecycle-${checkpoints.length}-${phase}.json.gz`;
          await writeFile(file, zip, { flag: "wx" });
          row.rawArchive = { path: path.relative(root, file).replaceAll(path.sep, "/"), bytes: zip.length, sha256: sha(zip), restoredBytes: raw.length, restoredSha256: sha(raw) };
          row.summary = summarizeLifecycleTrace(JSON.parse(raw), reply, row.processes);
        } catch (error) { row.error = String(error).slice(0, 1024); }
        finally {
          try { if (tracing) await timed(session.send("Tracing.end")); }
          catch (error) { row.error ??= String(error).slice(0, 1024); }
          try { if (session) { await timed(session.detach()); row.detached = true; } }
          catch (error) { row.error ??= String(error).slice(0, 1024); }
          row.finishedAt = new Date().toISOString();
        }
        return row;
      })();
      try { return await pending; } finally { pending = null; }
    },
    async settle() { if (pending) await pending; },
    async close() { closing = true; if (pending) await pending; return report(); },
    report,
  };
}
