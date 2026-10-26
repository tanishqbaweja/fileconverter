import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";

let handlerCalls = 0;
const bundle = await build({ entryPoints: ["worker/index.ts"], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "stub-only-framework-handler", setup(builder) {
    builder.onResolve({ filter: /^vinext\/server\/app-router-entry$/ }, () => ({ path: "handler", namespace: "test-framework" }));
    builder.onLoad({ filter: /.*/, namespace: "test-framework" }, () => ({ contents:
      'export default { async fetch() { globalThis.__withinStaticHostHandlerCalled(); return new Response("application"); } };' }));
  } }] });
globalThis.__withinStaticHostHandlerCalled = () => { handlerCalls++; };
const { default: worker } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
const reject = async request => worker.fetch(request, {}, {});

test("static host rejects body-bearing methods before any framework handler consumes them", async () => {
  const before = handlerCalls;
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const request = new Request("https://app.local/", { method, body: "synthetic-control-only" });
    const response = await reject(request);
    assert.equal(response.status, 405); assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.equal(request.bodyUsed, false); assert.equal(await response.text(), "");
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.ok(response.headers.get("content-security-policy"));
  }
  assert.equal(handlerCalls, before);
});

test("unused image optimizers reject GET, HEAD, encoded aliases and trailing slashes without framework dispatch", async () => {
  const before = handlerCalls;
  for (const pathname of ["/_vinext/image", "/_next/image", "/_vinext/image/", "/%5Fvinext/%69mage", "/%5Fnext/image/"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await reject(new Request("https://app.local" + pathname + "?url=%2Ficon.svg&w=640&q=80", { method }));
      assert.equal(response.status, 404); assert.equal(await response.text(), "");
      assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
    }
  }
  assert.equal(handlerCalls, before);
});

test("ordinary application/engine reads and HEAD remain available; malformed escaped paths fail closed", async () => {
  const before = handlerCalls;
  for (const pathname of ["/", "/?test=1", "/engines/remux/within-remux.wasm", "/icon.svg", "/site.webmanifest"]) {
    const response = await reject(new Request("https://app.local" + pathname));
    assert.equal(response.status, 200); assert.equal(await response.text(), "application");
  }
  assert.equal((await reject(new Request("https://app.local/", { method: "HEAD" }))).status, 200);
  assert.equal(handlerCalls, before + 6);
  assert.equal((await reject(new Request("https://app.local/%xy"))).status, 400);
  assert.equal(handlerCalls, before + 6);
});

test("worker has no native/server image transformer and patched framework pins stay synchronized", async () => {
  const source = await readFile(path.resolve("worker/index.ts"), "utf8");
  assert.doesNotMatch(source, /handleImageOptimization|transformImage|env\.IMAGES|\.input\(body\)/);
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.dependencies.next, "16.4.2");
  for (const name of ["react", "react-dom"]) assert.equal(pkg.dependencies[name], "19.2.8");
  assert.equal(pkg.devDependencies["react-server-dom-webpack"], "19.2.8");
});

test("privacy browser safety is in setup, before owned profile/browser creation; CI executes policy against production", async () => {
  const source = await readFile("tests/browser/privacy-offline.spec.ts", "utf8");
  const setup = source.slice(source.indexOf("test.beforeAll"), source.indexOf("test.afterAll"));
  assert.ok(setup.indexOf("expect(memory.safeToStart") < setup.indexOf("createOwnedRuntimeScratch("));
  assert.ok(setup.indexOf("createOwnedRuntimeScratch(") < setup.indexOf("launchPersistentContext("));
  assert.match(source, /finally \{ await runtime\?\.close\(\); \}/);
  assert.doesNotMatch(source, /rm\(profileRoot/);
  assert.match(setup, /createOwnedRuntimeScratch\("po-"\)/);
  assert.match(setup, /Buffer.byteLength\(socketPath\).*toBeLessThan\(108\)/);
  const hosted = "/home/runner/work/fileconverter/fileconverter/work/po-XXXXXX/org.chromium.Chromium.XXXXXX/SingletonSocket";
  assert.ok(Buffer.byteLength(hosted) < 108);
  assert.ok(Buffer.byteLength(hosted.replace("/po-XXXXXX/", "/privacy-offline-XXXXXX/")) >= 108);
  assert.match(await readFile(".github/workflows/ci.yml", "utf8"), /playwright test tests\/browser\/privacy-offline.spec.ts tests\/browser\/static-host-policy.spec.ts/);
});
test("production configuration routes every request through the static policy before the asset binding", async () => {
  const config = await readFile("vite.config.ts", "utf8");
  assert.match(config, /assets:\s*\{\s*binding:\s*"ASSETS",\s*run_worker_first:\s*true\s*\}/);
  const driver = await readFile("scripts/run-owned-privacy-offline.mjs", "utf8");
  assert.match(driver, /builtConfig.assets\?\.binding/); assert.match(driver, /builtConfig.assets\?\.run_worker_first/);
  assert.match(driver, /Delivered hosting config must gate all requests before asset routing/);
});
test("worker-first static reads reach the actual asset binding before framework fallback, but refused methods never reach either", async () => {
  const assetRequests = [], env = { ASSETS: { async fetch(request) {
    assetRequests.push({ method: request.method, url: request.url });
    const status = new URL(request.url).pathname.startsWith("/assets/") ? 200 : 404;
    return new Response(request.method === "HEAD" ? null : status === 200 ? "static-code" : null,
      { status, headers: { "content-type": "text/javascript", "cache-control": "public, max-age=31536000, immutable" } });
  } } }, before = handlerCalls;
  for (const method of ["GET", "HEAD"]) {
    const response = await worker.fetch(new Request("https://app.local/assets/app.js", { method }), env, {});
    assert.equal(response.status, 200); assert.equal(await response.text(), method === "HEAD" ? "" : "static-code");
    assert.equal(response.headers.get("content-type"), "text/javascript");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
  }
  assert.equal(handlerCalls, before); assert.equal(assetRequests.length, 2);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const request = new Request("https://app.local/assets/app.js", { method, body: "synthetic-control-only" });
    const response = await worker.fetch(request, env, {}); assert.equal(response.status, 405); assert.equal(request.bodyUsed, false);
  }
  assert.equal(assetRequests.length, 2); assert.equal(handlerCalls, before);
  const fallback = await worker.fetch(new Request("https://app.local/"), env, {});
  assert.equal(fallback.status, 200); assert.equal(await fallback.text(), "application");
  assert.equal(assetRequests.length, 3); assert.equal(handlerCalls, before + 1);
});
