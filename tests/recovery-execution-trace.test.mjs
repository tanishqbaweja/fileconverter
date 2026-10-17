import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createRecoveryExecutionTrace, summarizeRecoveryExecution, RECOVERY_TRACE_LIMITS, verifyExplicitRecoveryCategories } from "../scripts/lib/recovery-execution-trace.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root = process.cwd();
test("empty category discovery can use only the exact revision's genuine event capability proof", async () => {
  const version = { product: "Chrome/155.0.8059.80", revision: "@43a195105613ac83c21d3f14de279f4a045c7da0", jsVersion: "15.5.35.23" };
  const result = await verifyExplicitRecoveryCategories(root, version); assert.equal(result.discoveryListEmpty, true); assert.ok(result.actualWasmEvents > 0);
  await assert.rejects(verifyExplicitRecoveryCategories(root, { ...version, revision: "different" }));
  await assert.rejects(verifyExplicitRecoveryCategories(root, { ...version, jsVersion: "different" }));
});
test("event summary retains PID/thread/compiler/GC evidence but never invents allocation bytes", () => {
  const result = summarizeRecoveryExecution({ traceEvents: [
    { ph: "M", pid: 10, tid: 11, name: "thread_name", args: { name: "V8 Worker" } },
    { ph: "X", pid: 10, tid: 11, cat: "v8.wasm", name: "wasm.CompileLazy", ts: 100, dur: 25, args: { func_index: 42 } },
    { ph: "X", pid: 10, tid: 11, cat: "v8.wasm", name: "wasm.CompileLazy", ts: 200, dur: 10, args: { func_index: 77 } },
  ] });
  assert.equal(result.groups.length, 1); assert.equal(result.groups[0].count, 2); assert.equal(result.groups[0].durationUs, 35);
  assert.deepEqual(result.groups[0].numericArguments.func_index, { minimum: 42, maximum: 77 });
  assert.equal(result.exactAllocationBytes, false); assert.equal(result.allocationCauseProven, false);
  assert.throws(() => summarizeRecoveryExecution({ traceEvents: Array(RECOVERY_TRACE_LIMITS.events + 1).fill({}) }));
});
test("single trace is capped/archived/stopped/detached before another profiler; budget note never sends a command", async () => {
  const runtime = await createOwnedRuntimeScratch("recovery-trace-unit-");
  const base = path.join(root, "outputs/reports", path.basename(runtime.directory)), commands = [];
  const session = new EventEmitter(); let detached = false;
  const raw = JSON.stringify({ traceEvents: [{ ph: "X", pid: 10, tid: 11, cat: "v8.wasm", name: "wasm.CompileLazy", ts: 100, dur: 5 }] });
  session.send = async (method) => {
    commands.push(method);
    if (method === "Browser.getVersion") return { product: "UNIT_ONLY" };
    if (method === "Tracing.getCategories") return { categories: ["v8.wasm"] };
    if (method === "Tracing.end") queueMicrotask(() => session.emit("Tracing.tracingComplete", { stream: "unit", dataLossOccurred: false }));
    if (method === "IO.read") return { data: raw, eof: true };
    return {};
  };
  session.detach = async () => { detached = true; };
  const trace = createRecoveryExecutionTrace({ root, reportBase: base, createSession: async () => session });
  let archive;
  try {
    await trace.start(); assert.throws(() => trace.start()); const before = commands.length;
    trace.noteBudgetFailure({ after: { timestamp: "UNIT_ONLY", sequence: 2, privateBytes: 123 } }); assert.equal(commands.length, before);
    const [a, b] = await Promise.all([trace.stop("after-production-cancel"), trace.stop()]); archive = a.rawArchive.path;
    assert.equal(a, b); assert.equal(a.error, null); assert.equal(detached, true);
    assert.equal(a.bufferUsageMaximum, null); assert.equal(session.listenerCount("Tracing.bufferUsage"), 0);
    assert.equal(commands.filter(method => method === "Tracing.end").length, 1); assert.equal(commands.filter(method => method === "IO.close").length, 1);
    assert.equal(gunzipSync(await readFile(archive)).toString(), raw); assert.equal(a.summary.groups[0].name, "wasm.CompileLazy");
  } finally {
    const { rm } = await import("node:fs/promises"); if (archive) await rm(archive); await runtime.close();
  }
});
