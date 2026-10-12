import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { FROZEN_BROWSER_SOURCES } from "../scripts/lib/single-idle-browser-recipe.mjs";
import { inputReadMediaSourceFiles, makeInputReadMediaBrowserRecipe, makeInputReadMediaCaller } from "../scripts/lib/input-read-media-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), json = async file => JSON.parse(await read(file));
test("fresh bounded input diagnostic retains native artifacts and all old privacy/fidelity/recovery gates, adds read failure", async () => {
  const files = await inputReadMediaSourceFiles(root); assert.ok(files.length <= 256); for (const file of files) await access(path.join(root, file));
  const runtime = await createOwnedRuntimeScratch("packet-cache-media-");
  try {
    const sources = {}; for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = (await read(file)).toString();
    const recipe = await makeInputReadMediaBrowserRecipe(sources, root, runtime.directory, "2026-10-13T00-00-00-000Z",
      await json("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"), await json("evidence/mpeg2-encoder-plane-build-38044000567.json"));
    assert.equal(recipe.composition.manifest.artifacts["within-mpeg2-split.wasm"], "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
    assert.equal(recipe.composition.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
    for (const token of ["toBeGreaterThanOrEqual(0.98)", "retiredWorkerAbsent", "productionReplacementWorkerUsed", "forbiddenRequests", "partialBytes",
      "actual-asyncify-storage-lifecycle", "input-read-control-start", "NotReadableError", "WITHIN_INPUT_READ_FAILURE", "requestedBytes).toBe(65536)"])
      assert.ok(recipe.spec.includes(token), token);
    assert.ok(recipe.stage.includes("originalBridge.read(offset, destination)"));
    assert.equal(recipe.inputReadDiagnostic.retries, 0);
    const config = await import("data:text/javascript;base64," + Buffer.from(recipe.config).toString("base64"));
    assert.equal(config.default.use.headless, true); assert.equal(config.default.retries, 0);
    for (const title of ["hevc to mp4 via direct:", "propagates direct output write failure", "cancels after genuine direct output", "propagates input read failure"])
      assert.ok(config.default.grep.test("private split MPEG2 " + title));
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
test("fresh caller retains protected whole-file, owned cleanup and bounded source archive gates", async () => {
  const recipe = makeInputReadMediaCaller((await read("scripts/validate-mpeg2-encoder-plane-goldens.mjs")).toString(), root);
  for (const token of ["Keep2GiB host guard", "diskBytes >= 2147483648", "2958573265", "postSourcePins, sourcePins", "bytes.length <= 8388608", "runtime.close()",
    "Preserve failure; no automatic retry", "originalFullSourceAcceptance: false", "input-read-media.json"])
    assert.ok(recipe.generated.includes(token), token);
});
