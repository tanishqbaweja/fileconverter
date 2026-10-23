import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["workers/media-remux.ts", "workers/mpeg2-split-runtime.ts"],
  bundle: true, format: "esm", platform: "node", outdir: "unused", write: false, metafile: true });
const imported = async name => import("data:text/javascript;base64," + Buffer.from(
  compiled.outputFiles.find(file => file.path.endsWith(name + ".js")).contents).toString("base64"));
const { runMediaRemux } = await imported("media-remux");
const { createMpeg2SplitRuntime, assertMpeg2SplitOptions } = await imported("mpeg2-split-runtime");
const originalFeatures = Object.fromEntries(["Suspending", "promising"].map(key => [key, Object.getOwnPropertyDescriptor(WebAssembly, key)]));
// Unit doubles only: these tests never claim to execute WebAssembly/JSPI/codecs.
for (const key of Object.keys(originalFeatures)) Object.defineProperty(WebAssembly, key, { configurable: true, value() {} });
after(() => { for (const [key, descriptor] of Object.entries(originalFeatures)) {
  if (descriptor) Object.defineProperty(WebAssembly, key, descriptor); else delete WebAssembly[key];
} });
const args = [40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const invoke = (owner, values = args) => owner.ccall("within_remux", "number", values.map(() => "number"), values, { async: true });
const audio = { codec: "automatic", compression: "automatic", bitRateBps: 0, sampleRateHz: 0, channels: 0, quality: "automatic" };
const video = { codec: "automatic", maxWidth: 0, bitRateBps: 0, frameRateFps: 0, quality: "automatic" };

function fixture(overrides = {}) {
  let closed = 0, factoryCalls = 0, cancelled = false;
  const seen = [], progress = [], reads = [], writes = [];
  const encoder = { HEAPU8: new Uint8Array(16777216), _emscripten_stack_get_base: () => 524288,
    _emscripten_stack_get_end: () => 262144, _within_split_encoder_config: () => 1024,
    _within_split_encoder_open: () => 0, _within_split_encoder_settings_match: () => 1,
    _within_split_encoder_parameters: () => 2048, _within_split_encoder_parameter_bytes: () => 192,
    _within_split_encoder_close() { closed++; if (overrides.closeError) throw overrides.closeError; return overrides.closeResult ?? 0; } };
  const decoder = { HEAPU8: new Uint8Array(33554432), _emscripten_stack_get_base: () => 524288,
    _emscripten_stack_get_end: () => 262144,
    async ccall(...values) { seen.push(values); if (overrides.run) return overrides.run(f, ...values); return 0; } };
  const wire = new DataView(decoder.HEAPU8.buffer, 1024, 96);
  [1, 1920, 804, 0, 1, 24, 24, 1, 4000000, 4, 20].forEach((value, i) => wire.setUint32(i * 4, value, true));
  let decoderOptions;
  const options = { withinBridge: { inputSize: 64, copyOutput: false, cancelled: () => cancelled,
    readSync: () => { throw new Error("Synchronous input must not be used"); },
    async read(offset, destination) { reads.push(offset); destination.fill(1); return destination.length; },
    async write(offset, data) { if (overrides.write) return overrides.write(offset, data); writes.push({ offset, bytes: [...data] }); return data.length; },
    async truncate() {}, async flush() {}, message() {}, progress: row => progress.push(row) },
    locateFile() { throw new Error("Wrong engine URL"); }, print() {}, printErr() {} };
  const cores = { decoderWasmUrl: "/engines/mpeg2/decoder.wasm", encoderWasmUrl: "/engines/mpeg2/encoder.wasm",
    async encoderFactory(options) { factoryCalls++; assert.equal(options.locateFile("ignored.wasm"), cores.encoderWasmUrl);
      if (overrides.encoderError) throw overrides.encoderError; if (overrides.cancelAfterEncoder) cancelled = true; return encoder; },
    async decoderFactory(options) { factoryCalls++; decoderOptions = options;
      assert.equal(options.locateFile("ignored.wasm"), cores.decoderWasmUrl);
      if (overrides.decoderError) throw overrides.decoderError; return decoder; } };
  const f = { options, cores, encoder, decoder, seen, progress, writes, reads, wire,
    get decoderOptions() { return decoderOptions; }, closed: () => closed, factoryCalls: () => factoryCalls,
    cancel() { cancelled = true; } };
  return f;
}

test("explicit MPEG-2 entry maps only profile40, reports aggregate heaps, and closes native owner exactly once", async () => {
  const f = fixture({ async run(f) {
    const bridge = f.decoderOptions.withinBridge;
    assert.equal(bridge.readSync, undefined);
    assert.equal(f.decoderOptions.withinSplit.call(0, f.decoder.HEAPU8, 1024, 131072), 192);
    await bridge.read(0, new Uint8Array(4));
    await bridge.write(0, new Uint8Array([9, 8, 7]));
    bridge.progress({ inputPosition: 4, outputSize: 3, mediaTimeUs: 1, durationUs: 2, wasmMemoryBytes: 33554432 });
    return 0;
  } });
  const owner = await createMpeg2SplitRuntime(f.options, f.cores);
  assert.equal(await invoke(owner), 0);
  assert.deepEqual(f.seen[0][3], [6, 0, 0, 0, 0, 0, 0, 0, 0, 4000000, 0, 0]);
  assert.equal(f.progress[0].wasmMemoryBytes, 50331648);
  assert.deepEqual(f.writes, [{ offset: 0, bytes: [9, 8, 7] }]);
  assert.deepEqual(owner.metrics(), { calls: 1, activeCalls: 0, maximumActiveCalls: 1, failedCalls: 0, closed: true,
    maximumMediaAvioWriteBytes: 3, asyncifyLinearStackBytes: 0, engineManagedStackMemoryBytes: null });
  owner.dispose(); assert.equal(f.closed(), 1);
  await assert.rejects(invoke(owner), /closed/);
});

test("native entry refuses remux/FLAC/9-argument substitutions and non-allowlisted settings", async () => {
  const f = fixture(), owner = await createMpeg2SplitRuntime(f.options, f.cores);
  try {
    for (const values of [[1, ...args.slice(1)], [6, ...args.slice(1)], args.slice(0, 9),
      args.map((value, i) => i === 1 ? 128000 : value), args.map((value, i) => i === 9 ? 123456 : value),
      args.map((value, i) => i === 11 ? 4 : value), args.map((value, i) => i === 8 ? NaN : value),
      Object.assign(new Array(12), { 0: 40, 9: 4000000 })]) {
      await assert.rejects(invoke(owner, values), /explicit profile|Unsupported private MPEG-2/);
    }
    await assert.rejects(owner.ccall("wrong", "number", args.map(() => "number"), args, { async: true }), /ABI/);
    assert.equal(f.seen.length, 0);
  } finally { owner.dispose(); }
  assert.equal(f.closed(), 1);
});

test("unsupported audio/video choices are errors, not silently ignored UI values", () => {
  assert.doesNotThrow(() => assertMpeg2SplitOptions());
  assert.doesNotThrow(() => assertMpeg2SplitOptions(audio, video));
  assert.doesNotThrow(() => assertMpeg2SplitOptions(audio, { ...video, bitRateBps: 4000000 }));
  assert.doesNotThrow(() => assertMpeg2SplitOptions(audio, { ...video, maxWidth: 320, bitRateBps: 1000000, frameRateFps: 15, quality: "higher" }));
  for (const [key, value] of Object.entries({ codec: "aac", compression: "lossy", bitRateBps: 128000,
    sampleRateHz: 48000, channels: 2, quality: "higher" })) {
    assert.throws(() => assertMpeg2SplitOptions({ ...audio, [key]: value }, video), /copies compatible audio/);
  }
  for (const [key, value] of Object.entries({ codec: "vp9", maxWidth: 641, bitRateBps: 123456, frameRateFps: 23, quality: "unknown" })) {
    assert.throws(() => assertMpeg2SplitOptions(audio, { ...video, [key]: value }), /Unsupported private MPEG-2/);
  }
});

test("requested native controls survive the tuple and actual configuration audit; drift still fails closed", async () => {
  const requested = args.map((value, index) => ({ 8: 320, 9: 1000000, 10: 15, 11: 3 }[index] ?? value));
  const make = () => {
    const f = fixture({ run: f => f.decoderOptions.withinSplit.call(0, f.decoder.HEAPU8, 1024, 131072) >= 0 ? 0 : -1 });
    for (const [offset, value] of [[4, 320], [8, 180], [20, 15], [24, 15], [32, 1000000], [36, 2], [40, 12]]) f.wire.setUint32(offset, value, true);
    return f;
  };
  const f = make(); await invoke(await createMpeg2SplitRuntime(f.options, f.cores), requested);
  assert.deepEqual(f.seen[0][3], [6, ...requested.slice(1)]); assert.equal(f.closed(), 1);
  for (const [offset, wrong] of [[32, 4000000], [36, 4], [4, 640], [24, 24]]) {
    const bad = make(); bad.wire.setUint32(offset, wrong, true);
    await assert.rejects(invoke(await createMpeg2SplitRuntime(bad.options, bad.cores), requested), /Actual MPEG-2 native encoder settings/);
    assert.equal(bad.closed(), 1);
  }
});

test("missing stable JSPI and non-engine/cross-origin native assets fail before allocation", async () => {
  const f = fixture();
  Object.defineProperty(WebAssembly, "Suspending", { configurable: true, value: undefined });
  try { await assert.rejects(createMpeg2SplitRuntime(f.options, f.cores), /stable WebAssembly JSPI/); }
  finally { Object.defineProperty(WebAssembly, "Suspending", { configurable: true, value() {} }); }
  for (const decoderWasmUrl of ["https://elsewhere.example/decoder.wasm", "/engines/../decoder.wasm", "/decoder.wasm", "/engines/a.wasm?x=1"]) {
    await assert.rejects(createMpeg2SplitRuntime(f.options, { ...f.cores, decoderWasmUrl }), /same-origin/);
  }
  assert.equal(f.factoryCalls(), 0);
});

test("initialization, exact heap/stack guards and cancellation close the acquired encoder", async () => {
  for (const change of [f => { f.encoder.HEAPU8 = new Uint8Array(16777215); },
    f => { f.encoder._emscripten_stack_get_end = () => 0; },
    f => { f.decoder.HEAPU8 = new Uint8Array(33554433); },
    f => { f.decoder._emscripten_stack_get_end = () => 0; }]) {
    const f = fixture(); change(f);
    await assert.rejects(createMpeg2SplitRuntime(f.options, f.cores), /fixed-size|stack/);
    assert.equal(f.closed(), 1);
  }
  const error = new Error("decoder initialization failed"), f = fixture({ decoderError: error });
  await assert.rejects(createMpeg2SplitRuntime(f.options, f.cores), e => e === error); assert.equal(f.closed(), 1);
  const cancelled = fixture({ cancelAfterEncoder: true });
  await assert.rejects(createMpeg2SplitRuntime(cancelled.options, cancelled.cores), { name: "AbortError" });
  assert.equal(cancelled.closed(), 1); assert.equal(cancelled.factoryCalls(), 1);
});

test("one active JSPI entry prevents concurrent calls/disposal and closes after the awaited native call", async () => {
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  const f = fixture({ run: () => waiting }), owner = await createMpeg2SplitRuntime(f.options, f.cores);
  const first = invoke(owner);
  await assert.rejects(invoke(owner), /one active JSPI/); assert.throws(() => owner.dispose(), /active/);
  assert.equal(f.closed(), 0); assert.equal(f.seen.length, 1);
  finish(0); await first; assert.equal(f.closed(), 1); assert.equal(owner.metrics().activeCalls, 0);
});

test("write failure, oversized AVIO and native settings mismatch propagate and clean native ownership", async () => {
  const failure = new Error("selected destination revoked");
  const f = fixture({ write: () => { throw failure; }, run: f => f.decoderOptions.withinBridge.write(0, new Uint8Array(8)) });
  const owner = await createMpeg2SplitRuntime(f.options, f.cores);
  await assert.rejects(invoke(owner), e => e === failure); assert.equal(f.closed(), 1); assert.equal(owner.metrics().failedCalls, 1);
  const tooBig = fixture({ run: f => f.decoderOptions.withinBridge.write(0, new Uint8Array(262145)) });
  await assert.rejects(invoke(await createMpeg2SplitRuntime(tooBig.options, tooBig.cores)), /256 KiB/);
  assert.equal(tooBig.writes.length, 0); assert.equal(tooBig.closed(), 1);
  const settings = fixture({ run: f => f.decoderOptions.withinSplit.call(0, f.decoder.HEAPU8, 1024, 131072) });
  settings.wire.setUint32(32, 2000000, true);
  await assert.rejects(invoke(await createMpeg2SplitRuntime(settings.options, settings.cores)), /actual|Actual/);
  assert.equal(settings.closed(), 1);
});

test("overlapping native AVIO is refused rather than queued behind an unresolved write", async () => {
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  const f = fixture({ write: () => waiting, async run(f) {
    const bridge = f.decoderOptions.withinBridge;
    const first = bridge.write(0, new Uint8Array(8));
    try { await assert.rejects(bridge.write(8, new Uint8Array(8)), /one pending/); }
    finally { finish(8); }
    await first; return 0;
  } });
  const owner = await createMpeg2SplitRuntime(f.options, f.cores); await invoke(owner);
  assert.equal(owner.metrics().maximumMediaAvioWriteBytes, 8); assert.equal(f.closed(), 1);
});

test("simultaneous primary and native cleanup failures retain both original errors", async () => {
  const primary = new Error("decode failed"), cleanup = new Error("native close failed");
  const f = fixture({ run() { throw primary; }, closeError: cleanup });
  const owner = await createMpeg2SplitRuntime(f.options, f.cores);
  await assert.rejects(invoke(owner), error => error instanceof AggregateError && error.errors[0] === primary && error.errors[1] === cleanup);
  assert.equal(owner.metrics().closed, true); assert.equal(f.closed(), 1);
});

function mediaOptions(f) {
  const phases = [], writes = [], metrics = { inputBytes: 0, outputBytes: 0, queuedBytes: 0, peakQueuedBytes: 0,
    pendingOperations: 0, peakPendingOperations: 0, maxReadChunkBytes: 0, maxWriteChunkBytes: 0, elapsedMs: 0 };
  return { phases, writes, options: { file: new File([new Uint8Array(64)], "unit-input.mkv"), profileId: "mkv-to-mp4-mpeg2",
    remuxProfile: 40, mpeg2SplitCore: f.cores, jobId: "mpeg2-unit", metrics, startedAt: 0, isCancelled: () => false,
    emitProgress(_id, phase) { phases.push(phase); }, post() {}, writable: { requiresOwnedWriteBuffer: false,
      async write(chunk) { writes.push({ position: chunk.position, bytes: [...chunk.data] }); }, async truncate() {}, async flush() {} } } };
}

test("production runMediaRemux dispatch uses explicit MPEG-2 phase, native tuple and actual bounded destination bridge", async () => {
  const f = fixture({ async run(f) {
    const bridge = f.decoderOptions.withinBridge;
    const input = new Uint8Array(4); assert.equal(await bridge.read(0, input), 4);
    await bridge.write(0, new Uint8Array([1, 2, 3, 4]));
    bridge.progress({ inputPosition: 4, outputSize: 4, mediaTimeUs: 1, durationUs: 2, wasmMemoryBytes: 33554432 });
    return 0;
  } }), media = mediaOptions(f);
  await runMediaRemux(media.options);
  assert.ok(media.phases.length > 0); assert.ok(media.phases.every(phase => phase === "Encoding MPEG-2 MP4"));
  assert.deepEqual(f.seen[0][3], [6, 0, 0, 0, 0, 0, 0, 0, 0, 4000000, 0, 0]);
  assert.equal(media.options.metrics.wasmMemoryBytes, 50331648);
  assert.equal(media.options.metrics.peakPendingOperations, 1); assert.equal(media.options.metrics.pendingOperations, 0);
  assert.deepEqual(media.writes, [{ position: 0, bytes: [1, 2, 3, 4] }]); assert.equal(f.closed(), 1);
});

test("production dispatch rejects absent/wrong core bindings and unsupported settings before allocating codecs", async () => {
  const f = fixture(), media = mediaOptions(f);
  await assert.rejects(runMediaRemux({ ...media.options, mpeg2SplitCore: undefined }), /explicit native profile/);
  for (const remuxProfile of [1, 6, 39]) await assert.rejects(runMediaRemux({ ...media.options, remuxProfile }), /explicit native profile/);
  await assert.rejects(runMediaRemux({ ...media.options, videoOptions: { ...video, maxWidth: 641 } }), /Unsupported private MPEG-2/);
  await assert.rejects(runMediaRemux({ ...media.options, audioOptions: { ...audio, codec: "aac" } }), /copies compatible audio/);
  await assert.rejects(runMediaRemux({ ...media.options, singleThreadVideoCore: true }), /another codec/);
  assert.equal(f.factoryCalls(), 0);
});

test("browser runtime bundle uses only browser-safe transports and makes no qualification/publication claim", () => {
  assert.ok(Object.keys(compiled.metafile.inputs).some(name => name.endsWith("mpeg2-split-session.mjs")));
  assert.equal(Object.keys(compiled.metafile.inputs).some(name => /node_modules|native-bridge|recipe/.test(name)), false);
  assert.equal(compiled.outputFiles.some(file => /__WITHIN_INPUT_READ_CONTROL__|createCompositeAllocationAbortCapture/.test(file.text)), false);
});
