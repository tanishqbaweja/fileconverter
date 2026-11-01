// Production adapter wiring with mock native factories, not real codec acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const compiled = await build({ entryPoints: ["workers/media-remux.ts", "workers/webcodecs-vp9-core.ts"], bundle: true,
  format: "esm", platform: "node", outdir: "unused", write: false });
const load = async name => import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles.find(x => x.path.endsWith(name + ".js")).contents).toString("base64"));
const { runMediaRemux } = await load("media-remux"), { assertWebCodecsVp9Options, loadWebCodecsVp9Core } = await load("webcodecs-vp9-core");
async function mockJSPI(run) {
  const saved = Object.fromEntries(["Suspending", "promising"].map(key => [key, Object.getOwnPropertyDescriptor(WebAssembly, key)]));
  for (const key of Object.keys(saved)) Object.defineProperty(WebAssembly, key, { configurable: true, value() {} });
  try { return await run(); } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(WebAssembly, key, descriptor); else delete WebAssembly[key];
    }
  }
}
function metrics() { return { inputBytes: 0, outputBytes: 0, queuedBytes: 0, peakQueuedBytes: 0,
  pendingOperations: 0, peakPendingOperations: 0, maxReadChunkBytes: 0, maxWriteChunkBytes: 0, elapsedMs: 0, sharedArrayBufferBytes: 4 }; }
