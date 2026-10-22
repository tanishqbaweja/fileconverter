import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { prepareVpxCompiledCore, validateVpxCompiledCore, assertVpxJspiSupport } from "../lib/vpx-compiled-core.ts";
const bundled = await build({ entryPoints: ["workers/vpx-core-loader.ts"], bundle: true, format: "esm", platform: "node", write: false });
const { loadVpxDecoderCore } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64"));

// Tiny valid Wasm that imports/exports memory: static test code, not a codec or
// conversion proof. Reusing the module must never share its instance memories.
const wasm = new Uint8Array([0,97,115,109,1,0,0,0,2,16,1,3,101,110,118,6,109,101,109,111,114,121,2,1,1,2,7,10,1,6,109,101,109,111,114,121,2,0]);
const manifest = bytes => ({ engine: "within-remux-private-vpx-timeline", artifacts: { "within-remux.wasm": createHash("sha256").update(bytes).digest("hex") } });
const responseFor = bytes => new Response(bytes, { headers: { "content-length": String(bytes.length) } });
const staticFetcher = (bytes = wasm) => async url => url.endsWith(".json")
  ? responseFor(new TextEncoder().encode(JSON.stringify(manifest(bytes)))) : responseFor(bytes);
const fetchCode = staticFetcher();

test("private JSPI capability check requires both stable APIs without flags or unsafe fallback", () => {
  for (const runtime of [{}, { Suspending() {} }, { promising() {} }, { Suspending: true, promising() {} }])
    assert.throws(() => assertVpxJspiSupport(runtime), /requires stable/);
  assert.doesNotThrow(() => assertVpxJspiSupport({ Suspending() {}, promising() {} }));
});

test("JSPI manifest gates both cold and cached static code before an unsupported runtime can start", async () => {
  const first = await prepareVpxCompiledCore(undefined, fetchCode);
  let binaryFetches = 0;
  const jspiFetch = async url => {
    if (url.endsWith(".json")) return responseFor(new TextEncoder().encode(JSON.stringify({ ...manifest(wasm), engine: "within-remux-private-vpx-jspi" })));
    binaryFetches++; return responseFor(wasm);
  };
  const supported = typeof WebAssembly.Suspending === "function" && typeof WebAssembly.promising === "function";
  for (const cached of [undefined, first.core]) {
    const operation = prepareVpxCompiledCore(cached, jspiFetch);
    if (supported) assert.equal((await operation).cacheHit, Boolean(cached));
    else await assert.rejects(operation, /requires stable/);
  }
  assert.equal(binaryFetches, supported ? 1 : 0);
});

test("static release manifest is checked every job; identical cached code is neither fetched nor recompiled", async () => {
  let compilations = 0, fetches = 0, binaryFetches = 0; const signals = [];
  const compile = async bytes => { compilations++; return WebAssembly.compile(bytes); };
  const fetcher = async (url, options) => { assert.ok(options.signal); assert.equal(options.cache, "no-store"); signals.push(options.signal); fetches++; if (url.endsWith(".wasm")) binaryFetches++; return fetchCode(url); };
  const first = await prepareVpxCompiledCore(undefined, fetcher, compile); assert.equal(first.cacheHit, false);
  const second = await prepareVpxCompiledCore(first.core, fetcher, compile); assert.equal(second.cacheHit, true);
  assert.equal(second.core.module, first.core.module); assert.equal(compilations, 1); assert.equal(fetches, 3); assert.equal(binaryFetches, 1);
  assert.ok(signals.every(signal => signal.aborted), "Completed static fetches release their cancellation resources");
  const changed = await prepareVpxCompiledCore(first.core, staticFetcher(new Uint8Array([0,97,115,109,1,0,0,0])), compile);
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
    await assert.rejects(prepareVpxCompiledCore(undefined, async url => url.endsWith(".json") ? fetchCode(url) : response, compile));
  assert.equal(compiled, false);
  await assert.rejects(prepareVpxCompiledCore(undefined, async url => url.endsWith(".json") ? fetchCode(url) : responseFor(new Uint8Array([0,97,115,109,1,0,0,0]))), /manifest/);
  await assert.rejects(prepareVpxCompiledCore(undefined, async () => new Response("{}")), /manifest/);
  await assert.rejects(prepareVpxCompiledCore(undefined, async () => new Response("x", { headers: { "content-length": "65537" } })), /bound/);
});

test("unavailable/changed manifests never authorize stale code, and decoded HTTP bodies use decoded bounds", async () => {
  const first = await prepareVpxCompiledCore(undefined, fetchCode);
  await assert.rejects(prepareVpxCompiledCore(first.core, async () => new Response("{}")), /manifest/);
  const changed = staticFetcher(new Uint8Array([0,97,115,109,1,0,0,0]));
  await assert.rejects(prepareVpxCompiledCore(first.core, async url => url.endsWith(".json") ? changed(url) : fetchCode(url)), /match/);
  const decoded = await prepareVpxCompiledCore(undefined, async url => url.endsWith(".json") ? fetchCode(url)
    : new Response(wasm, { headers: { "content-encoding": "gzip", "content-length": "8" } }));
  assert.equal(decoded.core.sha256, first.core.sha256);
});
