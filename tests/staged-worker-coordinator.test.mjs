import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "..");
const bundle = await build({ stdin: { contents: 'export { StagedWorkerCoordinator } from "./lib/staged-worker-coordinator.ts"; export { validateStagedCopyHandoff } from "./lib/staged-copy-protocol.ts";',
  loader: "ts", resolveDir: root }, bundle: true, format: "esm", platform: "node", write: false });
const { StagedWorkerCoordinator, validateStagedCopyHandoff } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
if (!globalThis.ErrorEvent) globalThis.ErrorEvent = class extends Event { constructor(type, options) { super(type, options); this.message = options.message; } };
class FakeWorker {
  onmessage = null; onerror = null; onmessageerror = null; messages = []; terminated = false;
  postMessage(message) { if (this.terminated) throw new Error("Retired worker used"); this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage?.(new MessageEvent("message", { data })); }
}
const metrics = () => ({ inputBytes: 100, outputBytes: 0, queuedBytes: 0, peakQueuedBytes: 65536, pendingOperations: 0,
  peakPendingOperations: 1, maxReadChunkBytes: 65536, maxWriteChunkBytes: 65536, elapsedMs: 100,
  scratchBytes: 5000000, peakScratchBytes: 5000000, wasmMemoryBytes: 50331648, peakWasmMemoryBytes: 50331648,
  wasmMemories: {}, sharedArrayBufferBytes: 50331652, activeWorkerCount: 1, imageWorkingBytes: 0 });
function start(jobId = "job-1", profileId = "mkv-to-mp4") {
  return { type: "start", jobId, profileId, file: { size: 100 },
    destination: { mode: "staged-handle", handle: { chosen: jobId }, stagingName: `within-stage-${profileId}-${jobId}` },
    cancellationBuffer: new SharedArrayBuffer(4) };
}
const handoff = request => ({ type: "staged-copy-handoff", jobId: request.jobId, profileId: request.profileId,
  stagingName: request.destination.stagingName, stageClosed: true, jobStartedEpochMs: performance.timeOrigin + performance.now() - 100, metrics: metrics() });
const staticCode = () => ({ module: new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])), sha256: "a".repeat(64), byteLength: 8 });
function fixture(options = {}) {
  const encoders = [], savers = [], events = [], errors = [];
  const owner = new StagedWorkerCoordinator(() => { const worker = new FakeWorker(); encoders.push(worker); return worker; }, () => {
    assert.equal(encoders.at(-1).terminated, true, "Retire codec before creating saver");
    if (options.failSaveFactory) throw new Error("Save startup failure");
    const worker = new FakeWorker(); savers.push(worker); return worker;
  });
  owner.onmessage = ({ data }) => events.push(data); owner.onerror = event => errors.push(event.message);
  return { owner, encoders, savers, events, errors };
}
test("only closed stage transfers, original codec worker is retired first, no source File or heaps enter saver", () => {
  const f = fixture(), request = start(); f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(request);
  const value = handoff(request); value.handle = { attacker: true }; f.encoders[0].emit(value);
  assert.equal(f.encoders[0].terminated, true); assert.equal(f.savers.length, 1); assert.deepEqual(f.savers[0].messages, []);
  f.savers[0].emit({ type: "ready" }); const copy = f.savers[0].messages[0];
  assert.equal(copy.type, "copy-staged"); assert.equal(copy.handle, request.destination.handle);
  assert.equal(copy.file, undefined); assert.equal(copy.cancellationBuffer.byteLength, 4);
  assert.equal(f.events.some(row => row.type === "complete"), false); assert.equal(f.events.some(row => row.type === "staged-copy-handoff"), false);
  f.savers[0].emit({ type: "complete", jobId: request.jobId, metrics: metrics() });
  assert.equal(f.events.at(-1).type, "complete"); f.owner.terminate(); assert.equal(f.savers[0].terminated, true);
});

