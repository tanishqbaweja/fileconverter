import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { FROZEN_BROWSER_SOURCES } from "../scripts/lib/single-idle-browser-recipe.mjs";
import { inputScanSourceFiles, makeInputScanBrowserRecipe, makeInputScanCaller } from "../scripts/lib/input-scan-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), json = async file => JSON.parse(await read(file));
test("whole-original input-only browser recipe uses actual bounded production bridge with no conversion/fixture generation", async () => {
  const files = await inputScanSourceFiles(root); assert.ok(files.length <= 256); for (const file of files) await access(path.join(root, file));
  const runtime = await createOwnedRuntimeScratch("packet-cache-media-");
  try {
    const sources = {}; for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = (await read(file)).toString();
    const recipe = await makeInputScanBrowserRecipe(sources, root, runtime.directory, "2026-10-13T00-00-00-000Z",
      await json("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"), await json("evidence/mpeg2-encoder-plane-build-38044000567.json"));
    assert.equal(recipe.inputOnlyDiagnostic, true); assert.equal(recipe.noGeneratedFixtures, true);
    const spec = recipe.spec.slice(recipe.spec.indexOf("test.beforeAll"));
    assert.ok(!spec.includes("await native(")); assert.ok(!spec.includes("await validateConversion("));
    for (const token of ["test.mkv", "2958573265", "outputBytes).toBe(0)", "forbiddenRequests", "productionWorkerRetired", "originalWorker.evaluate", "notConversion: true"])
      assert.ok(recipe.spec.includes(token), token);
    assert.ok(recipe.stage.includes("read: inputCapture.read, inputSize: originalBridge.inputSize"));
    assert.ok(recipe.spec.includes("expect(sample.acquisitions).toBe(1)"));
    const config = await import("data:text/javascript;base64," + Buffer.from(recipe.config).toString("base64"));
    assert.equal(config.default.use.headless, true); assert.equal(config.default.retries, 0);
    assert.ok(config.default.grep.test("private production input scans whole original")); assert.ok(!config.default.grep.test("private split MPEG2 hevc to mp4 via direct:"));
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
test("input-only caller preserves original whole checksum/cleanup and explicitly separates outcome from conversion", async () => {
  const caller = makeInputScanCaller((await read("scripts/validate-mpeg2-encoder-plane-goldens.mjs")).toString(), root).generated;
  for (const token of ["whole-original-input-only-scan-passed-not-conversion", "input-only-original-scan.json", "2958573265", "postSourcePins, sourcePins",
    "originalFullSourceAcceptance: false", "runtime.close()", "diskBytes >= 2147483648"])
    assert.ok(caller.includes(token), token);
});
