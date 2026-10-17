import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "..");
const bundle = await build({ stdin: { contents: 'export * from "./lib/compiled-codec-cache.ts";', loader: "ts", resolveDir: root }, bundle: true, format: "esm", platform: "node", write: false });
const { COMPILED_CODEC_BINDING, createCompiledCodecHostCache, installCompiledCodecCache } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
if (!globalThis.ErrorEvent) globalThis.ErrorEvent = class extends Event { constructor(type, options) { super(type, options); this.message = options.message; } };
class FakeWorker extends EventTarget {
  onmessage = null; messages = []; terminations = 0;
  postMessage(value) { this.messages.push(structuredClone(value)); }
  terminate() { this.terminations++; }
  emit(value) { this.dispatchEvent(new MessageEvent("message", { data: value })); }
}
const emptyModule = () => new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));
const descriptor = () => ({ type: "compiled-codec-modules", binding: COMPILED_CODEC_BINDING, decoder: emptyModule(), encoder: emptyModule() });
test("host retains exactly two compiled modules, never File/memory/instances; primes before queued start and retires listeners", () => {
  const cache = createCompiledCodecHostCache(() => {}), first = cache.bind(new FakeWorker());
  first.onmessage = () => {}; first.emit(descriptor()); first.terminate(); first.terminate(); assert.equal(first.terminations, 1);
  assert.deepEqual(cache.metrics(), { modules: 2, maximumModules: 2, physicalCodeBytes: null, cachedInstances: 0, cachedMemories: 0, cachedFiles: 0, cachedUserBuffers: 0 });
  const second = cache.bind(new FakeWorker());
  second.onmessage = () => second.postMessage({ type: "start" }); second.emit({ type: "ready" });
  assert.deepEqual(second.messages.map(row => row.type), ["prime-compiled-codec-modules", "start"]);
  assert.ok(second.messages[0].decoder instanceof WebAssembly.Module); assert.equal(second.messages[0].binding, COMPILED_CODEC_BINDING);
  second.terminate(); second.emit({ type: "ready" }); assert.equal(second.messages.length, 2);
});
test("malformed, hidden-buffer, memory or wrong-binding cache payloads fail without entering cache", () => {
  for (const mutate of [r => { r.extra = new Uint8Array(4); }, r => { r.decoder = new WebAssembly.Memory({ initial: 1 }); },
    r => { r.encoder = new WebAssembly.Instance(emptyModule()); }, r => { r.binding = "other"; }]) {
    const cache = createCompiledCodecHostCache(() => {}), worker = cache.bind(new FakeWorker()), errors = [];
    worker.addEventListener("error", event => errors.push(event.message)); const row = descriptor(); mutate(row); worker.emit(row);
    assert.equal(cache.metrics().modules, 0); assert.equal(errors.length, 1); worker.terminate();
  }
});
test("actual Wasm instances are fresh while primed compiled modules skip repeat streaming compilation", async () => {
  const original = WebAssembly.instantiateStreaming, rows = [], published = [];
  const scope = new EventTarget(); scope.location = { origin: "http://127.0.0.1:1234" }; scope.postMessage = value => published.push(structuredClone(value));
  const response = role => { const value = new Response(new Uint8Array([0,97,115,109,1,0,0,0]), { headers: { "Content-Type": "application/wasm" } });
    Object.defineProperty(value, "url", { value: scope.location.origin + `/engines/remux/_private_split_${role}.wasm` }); return value; };
  let installation = installCompiledCodecCache(scope, row => rows.push(row));
  try {
    const first = await WebAssembly.instantiateStreaming(response("decoder"), {});
    await WebAssembly.instantiateStreaming(response("encoder"), {}); assert.equal(published.length, 1);
    installation.restore(); assert.equal(WebAssembly.instantiateStreaming, original);
    installation = installCompiledCodecCache(scope, row => rows.push(row));
    scope.dispatchEvent(new MessageEvent("message", { data: { ...published[0], type: "prime-compiled-codec-modules" } }));
    const second = await WebAssembly.instantiateStreaming(response("decoder"), {});
    assert.notEqual(first.instance, second.instance); assert.ok(second.module instanceof WebAssembly.Module);
    assert.equal(published.length, 1); assert.deepEqual(rows.map(row => row.event), ["compiled", "compiled", "primed", "reused"]);
  } finally { installation.restore(); }
});
