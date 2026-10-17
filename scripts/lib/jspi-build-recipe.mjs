import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeAlignment16Workflow as parentWorkflow, makeDurationDrainBranchCaller, makeDurationDrainCollector } from "./duration-drain-build-recipe.mjs";
export const makeAlignment16Workflow = source => exactPatch(parentWorkflow(source), [
  ["node media/ffmpeg/build-mpeg2-duration-drain.mjs", "node media/ffmpeg/build-mpeg2-jspi.mjs"],
]).generated;
export function makeJspiBranchCaller(source, root) {
  return exactPatch(makeDurationDrainBranchCaller(source, root).generated, [
    ["codex/mpeg2-duration-drain-20261015", "codex/mpeg2-jspi-20261018"],
    ["evidence/mpeg2-duration-drain-build-branch-2026-10-15", "evidence/mpeg2-jspi-build-branch-2026-10-18"],
    ["duration-drain-git-index-", "jspi-git-index-"],
    ['["scripts/prepare-duration-drain-build-branch.mjs",', '["scripts/prepare-jspi-build-branch.mjs", "scripts/lib/jspi-build-recipe.mjs", "scripts/prepare-duration-drain-build-branch.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/duration-drain-build-recipe.mjs")).href,
      pathToFileURL(path.join(root, "scripts/lib/jspi-build-recipe.mjs")).href],
    ["Build private duration-exact packet drain with unchanged clocks/codecs/fixed heaps", "Build private JSPI suspension with unchanged clocks/codecs/fixed heaps"],
  ]);
}
export function makeJspiCollector(source, root) {
  const checks = `  const { makeJspiShellRecipe, JSPI_IMPORTS } = await import(${JSON.stringify(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-jspi-builder-recipe.mjs")).href)});
  const jspiShell = makeJspiShellRecipe((await readFile(path.join(root, "media/ffmpeg/build-mpeg2-split-pipeline.sh"))).toString());
  assert.equal(manifest.jspi.generatedShell, jspiShell.generated); assert.equal(manifest.jspi.generatedShellSha256, sha(jspiShell.generated));
  assert.equal(manifest.jspi.parentShellSha256, jspiShell.parentSha256); assert.deepEqual(manifest.jspi.shellEdits, jspiShell.edits);
  assert.deepEqual(manifest.jspi.asyncImports, JSPI_IMPORTS); assert.deepEqual(manifest.jspi.asyncExports, ["within_remux"]);
  assert.equal(manifest.jspi.asyncifyInstrumentationRemoved, true); assert.equal(manifest.asyncifyStackBytesDecoder, 0);
  assert.equal(manifest.jspi.engineManagedStackMemoryBytes, null); assert.equal(manifest.jspi.engineManagedStackIncludedInProcessTreeMeasurement, true);
  assert.equal(manifest.jspi.aggregateWasmMemoryBytes, 50331648);
  for (const key of ["codecSettingsChanged", "heapLimitsChanged", "browserFlagsChanged", "productionIoChanged", "browserFidelityVerified",
    "fullOriginalCompleted", "speedGainProven", "memoryAcceptance", "publicAcceptance"]) assert.equal(manifest.jspi[key], false);
  const glue = (await readFile(path.join(download, "within-mpeg2-split.mjs"))).toString();
  assert.ok(glue.includes("WebAssembly.Suspending") && glue.includes("WebAssembly.promising"));
  assert.deepEqual(WebAssembly.Module.exports(new WebAssembly.Module(decoder)).filter(row => /asyncify_(start|stop)_(unwind|rewind)/.test(row.name)), []);
`;
  return exactPatch(makeDurationDrainCollector(source, root).generated, [
    ["work/mpeg2-duration-drain-${runId}", "work/mpeg2-jspi-${runId}"],
    ["evidence/mpeg2-duration-drain-build-${runId}.json", "evidence/mpeg2-jspi-build-${runId}.json"],
    ["evidence/mpeg2-duration-drain-build-branch-2026-10-15.json", "evidence/mpeg2-jspi-build-branch-2026-10-18.json"],
    ["duration-drain-artifact-", "jspi-artifact-"],
    ["private-duration-drain-candidate-not-browser-acceptance", "private-jspi-duration-drain-not-browser-acceptance"],
    ["  complete = true;", checks + "  complete = true;"],
    ["actual-duration-drain-build-unit-verified-not-browser-acceptance", "actual-jspi-build-unit-verified-not-browser-acceptance"],
  ]);
}
