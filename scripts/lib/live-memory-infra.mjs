// Private, live diagnostic. These overlapping counters are not acceptance or allocation stacks.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { summarizeMemoryInfraTrace, traceHexBytes } from "./memory-infra-attribution.mjs";
export const LIVE_MEMORY_LIMITS = Object.freeze({ traceBufferKiB: 4096, maximumTraceBytes: 8388608,
  readBytes: 262144, maximumAllocatorsPerProcess: 8192, maximumSummaryBytes: 2097152, maximumCaptureMs: 15000 });
const sha = value => createHash("sha256").update(value).digest("hex");
export function summarizeLiveMemory(trace, rows) {
  const basic = summarizeMemoryInfraTrace(trace, rows);
  for (const row of basic) {
    const [start, end] = row.traceIntervalMicroseconds;
    for (const process of row.processes) {
      const counters = {};
      for (const event of trace.traceEvents.filter(e => e.pid === process.pid && e.ph === "v" && e.ts >= start && e.ts <= end)) {
        for (const [name, allocator] of Object.entries(event.args?.dumps?.allocators ?? {})) {
          assert.ok(name.length <= 512);
          if (!/^(?:v8|malloc|partition_alloc|blink_gc|skia|gpu|shared_memory)(?:\/|$)/.test(name)) continue;
          counters[name] = Object.fromEntries(Object.entries(allocator.attrs ?? {})
            .filter(([, attr]) => attr.type === "scalar" && attr.units === "bytes")
            .map(([key, attr]) => [key, traceHexBytes(attr.value)]));
          assert.ok(Object.keys(counters).length <= LIVE_MEMORY_LIMITS.maximumAllocatorsPerProcess);
        }
      }
      process.liveAllocatorCounters = counters;
    }
  }
  assert.ok(Buffer.byteLength(JSON.stringify(basic)) <= LIVE_MEMORY_LIMITS.maximumSummaryBytes);
  return basic;
}
export async function captureLiveMemoryInfra({ session, phase, processes, archivePath }) {
  assert.match(phase, /^[a-z0-9-]{1,96}$/);
  const row = { phase, timestamp: new Date().toISOString(), processes, memoryDump: null };
  let started = false, timer, stream = null;
  const operation = (async () => {
    await session.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: {
      recordMode: "recordUntilFull", traceBufferSizeInKb: LIVE_MEMORY_LIMITS.traceBufferKiB,
      includedCategories: ["disabled-by-default-memory-infra"], excludedCategories: ["*"],
      memoryDumpConfig: { allowed_dump_modes: ["light"], triggers: [] } } }); started = true;
    try { row.memoryDump = await session.send("Tracing.requestMemoryDump", { levelOfDetail: "light", deterministic: false }); }
    finally {
      const complete = new Promise(resolve => session.once("Tracing.tracingComplete", resolve));
      await session.send("Tracing.end"); started = false;
      const end = await complete; stream = end.stream;
      assert.equal(end.dataLossOccurred, false); assert.ok(stream);
    }
    assert.equal(row.memoryDump?.success, true);
    const chunks = []; let bytes = 0;
    for (;;) {
      const reply = await session.send("IO.read", { handle: stream, size: LIVE_MEMORY_LIMITS.readBytes });
      const data = Buffer.from(reply.data, reply.base64Encoded ? "base64" : "utf8");
      assert.ok(data.length <= LIVE_MEMORY_LIMITS.readBytes); bytes += data.length;
      assert.ok(bytes <= LIVE_MEMORY_LIMITS.maximumTraceBytes, "Fail rather than truncate diagnostic trace");
      chunks.push(data); if (reply.eof) break;
    }
    const raw = Buffer.concat(chunks), trace = JSON.parse(raw), summary = summarizeLiveMemory(trace, [row]);
    const archive = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(archive), raw);
    await writeFile(archivePath, archive, { flag: "wx" }); assert.equal(sha(gunzipSync(await readFile(archivePath))), sha(raw));
    row.finishedAt = new Date().toISOString();
    return { status: "captured-live-light-memory-diagnostic", row, summary,
      archive: { path: archivePath, bytes: archive.length, sha256: sha(archive), restoredBytes: raw.length, restoredSha256: sha(raw) },
      limits: LIVE_MEMORY_LIMITS, dataLossOccurred: false, perturbsMemory: true,
      allocationStackAttribution: false, acceptanceMetric: false, summedAllocatorTotal: null };
  })();
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Live memory diagnostic deadline")), LIVE_MEMORY_LIMITS.maximumCaptureMs);
    })]);
  } finally {
    clearTimeout(timer);
    // A deadline never leaves a live tracing producer or open stream intentionally.
    if (started) await session.send("Tracing.end").catch(() => {});
    if (stream) await session.send("IO.close", { handle: stream }).catch(() => {});
    await session.detach();
    await operation.catch(() => {});
  }
}
