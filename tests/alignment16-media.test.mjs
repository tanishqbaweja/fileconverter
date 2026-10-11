import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { attemptMediaSourceFiles, verifyAttemptPlaneCandidate } from "../scripts/lib/alignment16-plane-candidate.mjs";
import { makeAttemptMediaBrowserRecipe, makeAttemptMediaCaller } from "../scripts/lib/alignment16-media-recipe.mjs";
import { FROZEN_BROWSER_SOURCES } from "../scripts/lib/single-idle-browser-recipe.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), json = async file => JSON.parse(await read(file));
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("compound actual decoder/plane encoder, exact source closure, observer adapter and three-case recipe retain gates and finally cleanup", async () => {
  const files = await attemptMediaSourceFiles(root); assert.ok(files.length <= 256);
  const current = await json("evidence/2026-10-11T18-16-00-125Z-alignment16-abort-control-executed-sources.json");
  for (const file of Object.keys(current.sourcePins)) assert.ok(files.includes(file));
  for (const file of files) await access(path.join(root, file));
  const runtime = await createOwnedRuntimeScratch("alignment16-media-");
  try {
    const sources = {}; for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = (await read(file)).toString();
    const branch = await json("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"), build = await json("evidence/mpeg2-encoder-plane-build-38044000567.json");
    const recipe = await makeAttemptMediaBrowserRecipe(sources, root, runtime.directory, "2026-10-11T00-00-00-000Z", branch, build);
    const manifest = await verifyAttemptPlaneCandidate(root, runtime.directory);
    assert.equal(manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
    assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014");
    assert.equal(manifest.provenance.encoder.commit, "7b6dd8223d4a71b7f067017c6c8b5a7fa960e0c1");
    assert.equal(manifest.provenance.decoder.commit, "51da078101f96b9194269c179384cdf9a1a82a33");
    assert.equal(manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(manifest.allowMemoryGrowth, false);
    assert.ok(recipe.compositeAdapter.bytes < 32768); assert.match(recipe.stage, /createCompositeAllocationAbortCapture/);
    assert.match(recipe.stage, /mapped\[9\] = 4000000/); assert.match(recipe.stage, /decoderAbort.withPriorOnAbort\(options.onAbort\)/);
    for (const token of ["toBeGreaterThanOrEqual(0.98)", "validateSmallMatroskaMp4Timeline", "sourceDecodedAudioHashes", "maxReadChunkBytes",
      "retiredWorkerAbsent", "productionReplacementWorkerUsed", "noPageReload: true", "fault=write", "partialBytes"])
      assert.ok(recipe.spec.includes(token), token);
    for (const token of ["windowsHide: true", "owned-identity-absent", "Never stop an unrelated or reused PID", "finishOwnedCleanup"])
      assert.ok(recipe.driver.includes(token), token);
    for (const source of [recipe.stage, recipe.driver, recipe.config]) syntax(source);
    const config = await import("data:text/javascript;base64," + Buffer.from(recipe.config).toString("base64"));
    for (const title of ["private split MPEG2 hevc to mp4 via direct:", "private split MPEG2 propagates direct output write failure", "private split MPEG2 cancels after genuine direct output"])
      assert.ok(config.default.grep.test(title), title);
    assert.equal(config.default.grep.test("private split MPEG2 hevc to mp4 via opfs:"), false);
    assert.equal(config.default.retries, 0); assert.equal(config.default.use.headless, true); assert.equal(recipe.publicAcceptance, false);
    assert.equal(sha(await readFile(path.join(runtime.directory, "split-encoder.wasm"))), manifest.artifacts["split-encoder.wasm"]);
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
test("new bounded short caller exactly reverses to original while retaining protected whole SHA, host/disk/source/archive and cleanup gates", async () => {
  const source = (await read("scripts/validate-mpeg2-encoder-plane-goldens.mjs")).toString(), recipe = makeAttemptMediaCaller(source, root);
  let reversed = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replaceAll(after, before);
  for (const [before, after] of recipe.initialEdits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, source); syntax(recipe.generated);
  for (const token of ["Keep2GiB host guard", "diskBytes >= 2147483648", "2958573265", "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34",
    "postSourcePins, sourcePins", "bytes.length <= 8388608", "runtime.close()", "Preserve failure; no automatic retry", "originalFullSourceAcceptance: false"])
    assert.ok(recipe.generated.includes(token), token);
  assert.throws(() => makeAttemptMediaCaller(source + "\n", root));
});

