import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { prepareVpxCompiledCore, validateVpxCompiledCore } from "../lib/vpx-compiled-core.ts";
const bundled = await build({ entryPoints: ["workers/vpx-core-loader.ts"], bundle: true, format: "esm", platform: "node", write: false });
const { loadVpxDecoderCore } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64"));

// Tiny valid Wasm that imports/exports memory: static test code, not a codec or
// conversion proof. Reusing the module must never share its instance memories.
const wasm = new Uint8Array([0,97,115,109,1,0,0,0,2,16,1,3,101,110,118,6,109,101,109,111,114,121,2,1,1,2,7,10,1,6,109,101,109,111,114,121,2,0]);
const fetchCode = async () => new Response(wasm, { headers: { "content-length": String(wasm.length) } });

test("static code is rehashed, compiled once and reused only for identical bytes", async () => {
  let compilations = 0, fetches = 0;
  const compile = async bytes => { compilations++; return WebAssembly.compile(bytes); };
  const fetcher = async (url, options) => { assert.equal(url, "/engines/vpx/within-remux.wasm"); assert.ok(options.signal); fetches++; return fetchCode(); };
  const first = await prepareVpxCompiledCore(undefined, fetcher, compile); assert.equal(first.cacheHit, false);
  const second = await prepareVpxCompiledCore(first.core, fetcher, compile); assert.equal(second.cacheHit, true);
  assert.equal(second.core.module, first.core.module); assert.equal(compilations, 1); assert.equal(fetches, 2);
  const changed = await prepareVpxCompiledCore(first.core, async () => new Response(new Uint8Array([0,97,115,109,1,0,0,0])), compile);
  assert.equal(changed.cacheHit, false); assert.equal(compilations, 2); assert.notEqual(changed.core.sha256, first.core.sha256);
});

test("actual loader callback shares only static code and instantiates fresh imported memory", async () => {
  let cached; const hits = [], memories = [];
  const factory = async options => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 }); let received;
    options.instantiateWasm({ env: { memory } }, instance => { received = instance; });
    memories.push(received.exports.memory); return { ccall() {} };
  };
  for (const codec of ["VP8", "VP9"]) {
    const core = await loadVpxDecoderCore(codec, async () => ({ default: factory }), { cached, fetchStatic: fetchCode,
      prepared(module, hit) { cached = module; hits.push(hit); } });
    await core.factory({ withinBridge: {}, locateFile: x => x, print() {}, printErr() {} });
  }
  assert.deepEqual(hits, [false, true]); assert.notEqual(memories[0], memories[1]);
  new Uint8Array(memories[0].buffer)[0] = 123; assert.equal(new Uint8Array(memories[1].buffer)[0], 0);
});

test("static descriptors reject memories, hidden payloads, coercible hashes and unbounded metadata", async () => {
  const { core } = await prepareVpxCompiledCore(undefined, fetchCode);
  for (const bad of [{ ...core, file: new File(["data"], "not-code") }, { ...core, module: new WebAssembly.Memory({ initial: 1 }) },
    { ...core, sha256: { toString: () => core.sha256 } }, { ...core, byteLength: 16 * 1024 ** 2 + 1 }, { ...core, sha256: "wrong" }])
    assert.throws(() => validateVpxCompiledCore(bad));
  const decorated = await WebAssembly.compile(wasm); decorated.hidden = new File(["data"], "not-code");
  assert.throws(() => validateVpxCompiledCore({ ...core, module: decorated }));
});

test("bounded static fetch rejects excess, truncation and unavailable assets without compiling", async () => {
  let compiled = false;
  const compile = async () => { compiled = true; throw new Error("Must not compile"); };
  for (const response of [new Response(wasm, { status: 404 }), new Response(wasm, { headers: { "content-length": "16777217" } }),
    new Response(wasm, { headers: { "content-length": String(wasm.length - 1) } }),
    new Response(wasm, { headers: { "content-length": String(wasm.length + 1) } }),
    new Response(new Uint8Array(7))])
    await assert.rejects(prepareVpxCompiledCore(undefined, async () => response, compile));
  assert.equal(compiled, false);
});
