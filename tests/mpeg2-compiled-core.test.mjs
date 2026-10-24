import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { after } from "node:test";
import { build } from "esbuild";
import { prepareMpeg2CompiledCore, validateMpeg2CompiledCore, createMpeg2CompiledCoreSlot } from "../lib/mpeg2-compiled-core.ts";
const original = Object.fromEntries(["Suspending", "promising"].map(key => [key, Object.getOwnPropertyDescriptor(WebAssembly, key)]));
for (const key of Object.keys(original)) Object.defineProperty(WebAssembly, key, { configurable: true, value() {} });
after(() => { for (const [key, descriptor] of Object.entries(original)) if (descriptor) Object.defineProperty(WebAssembly, key, descriptor); else delete WebAssembly[key]; });
const wasm = new Uint8Array([0,97,115,109,1,0,0,0,2,16,1,3,101,110,118,6,109,101,109,111,114,121,2,1,1,2,7,10,1,6,109,101,109,111,114,121,2,0]);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const response = bytes => new Response(bytes, { headers: { "content-length": String(bytes.length) } });
function assets(decoder = wasm, encoder = wasm) {
  const requests = [];
  const manifest = { schemaVersion: 1, engine: "within-mpeg2-split-jspi", decoderMemoryBytes: 33554432, encoderMemoryBytes: 16777216,
    artifacts: { "decoder.wasm": hash(decoder), "encoder.wasm": hash(encoder) } };
  const fetchStatic = async url => { requests.push(url); return response(url.endsWith(".json") ? new TextEncoder().encode(JSON.stringify(manifest)) : url.endsWith("decoder.wasm") ? decoder : encoder); };
  return { manifest, requests, fetchStatic };
}
test("production pair compiles only cold/changed code and checks the manifest on every warm job", async () => {
  const fixture = assets(); let calls = 0;
  const compile = bytes => { calls++; return WebAssembly.compile(bytes); };
  const first = await prepareMpeg2CompiledCore(undefined, fixture.fetchStatic, compile);
  assert.deepEqual(first.compiledRoles, ["decoder", "encoder"]); assert.equal(first.cacheHit, false); assert.equal(calls, 2);
  const second = await prepareMpeg2CompiledCore(first.core, fixture.fetchStatic, compile);
  assert.equal(second.cacheHit, true); assert.equal(calls, 2); assert.equal(second.core.decoder, first.core.decoder); assert.equal(second.core.encoder, first.core.encoder);
  assert.deepEqual(fixture.requests, ["/engines/mpeg2/build-manifest.json", "/engines/mpeg2/decoder.wasm", "/engines/mpeg2/encoder.wasm", "/engines/mpeg2/build-manifest.json"]);
  const changed = assets(new Uint8Array([...wasm, 0, 3, 1, 101, 1]));
  const updated = await prepareMpeg2CompiledCore(first.core, changed.fetchStatic, compile);
  assert.deepEqual(updated.compiledRoles, ["decoder"]); assert.equal(calls, 3); assert.equal(updated.core.encoder, first.core.encoder);
});
test("verified asset lengths bound backing allocations even for compressed or lengthless HTTP, without changing compiled code", async () => {
  for (const headers of [{}, { "content-encoding": "gzip", "content-length": "16" }]) {
    const fixture = assets(); fixture.manifest.artifactBytes = { "decoder.wasm": wasm.length, "encoder.wasm": wasm.length };
    const fetchStatic = url => url.endsWith(".json") ? fixture.fetchStatic(url) : Promise.resolve(new Response(wasm, { headers }));
    const lengths = [], compile = bytes => { lengths.push(bytes.buffer.byteLength); assert.equal(bytes.byteLength, wasm.length); return WebAssembly.compile(bytes); };
    const first = await prepareMpeg2CompiledCore(undefined, fetchStatic, compile);
    assert.deepEqual(lengths, [wasm.length, wasm.length]);
    const second = await prepareMpeg2CompiledCore(first.core, fetchStatic, compile);
    assert.equal(second.cacheHit, true); assert.equal(second.core.decoder, first.core.decoder); assert.equal(lengths.length, 2);
    fixture.manifest.artifactBytes["decoder.wasm"]++;
    await assert.rejects(prepareMpeg2CompiledCore(first.core, fetchStatic, compile), /byte length conflicts/);
    await assert.rejects(prepareMpeg2CompiledCore(undefined, fetchStatic, compile), /length changed/);
  }
});
test("manifest size guards refuse under/overflow, missing roles, extra keys and false uncompressed lengths", async () => {
  for (const artifactBytes of [{ "decoder.wasm": 7, "encoder.wasm": wasm.length },
    { "decoder.wasm": 16777217, "encoder.wasm": wasm.length }, { "decoder.wasm": wasm.length },
    { "decoder.wasm": wasm.length, "encoder.wasm": wasm.length, hidden: 8 }]) {
    const fixture = assets(); fixture.manifest.artifactBytes = artifactBytes;
    await assert.rejects(prepareMpeg2CompiledCore(undefined, fixture.fetchStatic), /manifest byte lengths/);
  }
  const fixture = assets(); fixture.manifest.artifactBytes = { "decoder.wasm": wasm.length + 1, "encoder.wasm": wasm.length };
  await assert.rejects(prepareMpeg2CompiledCore(undefined, fixture.fetchStatic), /length conflicts/);
  fixture.manifest.artifactBytes["decoder.wasm"] = wasm.length - 1;
  const noLength = url => url.endsWith(".json") ? fixture.fetchStatic(url) : Promise.resolve(new Response(wasm));
  await assert.rejects(prepareMpeg2CompiledCore(undefined, noLength), /exceeded/);
});
test("code slots reject File/memory/instances, symbol payloads, coercible bindings and dispose safely", async () => {
  const { core } = await prepareMpeg2CompiledCore(undefined, assets().fetchStatic);
  for (const mutate of [v => { v.decoder = new WebAssembly.Memory({ initial: 1 }); }, v => { v.encoder = {}; },
    v => { v.file = new File(["hidden"], "must-not-cache"); }, v => { v[Symbol("hidden")] = new Uint8Array(8); },
    v => { v.binding = new String(v.binding); }, v => { v.decoderBytes = 16777217; }]) {
    const value = { ...core }; mutate(value); assert.throws(() => validateMpeg2CompiledCore(value), /descriptor/);
  }
  const slot = createMpeg2CompiledCoreSlot(); slot.set(core); assert.ok(slot.get().decoder instanceof WebAssembly.Module);
  assert.deepEqual(Object.keys(slot.get()).sort(), ["binding", "decoder", "decoderBytes", "encoder", "encoderBytes"]);
  slot.clear(); assert.equal(slot.get(), null); slot.set(core); slot.dispose(); assert.equal(slot.get(), null); assert.throws(() => slot.set(core), /disposed/);
});
test("bad/missing manifests, wrong bytes, unsupported JSPI and truncated/oversized assets never authorize stale code", async () => {
  const fixture = assets(), first = await prepareMpeg2CompiledCore(undefined, fixture.fetchStatic);
  for (const cached of [undefined, first.core]) {
    await assert.rejects(prepareMpeg2CompiledCore(cached, async () => new Response("", { status: 404 })), /unavailable/);
    const bad = { ...fixture.manifest, encoderMemoryBytes: 33554432 };
    await assert.rejects(prepareMpeg2CompiledCore(cached, async () => response(new TextEncoder().encode(JSON.stringify(bad)))), /manifest/);
  }
  await assert.rejects(prepareMpeg2CompiledCore(undefined, async url => url.endsWith(".json") ? fixture.fetchStatic(url) : response(new Uint8Array(8))), /match its static manifest/);
  await assert.rejects(prepareMpeg2CompiledCore(undefined, async () => new Response("{}", { headers: { "content-length": "65537" } })), /bound/);
  await assert.rejects(prepareMpeg2CompiledCore(undefined, async () => new Response("{}", { headers: { "content-length": "3" } })), /length changed/);
  Object.defineProperty(WebAssembly, "Suspending", { configurable: true, value: undefined });
  try { await assert.rejects(prepareMpeg2CompiledCore(first.core, fixture.fetchStatic), /stable WebAssembly JSPI/); }
  finally { Object.defineProperty(WebAssembly, "Suspending", { configurable: true, value() {} }); }
});
test("production loader's two cached factories instantiate fresh actual Wasm memories and publish code exactly once", async () => {
  const bundled = await build({ entryPoints: ["workers/mpeg2-core-loader.ts"], bundle: true, format: "esm", platform: "node", write: false });
  const { loadMpeg2SplitCore } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64"));
  const fixture = assets(), memories = [], received = [], cores = [];
  const importer = async () => ({ default: async options => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 }); memories.push(memory);
    const exports = options.instantiateWasm({ env: { memory } }, (instance, module) => received.push({ instance, module }));
    assert.equal(exports.memory, memory); return exports;
  } });
  for (let job = 0; job < 2; job++) {
    const core = await loadMpeg2SplitCore(importer, { cached: cores.at(-1), fetchStatic: fixture.fetchStatic, prepared: value => cores.push(value) });
    const before = memories.length; await core.encoderFactory({}); await core.decoderFactory({});
    assert.equal(memories.length, before + 2); assert.equal(cores.length, job + 1);
  }
  assert.equal(new Set(memories.map(memory => memory.buffer)).size, 4); assert.notEqual(received[0].instance, received[2].instance);
  assert.equal(received[0].module, received[2].module); assert.equal(fixture.requests.filter(url => url.endsWith(".wasm")).length, 2);
});
