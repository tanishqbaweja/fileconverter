// Private, live diagnostic. These overlapping counters are not acceptance or allocation stacks.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { summarizeMemoryInfraTrace, traceHexBytes } from "./memory-infra-attribution.mjs";
export const LIVE_MEMORY_LIMITS = Object.freeze({ traceBufferKiB: 4096, maximumTraceBytes: 8388608,
  readBytes: 262144, maximumAllocatorsPerProcess: 8192, maximumSummaryBytes: 2097152, maximumCaptureMs: 15000,
  maximumDuringWorkDumps: 4, duringWorkIntervalMs: 80 });
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
/** @param {{ session: any, phase: string, processes: any, archivePath: string, during?: () => Promise<unknown>, captureMs?: number, wasmCompilation?: boolean }} options */
export async function captureLiveMemoryInfra({ session, phase, processes, archivePath, during = undefined,
  captureMs = LIVE_MEMORY_LIMITS.maximumCaptureMs, wasmCompilation = false }) {
  assert.match(phase, /^[a-z0-9-]{1,96}$/);
  assert.equal(typeof wasmCompilation, "boolean");
  assert.ok(Number.isFinite(captureMs) && captureMs > 0 && captureMs <= LIVE_MEMORY_LIMITS.maximumCaptureMs);
  const row = { phase, timestamp: new Date().toISOString(), processes, memoryDump: null };
  const rows = []; let dumpTimer, dumpPending = Promise.resolve(), dumpBusy = false, dumpFailure = null, workRunning = false;
  const requestDump = async () => {
    const current = during ? { phase: phase + "-" + (rows.length + 1), timestamp: new Date().toISOString(), processes,
      workRunningAtRequest: workRunning, memoryDump: null } : row;
    rows.push(current);
    current.memoryDump = await session.send("Tracing.requestMemoryDump", { levelOfDetail: "light", deterministic: false });
    current.finishedAt = new Date().toISOString(); assert.equal(current.memoryDump?.success, true);
  };
  let started = false, timer, stream = null, completionHandler, abandoned = false;
  const operation = (async () => {
    await session.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: {
      recordMode: "recordUntilFull", traceBufferSizeInKb: LIVE_MEMORY_LIMITS.traceBufferKiB,
      includedCategories: ["disabled-by-default-memory-infra", ...(wasmCompilation ? ["v8.wasm", "v8.wasm.detailed"] : [])], excludedCategories: ["*"],
      memoryDumpConfig: { allowed_dump_modes: ["light"], triggers: [] } } }); started = true;
    try {
      if (during) {
        assert.equal(typeof during, "function"); workRunning = true;
        dumpTimer = setInterval(() => {
          if (dumpBusy || rows.length >= LIVE_MEMORY_LIMITS.maximumDuringWorkDumps) return;
          dumpBusy = true;
          dumpPending = requestDump().catch(error => { dumpFailure ??= error; }).finally(() => { dumpBusy = false; });
        }, LIVE_MEMORY_LIMITS.duringWorkIntervalMs);
        try { await during(); }
        finally { workRunning = false; clearInterval(dumpTimer); await dumpPending; }
        if (dumpFailure) throw dumpFailure;
        if (!rows.length) await requestDump(); // Explicitly marked post-work, never called an active-work sample.
      } else await requestDump();
    }
    finally {
      const complete = new Promise(resolve => { completionHandler = resolve; session.once("Tracing.tracingComplete", completionHandler); });
      await session.send("Tracing.end"); started = false;
      const end = await complete; stream = end.stream;
      assert.equal(end.dataLossOccurred, false); assert.ok(stream);
    }
    assert.ok(rows.length >= 1 && rows.length <= LIVE_MEMORY_LIMITS.maximumDuringWorkDumps);
    assert.equal(abandoned, false, "Closed diagnostic must not begin trace export");
    const chunks = []; let bytes = 0;
    for (;;) {
      const reply = await session.send("IO.read", { handle: stream, size: LIVE_MEMORY_LIMITS.readBytes });
      assert.equal(abandoned, false, "Closed diagnostic must not continue trace export");
      const data = Buffer.from(reply.data, reply.base64Encoded ? "base64" : "utf8");
      assert.ok(data.length <= LIVE_MEMORY_LIMITS.readBytes); bytes += data.length;
      assert.ok(bytes <= LIVE_MEMORY_LIMITS.maximumTraceBytes, "Fail rather than truncate diagnostic trace");
      chunks.push(data); if (reply.eof) break;
    }
    const raw = Buffer.concat(chunks), trace = JSON.parse(raw), summary = summarizeLiveMemory(trace, rows);
    const archive = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(archive), raw);
    await writeFile(archivePath, archive, { flag: "wx" }); assert.equal(sha(gunzipSync(await readFile(archivePath))), sha(raw));
    row.finishedAt = new Date().toISOString();
    return { status: "captured-live-light-memory-diagnostic", row: rows[0], rows, summary,
      archive: { path: archivePath, bytes: archive.length, sha256: sha(archive), restoredBytes: raw.length, restoredSha256: sha(raw) },
      limits: LIVE_MEMORY_LIMITS, dataLossOccurred: false, perturbsMemory: true,
      allocationStackAttribution: false, wasmCompilationEventsIncluded: wasmCompilation,
      acceptanceMetric: false, summedAllocatorTotal: null };
  })();
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Live memory diagnostic deadline")), captureMs);
    })]);
  } finally {
    abandoned = true; clearTimeout(timer); clearInterval(dumpTimer);
    if (completionHandler) session.off("Tracing.tracingComplete", completionHandler);
    // A deadline never leaves a live tracing producer or open stream intentionally.
    if (started) await session.send("Tracing.end").catch(() => {});
    if (stream) await session.send("IO.close", { handle: stream }).catch(() => {});
    await session.detach();
    let cleanupTimer;
    try { await Promise.race([operation.catch(() => {}), new Promise(resolve => { cleanupTimer = setTimeout(resolve, 500); })]); }
    finally { clearTimeout(cleanupTimer); }
  }
}
