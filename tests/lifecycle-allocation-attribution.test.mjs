import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { summarizeLifecycleTrace, createLifecycleAttribution } from "../scripts/lib/lifecycle-allocation-attribution.mjs";
const trace = () => ({ traceEvents: [
  { name: "process_name", pid: 1, args: { name: "Renderer" } },
  { name: "GlobalMemoryDump", ph: "b", pid: 2, id2: { local: "request" }, ts: 10, args: { dump_guid: "actual" } },
  { ph: "v", pid: 1, ts: 11, args: { dumps: { allocators: { "v8/main/malloc": { attrs: { size: { type: "scalar", units: "bytes", value: "1000" } } },
    malloc: { attrs: {} }, "blink_gc/main/allocated_objects/private-name": { attrs: {} } } } } },
  { name: "GlobalMemoryDump", ph: "e", pid: 2, id2: { local: "request" }, ts: 12 },
] });
test("real GUID interval selects deep V8 allocator bytes, no overlapping sum or invented zero", () => {
  const value = summarizeLifecycleTrace(trace(), { success: true, dumpGuid: "actual" }, [{ pid: 1, createdAt: "birth" }]);
  assert.equal(value.processes[0].allocators["v8/main/malloc"].size, 4096);
  assert.equal(value.processes[0].privateFootprintBytes, null); assert.equal(value.summedAllocatorTotal, null);
  assert.equal(Object.keys(value.processes[0].allocators).length, 2);
  assert.throws(() => summarizeLifecycleTrace(trace(), { success: true, dumpGuid: "unrelated" }, []));
  assert.throws(() => summarizeLifecycleTrace(trace(), { success: false, dumpGuid: "actual" }, []));
});
test("trace failure detaches, one pending operation rejects overlap, settle waits for closure", async () => {
  let release, detach = 0; const barrier = new Promise(resolve => { release = resolve; });
  const session = new EventEmitter(); session.send = async () => { throw new Error("injected trace error"); }; session.detach = async () => { detach++; };
  const observer = createLifecycleAttribution({ root: "H:\\repo", reportBase: "H:\\repo\\outputs\\reports\\test",
    createSession: async () => session, getProcesses: async () => { await barrier; return []; }, getRealms: async () => ({}), getState: async () => ({}) });
  const first = observer.capture("loaded"); await assert.rejects(observer.capture("overlap"));
  let settled = false; const waiting = observer.settle().then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false); release(); await first; await waiting;
  const result = await observer.close(); assert.equal(detach, 1); assert.equal(result.maximumPending, 1);
  assert.match(result.checkpoints[0].error, /injected trace error/); assert.equal(result.checkpoints[0].detached, true);
  assert.equal(result.acceptanceMetric, false); await assert.rejects(observer.capture("closed"));
});
