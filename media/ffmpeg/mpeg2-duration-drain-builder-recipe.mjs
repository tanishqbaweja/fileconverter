import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makePacketDrainRecipe } from "./mpeg2-packet-drain-recipe.mjs";
import { makeAlignment16Builder as parentInner, makePacketCacheOuterBuilder as parentOuter,
  makePacketCacheHevcWrapper as parentHevc, makePacketCachePipelineGenerator as parentPipeline,
  makePacketDrainHostedBuilder } from "./mpeg2-packet-drain-builder-recipe.mjs";
export const DURATION_DRAIN_FILES = ["media/ffmpeg/mpeg2-duration-boundary.h", "media/ffmpeg/mpeg2-duration-boundary-smoke.c",
  "media/ffmpeg/mpeg2-duration-drain-source.mjs", "media/ffmpeg/mpeg2-duration-drain-builder-recipe.mjs",
  "media/ffmpeg/build-mpeg2-duration-drain.mjs", "media/ffmpeg/make-mpeg2-duration-drain-pipeline.mjs",
  "scripts/lib/duration-drain-build-recipe.mjs", "scripts/prepare-duration-drain-build-branch.mjs",
  "scripts/collect-duration-drain-build.mjs", "tests/mpeg2-duration-drain.test.mjs"];
function transform(parent, edits) {
  let generated = parent.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(restored, parent.generated);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(parent.generated), edits, publicAcceptance: false };
}
export function makeDurationDrainShellRecipe(source) {
  const parent = makePacketDrainRecipe(source);
  const marker = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  const smoke = `# Actual pinned avutil rational arithmetic versus independent integer oracle.
emcc "\${SCRIPT_DIR}/mpeg2-duration-boundary-smoke.c" "\${SCRIPT_DIR}/mpeg2-aligned-reuse.c" \\
  -I"\${PREFIX}/include" -I"\${SCRIPT_DIR}" "\${PREFIX}/lib/libavutil.a" \\
  -O2 -Wall -Wextra -Werror -Wno-error=unused-command-line-argument -UNDEBUG -pthread \\
  -Wl,--wrap=posix_memalign -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node \\
  -sFILESYSTEM=0 -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
  -o "\${BUILD_ROOT}/duration-boundary-smoke.js"
node "\${BUILD_ROOT}/duration-boundary-smoke.js" > "\${OUTPUT_ROOT}/duration-boundary-smoke.json"
test -s "\${OUTPUT_ROOT}/duration-boundary-smoke.json"
`;
  return transform(parent, [[marker, smoke + marker],
    ["make-mpeg2-packet-drain-pipeline.mjs", "make-mpeg2-duration-drain-pipeline.mjs"]]).generated;
}
export const makeAlignment16Builder = (source, root) => transform(parentInner(source, root), [
  ["media/ffmpeg/mpeg2-packet-drain-recipe.mjs", "media/ffmpeg/mpeg2-duration-drain-builder-recipe.mjs"],
  ["makePacketDrainShellRecipe as makeAlignedReuseRecipe", "makeDurationDrainShellRecipe as makeAlignedReuseRecipe"],
]);
const routes = root => [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-drain-builder-recipe.mjs")).href,
  pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-duration-drain-builder-recipe.mjs")).href]];
export const makePacketCacheOuterBuilder = (source, root) => transform(parentOuter(source, root), routes(root));
export const makePacketCacheHevcWrapper = (source, root) => transform(parentHevc(source, root), routes(root));
export const makePacketCachePipelineGenerator = (source, root) => transform(parentPipeline(source, root), [
  [pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-drain-source.mjs")).href,
    pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-duration-drain-source.mjs")).href],
]);
export function makeDurationDrainHostedBuilder(source, root) {
  const oldURI = pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-drain-source.mjs")).href;
  const newURI = pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-duration-drain-source.mjs")).href;
  const checks = `  const durationPath = path.join(output, "duration-boundary-smoke.json");
  const durationBytes = await readFile(durationPath), duration = JSON.parse(durationBytes);
  assert.equal(duration.status, "passed"); assert.equal(duration.scope, "actual-wasm32-avutil-cfr-boundaries-not-conversion");
  assert.equal(duration.sequences, 21); assert.equal(duration.iterations, 126000); assert.equal(duration.invalidCases, 15);
  assert.deepEqual(duration.lastTwoDurations, [666,667]); assert.equal(duration.regressionTotalTicks, 64000);
  assert.equal(duration.sourceOffsetLastDts, 64661); assert.equal(duration.independentIntegerOracle, true);
  assert.equal(duration.packetBytesUnchanged, true); assert.equal(duration.ptsDtsUnchanged, true);
  assert.equal(duration.allocationsAdded, 0); assert.equal(duration.conversionsPerformed, 0);
  assert.notEqual(manifest.artifacts["within-mpeg2-split.wasm"], "b65cc5991e9a74486066a9b442b1c0036d04f7e5a925bcb951971e0f060df152");
  manifest.packetDurationBoundary = { actualWasmUnit: duration, exactSource: durationBytes.toString(), sha256: sha(durationBytes),
    mapping: "difference-of-adjacent-rescaled-CFR-boundaries", parentDrainKernelSha256: sha(drainKernel.parent),
    originalKernelSha256: sha(drainKernel.originalKernel), ptsDtsRewritten: false, encoderPacketWireChanged: false,
    codecSettingsChanged: false, heapLimitsChanged: false, liveReferencesChanged: false, durationBoundaryCorrection: true,
    browserFidelityVerified: false, fullOriginalCompleted: false, memoryAcceptance: false, speedGainProven: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
  await unlink(durationPath); // Exact tiny result retained in manifest, keep20-file cap.
`;
  return transform(makePacketDrainHostedBuilder(source, root), [
    ...routes(root),
    [`import { makePacketCacheBridge, makePacketCacheKernel } from ${JSON.stringify(oldURI)};`,
      `import { makePacketCacheBridge, makePacketCacheKernel } from ${JSON.stringify(newURI)};`],
    [`const { makePacketDrainKernel } = await import(${JSON.stringify(oldURI)});`,
      `const { makePacketDrainKernel } = await import(${JSON.stringify(newURI)});`],
    ["const sourceFiles = [", `const sourceFiles = [${DURATION_DRAIN_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ["private-packet-drain-candidate-not-browser-acceptance", "private-duration-drain-candidate-not-browser-acceptance"],
    ["onlyQueueDrainAdded: true", "onlyQueueDrainAdded: false, durationBoundaryCorrection: true"],
    ["  const retained = JSON.parse(await readFile(manifestPath));", checks + "  const retained = JSON.parse(await readFile(manifestPath));"],
  ]);
}
