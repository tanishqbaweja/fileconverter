import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeAlignment16Workflow as parentWorkflow, makeJspiBranchCaller, makeJspiCollector } from "./jspi-build-recipe.mjs";
const uri = (root, file) => pathToFileURL(path.join(root, file)).href;
export const makeAlignment16Workflow = source => exactPatch(parentWorkflow(source), [
  ["node media/ffmpeg/build-mpeg2-jspi.mjs", "node media/ffmpeg/build-mpeg2-scaled-properties.mjs"],
]).generated;
export function makeScaledPropertiesBranchCaller(source, root) {
  return exactPatch(makeJspiBranchCaller(source, root).generated, [
    ["codex/mpeg2-jspi-20261018", "codex/mpeg2-scaled-properties-20261024"],
    ["evidence/mpeg2-jspi-build-branch-2026-10-18", "evidence/mpeg2-scaled-properties-build-branch-2026-10-24"],
    ["jspi-git-index-", "scaled-properties-git-index-"],
    ['["scripts/prepare-jspi-build-branch.mjs",', '["scripts/prepare-scaled-properties-build-branch.mjs", "scripts/lib/scaled-properties-build-recipe.mjs", "scripts/prepare-jspi-build-branch.mjs",'],
    [uri(root, "scripts/lib/jspi-build-recipe.mjs"), uri(root, "scripts/lib/scaled-properties-build-recipe.mjs")],
    ["Build private JSPI suspension with unchanged clocks/codecs/fixed heaps", "Replace stale scaler frame properties with unchanged pixels/codecs/fixed heaps"],
  ]);
}
export function makeScaledPropertiesCollector(source, root) {
  const sourceUri = uri(root, "media/ffmpeg/mpeg2-scaled-properties-source.mjs");
  const checks = `  const scaled = manifest.scaledProperties, actual = scaled.actualWasm32;
  assert.equal(sha(scaled.exactSource), scaled.sha256); assert.deepEqual(JSON.parse(scaled.exactSource), actual);
  assert.equal(actual.status, "passed-native-scaled-property-lifecycle");
  assert.equal(actual.oldCopies, 17); assert.equal(actual.oldSideData, 17);
  assert.equal(actual.errorSymbol, "EFBIG"); assert.ok(actual.expectedWireResult < 0); assert.equal(actual.oldWireResult, actual.expectedWireResult);
  assert.equal(actual.correctedCopies, 1000); assert.equal(actual.maximumCorrectedSideData, 1); assert.equal(actual.mediaConversions, 0);
  for (const field of ["pixelStorageAndBytesUnchanged", "sourcePropertiesPreserved", "staleDictionaryRemoved", "bFramePolicyUnchanged"]) assert.equal(actual[field], true);
  const { makeScaledPropertiesKernel } = await import(${JSON.stringify(sourceUri)});
  const expectedScaled = makeScaledPropertiesKernel((await readFile(path.join(root, "media/ffmpeg/mpeg2-candidate.c"))).toString());
  assert.equal(scaled.parentKernelSha256, sha(expectedScaled.scaledPropertiesParent));
  assert.equal(scaled.generatedKernelSha256, sha(expectedScaled.generated)); assert.equal(manifest.packetCache.generatedKernel, expectedScaled.generated);
  assert.deepEqual(scaled.edits, expectedScaled.scaledPropertiesEdits); assert.equal(scaled.include, expectedScaled.scaledPropertiesInclude);
  assert.equal(scaled.helperSha256, sha(await readFile(path.join(root, "media/ffmpeg/mpeg2-scaled-frame-properties.h"))));
  const { makeScaledPropertiesShellRecipe } = await import(${JSON.stringify(uri(root, "media/ffmpeg/mpeg2-scaled-properties-builder-recipe.mjs"))});
  const expectedScaledShell = makeScaledPropertiesShellRecipe((await readFile(path.join(root, "media/ffmpeg/build-mpeg2-split-pipeline.sh"))).toString());
  assert.equal(scaled.actualBuildShell, expectedScaledShell.generated); assert.equal(scaled.actualBuildShellSha256, sha(expectedScaledShell.generated));
  assert.equal(manifest.alignedReuse.generatedRecipeSha256, scaled.actualBuildShellSha256);
  assert.equal(scaled.sideDataLimit, 16); assert.equal(scaled.propertyWireCapacityBytes, 65536);
  for (const field of ["pixelStorageChanged", "bFramePolicyChanged", "codecSettingsChanged", "heapLimitsChanged", "productionIoChanged",
    "browserFidelityVerified", "fullOriginalCompleted", "memoryAcceptance", "publicAcceptance"]) assert.equal(scaled[field], false);
  assert.notEqual(manifest.artifacts["within-mpeg2-split.wasm"], "4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57");
`;
  return exactPatch(makeJspiCollector(source, root).generated, [
    ["work/mpeg2-jspi-${runId}", "work/mpeg2-scaled-properties-${runId}"],
    ["evidence/mpeg2-jspi-build-${runId}.json", "evidence/mpeg2-scaled-properties-build-${runId}.json"],
    ["evidence/mpeg2-jspi-build-branch-2026-10-18.json", "evidence/mpeg2-scaled-properties-build-branch-2026-10-24.json"],
    ["jspi-artifact-", "scaled-properties-artifact-"],
    ["private-jspi-duration-drain-not-browser-acceptance", "private-scaled-properties-jspi-not-browser-acceptance"],
    [`await import(${JSON.stringify(uri(root, "media/ffmpeg/mpeg2-duration-drain-source.mjs"))})`, `await import(${JSON.stringify(sourceUri)})`],
    ["  complete = true;", checks + "  complete = true;"],
    ["actual-jspi-build-unit-verified-not-browser-acceptance", "actual-scaled-properties-build-unit-verified-not-browser-acceptance"],
  ]);
}
