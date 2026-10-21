import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
const compiled = await build({ entryPoints: ["lib/vpx-decoder-policy.ts", "lib/media-native-arguments.ts", "workers/vpx-core-loader.ts",
  "lib/vpx-qualification-job.ts", "workers/media-remux.ts"], bundle: true, format: "esm", platform: "node", outdir: "unused", write: false });
const load = async name => import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles.find(file => file.path.endsWith(name + ".js")).contents).toString("base64"));
const policy = await load("vpx-decoder-policy"), { mediaNativeArguments } = await load("media-native-arguments");
const { loadVpxDecoderCore } = await load("vpx-core-loader"), { runMediaRemux } = await load("media-remux");
const { runVpxQualificationJob, validateVpxQualificationRequest } = await load("vpx-qualification-job");
const video = { codec: "mpeg4", maxWidth: 320, bitRateBps: 4_000_000, frameRateFps: 15, quality: "balanced" };
test("VPX source profiles are private, source-specific and quota-planned from inspected duration and chosen settings", () => {
  for (const [index, codec] of ["VP8", "VP9"].entries()) {
    const profile = policy.VPX_JOB_PROFILES[index]; assert.equal(policy.isVpxDecoderProfile(profile), true);
    assert.equal(policy.assertVpxSource(profile, { codec }), codec);
    assert.throws(() => policy.assertVpxSource(profile, { codec: "AV1" }));
  }
  assert.equal(policy.isVpxDecoderProfile("mkv-to-mp4"), false);
  assert.equal(policy.estimateVpxStageBytes(1000, 2, video), 1000 + 1_250_000 + 16_777_216);
  for (const [size, duration] of [[0, 2], [1, null], [1, 0], [1, Infinity], [1.5, 2], [Number.MAX_SAFE_INTEGER, 10]]) assert.throws(() => policy.estimateVpxStageBytes(size, duration, video));
  assert.throws(() => policy.validateVpxVideoOptions({ codec: "aac" }, video));
  for (const mutation of [{ codec: "vp9" }, { maxWidth: 1920 }, { frameRateFps: 60 }, { bitRateBps: 5_000_000 }]) assert.throws(() => policy.validateVpxVideoOptions(undefined, { ...video, ...mutation }));
});
test("general12 and specialist9 argument layouts preserve every nondefault video option without shifting into audio", () => {
  const values = [3, 320, 4_000_000, 15, 2];
  assert.deepEqual(mediaNativeArguments(4, [0, 0, 0], [0, 0, 0], values, "general-12"), [4, 0, 0, 0, 0, 0, 0, ...values]);
  assert.deepEqual(mediaNativeArguments(4, [0, 0, 0], [0, 0, 0], values, "legacy-specialist-9"), [4, 0, 0, 0, ...values]);
  assert.throws(() => mediaNativeArguments(4, [0, 0, 0], [1, 0, 0], values, "legacy-specialist-9"));
  assert.throws(() => mediaNativeArguments(4, [0], [0, 0, 0], values, "general-12"));
  assert.throws(() => mediaNativeArguments(4, [0, 0, 0], [0, 0, 0], [3, NaN, 0, 0, 0], "general-12"));
  assert.throws(() => mediaNativeArguments(41, [0, 0, 0], [0, 0, 0], values, "general-12"));
});
test("private decoder factory loads only canonical assets and never instantiates or silently falls back during loading", async () => {
  const calls = [], factory = () => { throw new Error("Not instantiated at load"); };
  const core = await loadVpxDecoderCore("VP9", async url => { calls.push(url); return { default: factory }; });
  assert.deepEqual(calls, ["/engines/vpx/within-remux.mjs"]); assert.equal(core.abi, "general-12");
  assert.equal(core.factory, factory); assert.equal(core.wasmUrl, "/engines/vpx/within-remux.wasm");
  await assert.rejects(loadVpxDecoderCore("AV1"), /invalid/);
  await assert.rejects(loadVpxDecoderCore("VP8", async () => { throw new Error("404"); }), /not installed/);
  await assert.rejects(loadVpxDecoderCore("VP8", async () => ({ default: {} })), /native factory/);
});
test("actual production AVIO runtime selects private factory/general ABI and bounded writes (mock codec, not conversion proof)", async () => {
  let observed; const writes = [], phases = [];
  const core = await loadVpxDecoderCore("VP9", async () => ({ default: async options => ({
    async ccall(name, result, types, args) {
      observed = { name, result, types, args, wasmUrl: options.locateFile("within-remux.wasm") };
      options.withinBridge.progress({ inputPosition: 4, outputSize: 0, mediaTimeUs: 0, durationUs: 1_000_000, wasmMemoryBytes: 33_554_432 });
      await options.withinBridge.write(0, new Uint8Array([1, 2, 3, 4])); return 0;
    },
  }) }));
  const metrics = { inputBytes: 0, outputBytes: 0, queuedBytes: 0, peakQueuedBytes: 0, pendingOperations: 0, peakPendingOperations: 0,
    maxReadChunkBytes: 0, maxWriteChunkBytes: 0, elapsedMs: 0, sharedArrayBufferBytes: 4 };
  await runMediaRemux({ file: new File(["data"], "fixture.mkv"), profileId: policy.VPX_JOB_PROFILES[1], remuxProfile: 4, vpxDecoderCore: core,
    forceAsynchronousInput: true, videoOptions: video, jobId: "job-1", metrics, startedAt: performance.now(), isCancelled: () => false,
    writable: { async write(operation) { writes.push([...operation.data]); }, async truncate() {}, async flush() {} },
    emitProgress: (_id, phase) => phases.push(phase), post() {} });
  assert.equal(observed.args.length, 12); assert.deepEqual(observed.args.slice(0, 7), [4, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(observed.args.slice(8), [320, 4_000_000, 15, 2]);
  assert.equal(observed.wasmUrl, "/engines/vpx/within-remux.wasm"); assert.equal(metrics.activeWorkerCount, 1);
  assert.deepEqual(writes, [[1, 2, 3, 4]]); assert.equal(metrics.peakPendingOperations, 1);
  assert.ok(phases.includes("Decoding VP9 (CPU) / encoding MPEG-4 MP4"));
});
class ObservedWorker extends EventTarget {
  listeners = 0; requests = [];
  addEventListener(...args) { this.listeners++; super.addEventListener(...args); }
  removeEventListener(...args) { this.listeners--; super.removeEventListener(...args); }
  postMessage(value) { this.requests.push(value); }
  emit(data) { this.dispatchEvent(new MessageEvent("message", { data })); }
}
const request = () => ({ type: "start", jobId: "job-1", profileId: policy.VPX_JOB_PROFILES[0], file: new File(["fixture"], "source.mkv"),
  destination: { mode: "staged-handle", handle: {}, stagingName: `within-stage-${policy.VPX_JOB_PROFILES[0]}-job-1` }, cancellationBuffer: new SharedArrayBuffer(4) });
test("VPX qualification observes the real app coordinator with bounded phases and listener cleanup for every terminal", async () => {
  for (const terminal of ["complete", "cancelled", "error"]) {
    const worker = new ObservedWorker(), job = request(), control = new AbortController();
    const pending = runVpxQualificationJob(worker, job, control.signal); assert.equal(worker.requests[0], job);
    worker.emit({ type: "complete", jobId: "other", metrics: {} });
    for (let i = 0; i < 100; i++) worker.emit({ type: "progress", jobId: job.jobId, phase: i + "x".repeat(300), metrics: {} });
    worker.emit({ type: "progress", jobId: job.jobId, phase: "Decoding VP8 (CPU) / encoding MPEG-4 MP4", metrics: { wasmMemoryBytes: 33_554_432 } });
    worker.emit({ type: "progress", jobId: job.jobId, phase: "Copying staged MP4 to selected destination", metrics: { wasmMemoryBytes: 33_554_432, maxWriteChunkBytes: 262144 } });
    worker.emit({ type: "progress", jobId: job.jobId, phase: "Copying staged MP4 to selected destination", metrics: { wasmMemoryBytes: 0, maxWriteChunkBytes: 524288 } });
    worker.emit({ type: terminal, jobId: job.jobId, metrics: {} });
    const result = await pending; assert.equal(result.type, terminal); assert.equal(result.phases.length, 32);
    assert.ok(result.phases.every(phase => phase.length <= 256)); assert.equal(result.nativeMetrics.wasmMemoryBytes, 33_554_432);
    assert.equal(result.nativeMetrics.maxWriteChunkBytes, 262144);
    assert.equal(worker.listeners, 0);
  }
});
test("VPX qualification rejects wrong stage/profile/direct/cancellation and releases listeners on abort or worker failure", async () => {
  for (const change of [r => { r.profileId = "mkv-to-mp4"; }, r => { r.destination.stagingName += "-other"; },
    r => { r.destination.mode = "handle"; }, r => { r.cancellationBuffer = new SharedArrayBuffer(8); }, r => { r.file = {}; }]) {
    const job = request(); change(job); assert.throws(() => validateVpxQualificationRequest(job));
  }
  for (const kind of ["abort", "post", "error", "already-aborted"]) {
    const worker = new ObservedWorker(), control = new AbortController();
    if (kind === "post") worker.postMessage = () => { throw new Error("post refused"); };
    if (kind === "already-aborted") control.abort(new Error(kind));
    const pending = runVpxQualificationJob(worker, request(), control.signal);
    if (kind === "abort") control.abort(new Error(kind));
    if (kind === "error") { const event = new Event("error"); event.message = kind; worker.dispatchEvent(event); }
    await assert.rejects(pending, /abort|post refused|error/); assert.equal(worker.listeners, 0);
  }
});
test("private source dispatch and general ABI selection do not expose new public registry routes", async () => {
  const worker = await readFile("workers/conversion.worker.ts", "utf8"), runtime = await readFile("workers/media-remux.ts", "utf8");
  assert.match(worker, /assertVpxSource\(profileId, inspection\)/); assert.match(worker, /remuxProfile: 4, vpxDecoderCore, forceAsynchronousInput: true/);
  assert.match(runtime, /!vpxDecoderCore && moduleUrl !== REMUX_MODULE_URL/);
  const registry = await readFile("lib/capability-registry.ts", "utf8");
  for (const id of policy.VPX_JOB_PROFILES) assert.equal(registry.includes(id), false);
});
