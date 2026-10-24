import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "../../scripts/lib/ebml-reuse-browser-components.mjs";
import { makeJspiShellRecipe, makeJspiHostedBuilder,
  makeAlignment16Builder as parentInner, makePacketCacheOuterBuilder as parentOuter,
  makePacketCacheHevcWrapper as parentHevc, makePacketCachePipelineGenerator as parentPipeline,
} from "./mpeg2-jspi-builder-recipe.mjs";
export { makeJspiShellRecipe };
export const SCALED_PROPERTIES_FILES = ["media/ffmpeg/mpeg2-scaled-frame-properties.h", "media/ffmpeg/mpeg2-scaled-properties-source.mjs",
  "media/ffmpeg/mpeg2-scaled-properties-builder-recipe.mjs", "media/ffmpeg/build-mpeg2-scaled-properties.mjs",
  "media/ffmpeg/make-mpeg2-scaled-properties-pipeline.mjs", "tests/native/mpeg2-scaled-frame-properties.c",
  "scripts/lib/scaled-properties-build-recipe.mjs", "scripts/prepare-scaled-properties-build-branch.mjs",
  "scripts/collect-scaled-properties-build.mjs", "tests/mpeg2-scaled-properties.test.mjs"];
const uri = (root, file) => pathToFileURL(path.join(root, "media/ffmpeg", file)).href;
const routes = root => [[uri(root, "mpeg2-jspi-builder-recipe.mjs"), uri(root, "mpeg2-scaled-properties-builder-recipe.mjs")]];
export function makeScaledPropertiesShellRecipe(source) {
  const parent = makeJspiShellRecipe(source).generated;
  const marker = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  const smoke = `# Real pinned Wasm avutil: reproduce side-data overflow, then exercise replacement.
emcc "\${SCRIPT_DIR}/../../tests/native/mpeg2-scaled-frame-properties.c" "\${SCRIPT_DIR}/mpeg2-aligned-reuse.c" \\
  -I"\${PREFIX}/include" -I"\${SCRIPT_DIR}" "\${PREFIX}/lib/libavutil.a" \\
  -O2 -Wall -Wextra -Werror -Wno-unused-function -Wno-error=unused-command-line-argument -UNDEBUG -pthread \\
  -Wl,--wrap=posix_memalign -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node \\
  -sFILESYSTEM=0 -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sSTACK_SIZE=262144 -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
  -o "\${BUILD_ROOT}/scaled-properties-smoke.js"
node "\${BUILD_ROOT}/scaled-properties-smoke.js" > "\${OUTPUT_ROOT}/scaled-properties-smoke.json"
test -s "\${OUTPUT_ROOT}/scaled-properties-smoke.json"
`;
  return { ...exactPatch(parent, [[marker, smoke + marker],
    ["make-mpeg2-duration-drain-pipeline.mjs", "make-mpeg2-scaled-properties-pipeline.mjs"]]), parent,
    codecSettingsChanged: false, heapLimitsChanged: false, publicAcceptance: false };
}
export const makeScaledPropertiesShellText = source => makeScaledPropertiesShellRecipe(source).generated;
export const makeAlignment16Builder = (source, root) => exactPatch(parentInner(source, root).generated, [
  ["media/ffmpeg/mpeg2-jspi-builder-recipe.mjs", "media/ffmpeg/mpeg2-scaled-properties-builder-recipe.mjs"],
  ["makeJspiShellText as makeAlignedReuseRecipe", "makeScaledPropertiesShellText as makeAlignedReuseRecipe"],
]);
export const makePacketCacheOuterBuilder = (source, root) => exactPatch(parentOuter(source, root).generated, routes(root));
export const makePacketCacheHevcWrapper = (source, root) => exactPatch(parentHevc(source, root).generated, routes(root));
export const makePacketCachePipelineGenerator = (source, root) => exactPatch(parentPipeline(source, root).generated, [
  [uri(root, "mpeg2-duration-drain-source.mjs"), uri(root, "mpeg2-scaled-properties-source.mjs")],
]);
export function makeScaledPropertiesHostedBuilder(source, root) {
  const sourceUri = uri(root, "mpeg2-scaled-properties-source.mjs");
  const checks = `  const scaledPath = path.join(output, "scaled-properties-smoke.json");
  const scaledBytes = await readFile(scaledPath), scaled = JSON.parse(scaledBytes);
  assert.equal(scaled.status, "passed-native-scaled-property-lifecycle");
  assert.equal(scaled.oldCopies, 17); assert.equal(scaled.oldSideData, 17);
  assert.equal(scaled.errorSymbol, "EFBIG"); assert.ok(scaled.expectedWireResult < 0); assert.equal(scaled.oldWireResult, scaled.expectedWireResult);
  assert.equal(scaled.correctedCopies, 1000); assert.equal(scaled.maximumCorrectedSideData, 1); assert.equal(scaled.mediaConversions, 0);
  for (const field of ["pixelStorageAndBytesUnchanged", "sourcePropertiesPreserved", "staleDictionaryRemoved", "bFramePolicyUnchanged"]) assert.equal(scaled[field], true);
  const { makeScaledPropertiesKernel } = await import(${JSON.stringify(sourceUri)});
  const scaledKernel = makeScaledPropertiesKernel((await read("media/ffmpeg/mpeg2-candidate.c")).toString());
  const { makeScaledPropertiesShellRecipe } = await import(${JSON.stringify(uri(root, "mpeg2-scaled-properties-builder-recipe.mjs"))});
  const scaledShell = makeScaledPropertiesShellRecipe((await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")).toString());
  assert.equal(manifest.alignedReuse.generatedRecipeSha256, sha(scaledShell.generated));
  assert.equal(manifest.packetCache.generatedKernel, scaledKernel.generated);
  assert.notEqual(manifest.artifacts["within-mpeg2-split.wasm"], "4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57");
  manifest.scope = "private-scaled-properties-jspi-not-browser-acceptance";
  manifest.scaledProperties = { actualWasm32: scaled, exactSource: scaledBytes.toString(), sha256: sha(scaledBytes),
    parentKernelSha256: sha(scaledKernel.scaledPropertiesParent), generatedKernelSha256: sha(scaledKernel.generated),
    edits: scaledKernel.scaledPropertiesEdits, include: scaledKernel.scaledPropertiesInclude,
    actualBuildShell: scaledShell.generated, actualBuildShellSha256: sha(scaledShell.generated),
    helperSha256: sha(await read("media/ffmpeg/mpeg2-scaled-frame-properties.h")),
    sideDataLimit: 16, propertyWireCapacityBytes: 65536, pixelStorageChanged: false, bFramePolicyChanged: false,
    codecSettingsChanged: false, heapLimitsChanged: false, productionIoChanged: false,
    browserFidelityVerified: false, fullOriginalCompleted: false, memoryAcceptance: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
  await unlink(scaledPath); // Exact tiny result retained in manifest, preserve20-file cap.
`;
  return exactPatch(makeJspiHostedBuilder(source, root).generated, [
    ...routes(root),
    [`from ${JSON.stringify(uri(root, "mpeg2-duration-drain-source.mjs"))};`, `from ${JSON.stringify(sourceUri)};`],
    // Both the top-level kernel import and the independent drain audit must use it.
    [`await import(${JSON.stringify(uri(root, "mpeg2-duration-drain-source.mjs"))})`, `await import(${JSON.stringify(sourceUri)})`],
    ["const sourceFiles = [", `const sourceFiles = [${SCALED_PROPERTIES_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ["  const retained = JSON.parse(await readFile(manifestPath));", checks + "  const retained = JSON.parse(await readFile(manifestPath));"],
  ]);
}
