// Controlled fallback routing with mock codec calls, not real conversion acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const compiled = await build({ entryPoints: ["workers/webcodecs-vp9-optional.ts"], bundle: true, format: "esm", platform: "node", write: false });
const { runOptionalWebCodecsVp9 } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
function harness(video = { codec: "vp9", quality: "automatic", maxWidth: 320, bitRateBps: 600000, frameRateFps: 24 }) {
  const calls = [], writes = [], truncates = [], warnings = []; let cancelled = false;
  const options = { file: new File(["data"], "fixture.mkv"), profileId: "mkv-to-webm-vp9", remuxProfile: 10, videoOptions: video,
    writable: { requiresOwnedWriteBuffer: true, maximumWriteBytes: 262144,
      async write(operation) { writes.push(operation); }, async truncate(size) { truncates.push(size); }, async close() {}, async abort() {} },
    jobId: "private-fallback", metrics: {}, startedAt: performance.now(), isCancelled: () => cancelled, emitProgress() {}, post(message) { warnings.push(message); } };
  const core = { abi: "general-12", factory() {}, wasmUrl: "/engines/webcodecs-vp9/within-webcodecs-vp9.wasm", snapshot() { return null; } };
  return { options, calls, writes, truncates, warnings, core, cancel() { cancelled = true; },
    deps: { async loadCore() { return core; }, async run(options) { calls.push(options); } } };
}
const unsupported = () => new DOMException("Exact configuration unsupported", "NotSupportedError");
test("optional VP9 runs candidate once with the same source/options and no unnecessary destination reset", async () => {
  const h = harness(), result = await runOptionalWebCodecsVp9(h.options, h.deps);
  assert.deepEqual(result, { backend: "webcodecs", fallbackReason: null }); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].file, h.options.file); assert.equal(h.calls[0].videoOptions, h.options.videoOptions);
  assert.equal(h.calls[0].webCodecsVp9Core, h.core); assert.equal(h.calls[0].forceAsynchronousInput, true);
  assert.deepEqual(h.truncates, []); assert.deepEqual(h.warnings, []);
});
test("optional VP9 missing API/engine returns to unchanged Wasm options before any output write", async () => {
  const h = harness(); h.deps.loadCore = async () => { throw unsupported(); };
  const result = await runOptionalWebCodecsVp9(h.options, h.deps);
  assert.equal(result.backend, "wasm"); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].webCodecsVp9Core, undefined);
  assert.equal(h.calls[0].file, h.options.file); assert.equal(h.calls[0].videoOptions, h.options.videoOptions);
  assert.deepEqual(h.truncates, [0]); assert.equal(h.warnings.length, 1); assert.deepEqual(h.writes, []);
});
test("optional VP9 explicit CRF-quality controls go directly to Wasm, never approximated by browser encoder", async () => {
  const h = harness({ codec: "vp9", quality: "higher", maxWidth: 640 });
  h.deps.loadCore = async () => { throw new Error("Must not load candidate for unsupported controls"); };
  assert.equal((await runOptionalWebCodecsVp9(h.options, h.deps)).backend, "wasm");
  assert.equal(h.calls[0].videoOptions.quality, "higher"); assert.equal(h.calls[0].videoOptions.maxWidth, 640);
});
test("optional VP9 initialization rejection retries exactly once with Wasm, not a loop", async () => {
  const h = harness(); h.deps.run = async options => { h.calls.push(options); if (options.webCodecsVp9Core) throw unsupported(); };
  assert.equal((await runOptionalWebCodecsVp9(h.options, h.deps)).backend, "wasm"); assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].file, h.calls[1].file); assert.equal(h.calls[0].videoOptions, h.calls[1].videoOptions); assert.deepEqual(h.truncates, [0]);
});
test("optional VP9 never retries a destination write failure even if no output bytes were recorded", async () => {
  const h = harness(); h.options.writable.write = async () => { throw unsupported(); };
  h.deps.run = async options => { h.calls.push(options); await options.writable.write(new Uint8Array(4)); };
  await assert.rejects(runOptionalWebCodecsVp9(h.options, h.deps), { name: "NotSupportedError" });
  assert.equal(h.calls.length, 1); assert.deepEqual(h.truncates, []);
});
test("optional VP9 never retries corrupt input or ordinary encoder errors", async () => {
  const h = harness(); h.deps.run = async options => { h.calls.push(options); throw new Error("Corrupt source"); };
  await assert.rejects(runOptionalWebCodecsVp9(h.options, h.deps), /Corrupt source/); assert.equal(h.calls.length, 1); assert.deepEqual(h.truncates, []);
});
test("optional VP9 cancellation remains AbortError and does not start fallback", async () => {
  const h = harness(); h.deps.loadCore = async () => { h.cancel(); throw unsupported(); };
  await assert.rejects(runOptionalWebCodecsVp9(h.options, h.deps), { name: "AbortError" }); assert.equal(h.calls.length, 0); assert.deepEqual(h.truncates, []);
});
test("optional VP9 failed destination reset does not run CPU encoder", async () => {
  const h = harness(); h.deps.loadCore = async () => { throw unsupported(); }; h.options.writable.truncate = async () => { throw new Error("Permission revoked"); };
  await assert.rejects(runOptionalWebCodecsVp9(h.options, h.deps), /Permission revoked/); assert.equal(h.calls.length, 0);
});
test("optional VP9 Wasm failure is final, never another candidate or CPU retry", async () => {
  const h = harness(); h.deps.loadCore = async () => { throw unsupported(); };
  h.deps.run = async options => { h.calls.push(options); throw new Error("Wasm failed"); };
  await assert.rejects(runOptionalWebCodecsVp9(h.options, h.deps), /Wasm failed/); assert.equal(h.calls.length, 1);
});
test("optional VP9 rejects mixed core/profile requests before any conversion work", async () => {
  for (const change of [{ remuxProfile: 5 }, { webCodecsVp9Core: {} }, { vpxDecoderCore: {} }, { mpeg2SplitCore: {} }]) {
    const h = harness(); await assert.rejects(runOptionalWebCodecsVp9({ ...h.options, ...change }, h.deps), /unambiguous/);
    assert.equal(h.calls.length, 0); assert.deepEqual(h.truncates, []);
  }
});
