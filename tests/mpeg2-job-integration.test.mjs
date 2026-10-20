import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["lib/mpeg2-stage-policy.ts", "workers/mpeg2-core-loader.ts", "lib/mpeg2-qualification-job.ts"],
  bundle: true, format: "esm", platform: "node", outdir: "unused", write: false });
const load = async name => import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles.find(file => file.path.endsWith(name + ".js")).contents).toString("base64"));
const { estimateMpeg2StageBytes, MPEG2_JOB_PROFILE } = await load("mpeg2-stage-policy");
const { loadMpeg2SplitCore } = await load("mpeg2-core-loader");
const { runMpeg2QualificationJob, validateMpeg2QualificationRequest } = await load("mpeg2-qualification-job");

test("MPEG-2 quota plans from duration/selected bitrate, not compressed source size alone", () => {
  assert.equal(estimateMpeg2StageBytes(497032, 4), 497032 + 2500000 + 16777216);
  assert.equal(estimateMpeg2StageBytes(2958573265, 12340), 10687850481);
  const larger = estimateMpeg2StageBytes(10_000_000_000, 12340 * 4);
  assert.ok(larger > 40_000_000_000);
  for (const [size, duration] of [[0, 4], [-1, 4], [1.5, 4], [1, null], [1, undefined], [1, 0], [1, NaN], [1, Infinity], [Number.MAX_SAFE_INTEGER, 100]]) {
    assert.throws(() => estimateMpeg2StageBytes(size, duration));
  }
});

test("loader requires stable JSPI before importing, returns only canonical lazy factories and rejects absent/bad assets", async () => {
  const descriptors = Object.fromEntries(["Suspending", "promising"].map(key => [key, Object.getOwnPropertyDescriptor(WebAssembly, key)]));
  let calls = 0;
  try {
    for (const key of Object.keys(descriptors)) Object.defineProperty(WebAssembly, key, { configurable: true, value: undefined });
    await assert.rejects(loadMpeg2SplitCore(async () => { calls++; return { default() {} }; }), /stable WebAssembly JSPI/);
    assert.equal(calls, 0);
    for (const key of Object.keys(descriptors)) Object.defineProperty(WebAssembly, key, { configurable: true, value() {} });
    const urls = [], factory = () => { throw new Error("Loading must not instantiate the engine"); };
    const core = await loadMpeg2SplitCore(async url => { urls.push(url); return { default: factory }; });
    assert.deepEqual(urls.sort(), ["/engines/mpeg2/decoder.mjs", "/engines/mpeg2/encoder.mjs"]);
    assert.equal(core.decoderFactory, factory); assert.equal(core.encoderFactory, factory);
    assert.equal(core.decoderWasmUrl, "/engines/mpeg2/decoder.wasm"); assert.equal(core.encoderWasmUrl, "/engines/mpeg2/encoder.wasm");
    await assert.rejects(loadMpeg2SplitCore(async () => { throw new Error("404"); }), /not installed/);
    await assert.rejects(loadMpeg2SplitCore(async () => ({ default: {} })), /native factories/);
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(WebAssembly, key, descriptor); else delete WebAssembly[key];
    }
  }
});

class ObservedWorker extends EventTarget {
  listeners = 0; requests = [];
  addEventListener(...args) { this.listeners++; super.addEventListener(...args); }
  removeEventListener(...args) { this.listeners--; super.removeEventListener(...args); }
  postMessage(request) { this.requests.push(request); }
  emit(data) { this.dispatchEvent(new MessageEvent("message", { data })); }
}
const request = () => ({ type: "start", jobId: "job-1", profileId: MPEG2_JOB_PROFILE, file: new File(["fixture"], "input.mkv"),
  destination: { mode: "staged-handle", handle: {}, stagingName: `within-stage-${MPEG2_JOB_PROFILE}-job-1` }, cancellationBuffer: new SharedArrayBuffer(4) });