test("private VP9 accepts only bounded automatic-quality VP9 profiles and never approximates CRF/audio controls", () => {
  for (const id of [10, 11]) assert.doesNotThrow(() => assertWebCodecsVp9Options(id, undefined,
    { codec: "vp9", quality: "automatic", maxWidth: 640, bitRateBps: 600000, frameRateFps: 24 }));
  for (const options of [{ codec: "vp8" }, { quality: "balanced" }, { quality: "higher" }, { maxWidth: 1922 },
    { maxWidth: 641 }, { maxWidth: -1 }, { bitRateBps: NaN }, { bitRateBps: 9999 }, { bitRateBps: 20000001 },
    { frameRateFps: 121 }, { frameRateFps: Infinity }]) assert.throws(() => assertWebCodecsVp9Options(11, undefined, options), { name: "NotSupportedError" });
  for (const audio of [{ codec: "opus" }, { channels: 2 }, { quality: "balanced" }])
    assert.throws(() => assertWebCodecsVp9Options(11, audio), { name: "NotSupportedError" });
  for (const id of [1, 5, 7, 40]) assert.throws(() => assertWebCodecsVp9Options(id), { name: "NotSupportedError" });
});
test("private VP9 loader uses canonical assets, rejects reentrancy, and releases native plus encoder state", () => mockJSPI(async () => {
  const calls = []; let disposed = 0;
  const core = await loadWebCodecsVp9Core(async url => { calls.push(url); return { default: async () => ({
    HEAPU8: new Uint8Array(33554432), async ccall() { return 7; }, dispose() { disposed++; },
  }) }; });
  assert.deepEqual(calls, ["/engines/webcodecs-vp9/within-webcodecs-vp9.mjs"]);
  const first = await core.factory({ withinBridge: { cancelled: () => false } });
  await assert.rejects(core.factory({ withinBridge: { cancelled: () => false } }), /concurrently/);
  assert.equal(await first.ccall(), 7); first.dispose(); first.dispose(); assert.equal(disposed, 1);
  await assert.rejects(first.ccall(), /disposed/); assert.equal(core.snapshot().closed, true); assert.equal(core.snapshot().pendingPacketBytes, 0);
  const second = await core.factory({ withinBridge: { cancelled: () => false } }); second.dispose(); assert.equal(disposed, 2);
}));
test("private VP9 rejects a different native heap and closes even failed initialization", () => mockJSPI(async () => {
  let disposed = 0;
  for (const heap of [new Uint8Array(16777216), new Uint8Array(new SharedArrayBuffer(33554432))]) {
    const core = await loadWebCodecsVp9Core(async () => ({ default: async () => ({ HEAPU8: heap, dispose() { disposed++; } }) }));
    await assert.rejects(core.factory({ withinBridge: { cancelled: () => false } }), /fixed32MiB nonshared/);
    assert.equal(core.snapshot().closed, true);
  }
  assert.equal(disposed, 2);
}));
test("actual production AVIO runtime passes general12 ABI and bounded writes without inventing shared memory", () => mockJSPI(async () => {
  const writes = [], phases = []; let observed, disposed = 0;
  const core = await loadWebCodecsVp9Core(async () => ({ default: async options => ({
    HEAPU8: new Uint8Array(33554432),
    async ccall(name, result, types, args) {
      observed = { name, types, args, wasmUrl: options.locateFile("within-webcodecs-vp9.wasm") };
      const data = new Uint8Array(4); assert.equal(await options.withinBridge.read(0, data), 4); assert.deepEqual([...data], [100, 97, 116, 97]);
      options.withinBridge.progress({ inputPosition: 4, outputSize: 0, mediaTimeUs: 0, durationUs: 1000000, wasmMemoryBytes: 33554432 });
      await options.withinBridge.write(0, new Uint8Array([1, 2, 3, 4])); return 0;
    }, dispose() { disposed++; },
  }) }));
  const state = metrics();
  await runMediaRemux({ file: new File(["data"], "fixture.ogv"), profileId: "ogv-to-webm-vp9", remuxProfile: 11, webCodecsVp9Core: core,
    videoOptions: { codec: "vp9", quality: "automatic", maxWidth: 640, bitRateBps: 600000, frameRateFps: 24 },
    jobId: "private-vp9", metrics: state, startedAt: performance.now(), isCancelled: () => false,
    writable: { async write(operation) { writes.push([...operation.data]); }, async truncate() {}, async flush() {} },
    emitProgress: (_id, phase) => phases.push(phase), post() {} });
  assert.equal(observed.name, "within_remux"); assert.equal(observed.types.length, 12);
  assert.deepEqual(observed.args, [11, 0, 0, 0, 0, 0, 0, 2, 640, 600000, 24, 0]);
  assert.equal(observed.wasmUrl, "/engines/webcodecs-vp9/within-webcodecs-vp9.wasm");
  assert.deepEqual(writes, [[1, 2, 3, 4]]); assert.equal(state.peakPendingOperations, 1); assert.equal(state.activeWorkerCount, 1);
  assert.equal(state.wasmMemoryBytes, 33554432); assert.equal(state.sharedArrayBufferBytes, 4); assert.equal(disposed, 1);
  assert.ok(phases.includes("Encoding VP9 WebM (private WebCodecs encoder)"));
}));
test("actual private AVIO error path disposes the engine and releases its input reader", () => mockJSPI(async () => {
  let disposed = 0, cancelled = 0, opened = 0;
  const file = { size: 4, slice() { return { stream() {
    opened++; return new ReadableStream({ type: "bytes", pull(controller) { controller.enqueue(new Uint8Array([1, 2, 3, 4])); }, cancel() { cancelled++; } });
  } }; } };
  const core = await loadWebCodecsVp9Core(async () => ({ default: async options => ({
    HEAPU8: new Uint8Array(33554432), async ccall() {
      await options.withinBridge.read(0, new Uint8Array(4)); await options.withinBridge.write(0, new Uint8Array(4)); return 0;
    }, dispose() { disposed++; },
  }) }));
  await assert.rejects(runMediaRemux({ file, profileId: "ogv-to-webm-vp9", remuxProfile: 11, webCodecsVp9Core: core,
    jobId: "private-vp9", metrics: metrics(), startedAt: performance.now(), isCancelled: () => false,
    writable: { async write() { throw new Error("injected destination failure"); }, async truncate() {}, async flush() {} },
    emitProgress() {}, post() {} }), /injected destination failure/);
  assert.equal(disposed, 1); assert.equal(opened, 1); assert.equal(cancelled, 1); assert.equal(core.snapshot().closed, true);
}));
test("native initialization rejection preserves its NotSupported type through the real runtime and still disposes", () => mockJSPI(async () => {
  const names = ["VideoEncoder", "VideoFrame"], saved = Object.fromEntries(names.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "VideoEncoder", { configurable: true, value: class { static async isConfigSupported(config) { return { supported: false, config }; } } });
  Object.defineProperty(globalThis, "VideoFrame", { configurable: true, value: class {} });
  let disposed = 0;
  try {
    const heap = new Uint8Array(33554432), config = new DataView(heap.buffer, 128, 96);
    [1, 4, 4, 1, 24, 24, 1, 600000, 120, 1, 1, 1, 1, 1, 1].forEach((x, i) => config.setUint32(i * 4, x, true));
    const core = await loadWebCodecsVp9Core(async () => ({ default: async options => ({ HEAPU8: heap,
      async ccall() { try { await options.withinWebCodecs.open(heap, 128); } catch { /* Same native failure-return boundary. */ } return -52; },
      dispose() { disposed++; },
    }) }));
    await assert.rejects(runMediaRemux({ file: new File(["data"], "fixture.mkv"), profileId: "mkv-to-webm-vp9", remuxProfile: 10,
      webCodecsVp9Core: core, jobId: "selection-rejected", metrics: metrics(), startedAt: performance.now(), isCancelled: () => false,
      writable: { requiresOwnedWriteBuffer: true, async write() { throw new Error("No output may be attempted"); }, async truncate() {}, async close() {}, async abort() {} },
      emitProgress() {}, post() {} }), { name: "NotSupportedError" });
    assert.equal(disposed, 1); assert.equal(core.snapshot().closed, true); assert.equal(core.snapshot().frames, 0);
  } finally { for (const key of names) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key]; } }
}));
test("private initialization observation precedes native work and observation errors still dispose", () => mockJSPI(async () => {
  for (const fail of [false, true]) {
    let observed = false, nativeCalls = 0, disposed = 0;
    const core = await loadWebCodecsVp9Core(async () => ({ default: async options => ({ HEAPU8: new Uint8Array(33554432),
      async ccall() { nativeCalls++; assert.equal(observed, true); await options.withinBridge.write(0, new Uint8Array([1])); return 0; },
      dispose() { disposed++; },
    }) }));
    const work = runMediaRemux({ file: new File(["data"], "fixture.mkv"), profileId: "mkv-to-webm-vp9", remuxProfile: 10,
      webCodecsVp9Core: core, jobId: "observe-init", metrics: metrics(), startedAt: performance.now(), isCancelled: () => false,
      async onNativeInitialized(info) { assert.deepEqual(info, { engine: "webcodecs-vp9", helperWorkers: 0 }); observed = true;
        if (fail) throw new Error("Diagnostic failed"); },
      writable: { requiresOwnedWriteBuffer: true, async write() {}, async truncate() {}, async close() {}, async abort() {} }, emitProgress() {}, post() {} });
    if (fail) await assert.rejects(work, /Diagnostic failed/); else await work;
    assert.equal(nativeCalls, fail ? 0 : 1); assert.equal(disposed, 1); assert.equal(core.snapshot().closed, true);
  }
}));