test("one private static module survives codec retirement, never reaches saver/UI and is cleared on disposal", () => {
  const f = fixture(), first = start("vpx1", "mkv-vp8-to-mp4-mpeg4"), core = staticCode();
  f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(first);
  f.encoders[0].emit({ type: "vpx-compiled-core", jobId: first.jobId, core });
  assert.equal(f.events.some(x => x.type === "vpx-compiled-core"), false);
  f.encoders[0].emit(handoff(first)); f.savers[0].emit({ type: "ready" });
  assert.equal(f.savers[0].messages[0].vpxCompiledCore, undefined);
  f.savers[0].emit({ type: "complete", jobId: first.jobId, metrics: metrics() });
  const second = start("vpx2", "mkv-vp9-to-mp4-mpeg4"); f.owner.postMessage(second); f.encoders[1].emit({ type: "ready" });
  const forwarded = f.encoders[1].messages[0]; assert.equal(forwarded.vpxCompiledCore.sha256, core.sha256);
  assert.ok(forwarded.vpxCompiledCore.module instanceof WebAssembly.Module);
  f.owner.terminate(); assert.equal(f.owner.vpxCompiledCore, null);
});

test("caller-owned, foreign, duplicated and payload-bearing static code handoffs fail closed", () => {
  for (const mutate of [v => { v.jobId = "foreign"; }, v => { v.file = new File(["x"], "not-code"); },
    v => { v.core = { ...v.core, output: new Uint8Array(1) }; }, v => { v.core.module = new WebAssembly.Memory({ initial: 1 }); }]) {
    const f = fixture(), job = start("vpx", "mkv-vp8-to-mp4-mpeg4"); f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(job);
    const value = { type: "vpx-compiled-core", jobId: job.jobId, core: staticCode() }; mutate(value); f.encoders[0].emit(value);
    assert.equal(f.errors.length, 1); assert.equal(f.encoders[0].terminated, true); f.owner.terminate();
  }
  const f = fixture(), job = start("vpx", "mkv-vp8-to-mp4-mpeg4"); f.encoders[0].emit({ type: "ready" });
  assert.throws(() => f.owner.postMessage({ ...job, vpxCompiledCore: staticCode() }), /owned by the coordinator/);
  f.owner.postMessage(job); const value = { type: "vpx-compiled-core", jobId: job.jobId, core: staticCode() };
  f.encoders[0].emit(value); f.encoders[0].emit(value); assert.equal(f.errors.length, 1); f.owner.terminate();
});
test("handoff queue is one descriptor; cancellation during save startup is forwarded before normal work advances", () => {
  const f = fixture(), request = start(); f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(request); f.encoders[0].emit(handoff(request));
  Atomics.store(new Int32Array(request.cancellationBuffer), 0, 1); f.owner.postMessage({ type: "cancel", jobId: request.jobId });
  assert.throws(() => f.owner.postMessage(start("other")), /Only one/);
  f.savers[0].emit({ type: "ready" }); assert.deepEqual(f.savers[0].messages.map(m => m.type), ["copy-staged", "cancel"]);
  assert.equal(Atomics.load(new Int32Array(f.savers[0].messages[0].cancellationBuffer), 0), 1); f.owner.terminate();
});
test("batch next input gets a fresh codec worker after save completion, with a cloned bounded startup message", () => {
  const f = fixture(), first = start(); f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(first); f.encoders[0].emit(handoff(first)); f.savers[0].emit({ type: "ready" });
  f.savers[0].emit({ type: "complete", jobId: first.jobId, metrics: metrics() });
  const second = start("job-2"); f.owner.postMessage(second); second.destination.stagingName = "changed-after-post";
  assert.equal(f.savers[0].terminated, true); assert.equal(f.encoders.length, 2); assert.equal(f.encoders[1].messages.length, 0);
  f.encoders[1].emit({ type: "ready" }); assert.equal(f.encoders[1].messages[0].destination.stagingName, "within-stage-mkv-to-mp4-job-2"); f.owner.terminate();
});
test("late messages from retired codec worker cannot prematurely finish or mutate current save", () => {
  const f = fixture(), request = start(); f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(request);
  const stale = f.encoders[0].onmessage; f.encoders[0].emit(handoff(request));
  stale(new MessageEvent("message", { data: { type: "complete", jobId: request.jobId, metrics: metrics() } }));
  assert.equal(f.events.some(row => row.type === "complete"), false); assert.equal(f.errors.length, 0); f.owner.terminate();
});
test("unclosed, mismatched, traversal, queued-byte or hidden-payload handoffs are rejected before a saver opens", () => {
  for (const mutate of [v => { v.stageClosed = false; }, v => { v.jobId = "other"; }, v => { v.profileId = "other"; },
    v => { v.stagingName = "../test.mkv"; }, v => { v.metrics.queuedBytes = 1; }, v => { v.metrics.scratchBytes = 0; },
    v => { v.metrics.extra = new Uint8Array(8); }, v => { v.metrics.elapsedMs = NaN; }]) {
    const f = fixture(), request = start(); f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(request);
    const changed = handoff(request); mutate(changed); f.encoders[0].emit(changed);
    assert.equal(f.savers.length, 0); assert.equal(f.errors.length, 1); assert.equal(f.encoders[0].terminated, true); f.owner.terminate();
  }
});
test("save startup failure is surfaced and all active worker/queued references are released", () => {
  const f = fixture({ failSaveFactory: true }), request = start(); f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(request); f.encoders[0].emit(handoff(request));
  assert.deepEqual(f.errors, ["Save startup failure"]); assert.equal(f.events.some(row => row.type === "complete"), false); f.owner.terminate(); f.owner.terminate();
  assert.throws(() => f.owner.postMessage(start()), /closed/);
});
test("non-staged routes pass through unchanged and a malformed pending start does not reserve the lifecycle", () => {
  const f = fixture(), bad = start(); bad.destination.handle.uncloneable = () => {};
  assert.throws(() => f.owner.postMessage(bad), { name: "DataCloneError" });
  const request = start(); request.destination = { mode: "opfs-test", name: "owned-output" };
  f.owner.postMessage(request); f.encoders[0].emit({ type: "ready" }); assert.equal(f.encoders[0].messages.length, 1);
  f.encoders[0].emit({ type: "complete", jobId: request.jobId, metrics: metrics() }); assert.equal(f.savers.length, 0); f.owner.terminate();
});
test("handoff validation preserves exact selected handle and rejects invalid cancellation backing", () => {
  const request = start(), job = { ...request, sourceBytes: request.file.size };
  assert.equal(validateStagedCopyHandoff(handoff(request), job, performance.timeOrigin + performance.now()).handle, request.destination.handle);
  assert.throws(() => validateStagedCopyHandoff(handoff(request), { ...job, cancellationBuffer: new SharedArrayBuffer(8) }, performance.timeOrigin + performance.now()));
});

