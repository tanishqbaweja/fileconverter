import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createVp9DurationAssetResponder, loadVp9DurationCpuAssets } from "../scripts/lib/vp9-duration-browser-assets.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const origin = "http://127.0.0.1:12345", assets = { runId: 12345678, sourceHead: "a".repeat(40), files: {
  "within-remux.mjs": { path: "private-static.mjs", sha256: "1".repeat(64) },
  "within-remux.wasm": { path: "private-static.wasm", sha256: "2".repeat(64) } } };
function route(url, method = "GET", status = 200, fail = false) {
  const calls = [], stub = { request: () => ({ url: () => url, method: () => method }),
    fetch: async options => { calls.push({ fetch: options }); return { status: () => status,
      headers: () => ({ "content-type": url.endsWith(".wasm") ? "application/wasm" : "text/javascript", "cache-control": "public, max-age=31536000, immutable",
        "cross-origin-resource-policy": "same-origin", "content-length": "OLD", "content-encoding": "gzip", "transfer-encoding": "chunked", etag: "OLD" }),
      dispose: async () => calls.push("dispose") }; },
    fulfill: async options => { calls.push({ fulfill: options }); if (fail) throw new Error("fulfill failed"); } };
  return { stub, calls };
}
test("private static override preserves production MIME/CORP/cache headers and never reads an original media file", async () => {
  const responder = createVp9DurationAssetResponder(origin, assets), report = responder.report();
  for (const name of ["within-remux.mjs", "within-remux.wasm"]) {
    const { stub, calls } = route(origin + "/engines/remux/" + name); assert.equal(await responder.respond(stub), true);
    assert.deepEqual(calls[0], { fetch: { method: "HEAD", maxRedirects: 0, timeout: 10000 } });
    const options = calls[1].fulfill; assert.equal(options.path, assets.files[name].path);
    assert.equal(options.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.equal(options.headers["cross-origin-resource-policy"], "same-origin"); assert.equal(options.headers["content-length"], undefined);
    assert.equal(options.headers["content-encoding"], undefined); assert.equal(options.headers.etag, '"' + assets.files[name].sha256 + '"');
    assert.equal(options.headers["transfer-encoding"], undefined);
    assert.equal(calls.at(-1), "dispose");
  }
  assert.deepEqual(report.served, { javascript: 1, wasm: 1 }); assert.equal(report.publicAssetReplacement, false); assert.equal(report.cachePolicyChanged, false);
});
test("other origins, assets, inputs, outputs and upload methods are never substituted", async () => {
  const responder = createVp9DurationAssetResponder(origin, assets);
  for (const [url, method] of [["https://example.com/engines/remux/within-remux.wasm", "GET"], [origin + "/test.mkv", "GET"],
    [origin + "/browser-output.webm", "GET"], [origin + "/engines/webcodecs-vp9/within-webcodecs-vp9.wasm", "GET"],
    [origin + "/engines/remux/within-remux.wasm", "POST"]]) {
    const { stub, calls } = route(url, method); assert.equal(await responder.respond(stub), false); assert.deepEqual(calls, []);
  }
});
test("failed header validation or fulfillment still disposes its metadata response", async () => {
  for (const [status, fail] of [[404, false], [200, true]]) {
    const { stub, calls } = route(origin + "/engines/remux/within-remux.mjs", "GET", status, fail);
    await assert.rejects(createVp9DurationAssetResponder(origin, assets).respond(stub)); assert.equal(calls.at(-1), "dispose");
  }
});
test("static substitution has a fixed request bound instead of retaining an unbounded history", async () => {
  const responder = createVp9DurationAssetResponder(origin, assets);
  for (let n = 0; n < 16; n++) await responder.respond(route(origin + "/engines/remux/within-remux.mjs").stub);
  await assert.rejects(responder.respond(route(origin + "/engines/remux/within-remux.mjs").stub), /Bound private static/);
  assert.deepEqual(responder.report().served, { javascript: 16, wasm: 0 });
});
async function loaderFixture(run) {
  const runtime = await createOwnedRuntimeScratch("vp9-duration-assets-unit-");
  try {
    const root = runtime.directory, runId = 12345678, target = path.join(root, "work", "vp9-duration-input-" + runId);
    await mkdir(target, { recursive: true }); await mkdir(path.join(root, "evidence"));
    const pins = {};
    for (const [name, text] of [["within-remux.mjs", "static mock module"], ["within-remux.wasm", "static mock tool bytes"]]) {
      const bytes = Buffer.from(text); pins[name] = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
      await writeFile(path.join(target, name), bytes, { flag: "wx" });
    }
    const receipt = { runId, head: "a".repeat(40), publicAcceptance: false, publicAssetReplacement: false,
      nativeContract: { engine: "private-vp9-packet-duration", artifacts: pins }, retainedDirectory: "work/vp9-duration-input-" + runId };
    const file = path.join(root, "evidence", "2026-11-05-vp9-duration-native-" + runId + ".json");
    await writeFile(file, JSON.stringify(receipt), { flag: "wx" });
    await run({ root, runId, target, receipt, file });
  } finally { await runtime.close(); }
}
test("real filesystem loader authenticates only the two bounded static files in the exact owned tool directory", async () => loaderFixture(async ({ root, runId, target }) => {
  const loaded = await loadVp9DurationCpuAssets(root, runId);
  assert.equal(loaded.runId, runId); assert.equal(loaded.publicAssetReplacement, false);
  assert.deepEqual(Object.keys(loaded.files), ["within-remux.mjs", "within-remux.wasm"]);
  assert.equal(loaded.files["within-remux.wasm"].path, path.join(target, "within-remux.wasm"));
}));
test("tampered private module bytes are rejected before any browser request", async () => loaderFixture(async ({ root, runId, target }) => {
  await writeFile(path.join(target, "within-remux.wasm"), "tampered static bytes");
  await assert.rejects(loadVp9DurationCpuAssets(root, runId));
}));
test("loader accepts the authenticated stream-duration/original-width engines but rejects unrecognized engines", async () => {
  for (const engine of ["private-vp9-stream-duration", "private-vp9-original-width", "unrecognized-core"]) await loaderFixture(async ({ root, runId, receipt, file }) => {
    await writeFile(file, JSON.stringify({ ...receipt, nativeContract: { ...receipt.nativeContract, engine } }));
    if (engine !== "unrecognized-core") assert.equal((await loadVp9DurationCpuAssets(root, runId)).runId, Number(runId));
    else await assert.rejects(loadVp9DurationCpuAssets(root, runId));
  });
});
test("receipt cannot redirect into another folder or turn a private source tool into a public asset replacement", async () => {
  for (const mutation of [{ retainedDirectory: "../outside" }, { publicAssetReplacement: true }, { publicAcceptance: true }])
    await loaderFixture(async ({ root, runId, receipt, file }) => {
      await writeFile(file, JSON.stringify({ ...receipt, ...mutation })); await assert.rejects(loadVp9DurationCpuAssets(root, runId));
    });
});
test("original-width receipt namespace is explicit and bounded, never an arbitrary file path", async () => loaderFixture(async ({ root, runId, receipt }) => {
  await writeFile(path.join(root, "evidence", "2026-11-06-vp9-original-width-native-" + runId + ".json"),
    JSON.stringify({ ...receipt, nativeContract: { ...receipt.nativeContract, engine: "private-vp9-original-width" } }), { flag: "wx" });
  assert.equal((await loadVp9DurationCpuAssets(root, runId, "original-width")).runId, runId);
  await assert.rejects(loadVp9DurationCpuAssets(root, runId, "../outside"));
}));