test("qualification observes the real lifecycle with bounded diagnostics, ignores other jobs, removes listeners on all terminal results", async () => {
  for (const terminal of ["complete", "cancelled", "error"]) {
    const worker = new ObservedWorker(), job = request(), control = new AbortController();
    const pending = runMpeg2QualificationJob(worker, job, control.signal);
    assert.equal(worker.requests[0], job); assert.equal(worker.listeners, 2);
    worker.emit({ type: "ready" }); worker.emit({ type: "complete", jobId: "other", metrics: {} });
    for (let i = 0; i < 100; i++) worker.emit({ type: "progress", jobId: job.jobId, phase: i + "x".repeat(300), metrics: {} });
    worker.emit({ type: "progress", jobId: job.jobId, phase: "Encoding MPEG-2 MP4", metrics: { wasmMemoryBytes: 50331648 } });
    worker.emit({ type: "progress", jobId: job.jobId, phase: "Copying staged MP4 to selected destination", metrics: { wasmMemoryBytes: 0 } });
    worker.emit({ type: terminal, jobId: job.jobId, metrics: { wasmMemoryBytes: 0 } });
    const result = await pending;
    assert.equal(result.type, terminal); assert.equal(result.phases.length, 32); assert.ok(result.phases.every(phase => phase.length <= 256));
    assert.equal(result.nativeMetrics.wasmMemoryBytes, 50331648); assert.equal(worker.listeners, 0);
  }
});

test("qualification rejects non-owned/public/direct jobs and releases listeners on abort, post failure or worker failure", async () => {
  for (const change of [r => { r.profileId = "mkv-to-mp4"; }, r => { r.destination.stagingName += "-other"; },
    r => { r.destination.mode = "handle"; }, r => { r.cancellationBuffer = new SharedArrayBuffer(8); }, r => { r.file = {}; }]) {
    const job = request(); change(job); assert.throws(() => validateMpeg2QualificationRequest(job), /owned, staged/);
  }
  for (const kind of ["abort", "post", "error", "already-aborted"]) {
    const worker = new ObservedWorker(), control = new AbortController();
    if (kind === "post") worker.postMessage = () => { throw new Error("post refused"); };
    if (kind === "already-aborted") control.abort(new Error(kind));
    const pending = runMpeg2QualificationJob(worker, request(), control.signal);
    if (kind === "abort") control.abort(new Error(kind));
    if (kind === "error") { const event = new Event("error"); event.message = kind; worker.dispatchEvent(event); }
    await assert.rejects(pending, /abort|post refused|error/); assert.equal(worker.listeners, 0);
  }
});

test("actual dispatcher selects explicit profile40 and closed-stage handoff while the route remains unpublished", async () => {
  const worker = await readFile("workers/conversion.worker.ts", "utf8"), app = await readFile("app/converter/ConverterApp.tsx", "utf8");
  assert.match(worker, /if \(isMpeg2Job\) \{\s*await runMediaRemux\([\s\S]*?remuxProfile: 40, mpeg2SplitCore/);
  const close = worker.slice(worker.indexOf("        if (profileId === MPEG2_JOB_PROFILE) {"), worker.indexOf("        finalWritable = await finalHandle.createWritable"));
  assert.match(close, /stageClosed: true/); assert.match(close, /workerScope.postMessage\(handoff\)/); assert.match(close, /await new Promise<void>\(\(\) => {}\)/);
  assert.match(app, /const worker = createStagedWorkerCoordinator\(/);
  assert.match(app, /if \(!testMode\) return;\s*const lifetime = new AbortController\(\);\s*window\.__WITHIN_TEST__ =/);
  assert.match(app, /if \(jobIdRef.current \|\| activeBatchRef.current \|\| workerRef.current !== worker\) return;/);
  const registry = await readFile("lib/capability-registry.ts", "utf8"); assert.equal(registry.includes(MPEG2_JOB_PROFILE), false);
});