test("MPEG-2 owns the exact closed stage and retires the encoder before save; cross-profile and cross-job handoffs fail", () => {
  for (const terminal of ["complete", "cancelled", "error"]) {
    const f = fixture(), request = start("mpeg-job", "mkv-to-mp4-mpeg2");
    f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(request); f.encoders[0].emit(handoff(request));
    assert.equal(f.encoders[0].terminated, true); f.savers[0].emit({ type: "ready" });
    assert.equal(f.savers[0].messages[0].profileId, request.profileId);
    assert.equal(f.savers[0].messages[0].file, undefined);
    f.savers[0].emit({ type: terminal, jobId: request.jobId, metrics: metrics() });
    assert.equal(f.events.at(-1).type, terminal); f.owner.terminate();
  }
  for (const change of [v => { v.profileId = "mkv-to-mp4"; }, v => { v.stagingName += "-other"; },
    v => { v.jobId = "other"; }, v => { v.stageClosed = false; }]) {
    const f = fixture(), request = start("mpeg-job", "mkv-to-mp4-mpeg2");
    f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(request);
    const value = handoff(request); change(value); f.encoders[0].emit(value);
    assert.equal(f.savers.length, 0); assert.equal(f.errors.length, 1); f.owner.terminate();
  }
});

test("both private VPX profiles retain exact stage ownership and retire codec before a Wasm-free saver", () => {
  for (const profileId of ["mkv-vp8-to-mp4-mpeg4", "mkv-vp9-to-mp4-mpeg4"]) {
    const f = fixture(), request = start("vpx-job", profileId);
    f.encoders[0].emit({ type: "ready" }); f.owner.postMessage(request); f.encoders[0].emit(handoff(request));
    assert.equal(f.encoders[0].terminated, true); assert.equal(f.savers.length, 1);
    f.savers[0].emit({ type: "ready" }); assert.equal(f.savers[0].messages[0].profileId, profileId);
    assert.equal(f.savers[0].messages[0].file, undefined); f.owner.terminate();
  }
});
