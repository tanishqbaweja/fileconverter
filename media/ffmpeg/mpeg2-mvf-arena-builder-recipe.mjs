import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Builder as parentInner, makePacketCacheOuterBuilder as parentOuter,
  makePacketCacheHevcWrapper as parentHevc, makeEbmlReuseHostedBuilder } from "./mpeg2-ebml-reuse-builder-recipe.mjs";
export { makePacketCachePipelineGenerator } from "./mpeg2-ebml-reuse-builder-recipe.mjs";
export const MVF_NATIVE_FILES = ["media/ffmpeg/mpeg2-mvf-arena-source.mjs", "media/ffmpeg/mpeg2-mvf-arena-smoke.c",
  "media/ffmpeg/mpeg2-mvf-arena-recipe.mjs", "media/ffmpeg/mpeg2-mvf-arena-builder-recipe.mjs",
  "media/ffmpeg/build-mpeg2-mvf-arena.mjs", "tests/mpeg2-mvf-arena.test.mjs"];
function transform(parent, edits) {
  let generated = parent.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(restored, parent.generated);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(parent.generated), edits, publicAcceptance: false };
}
export function makeAlignment16Builder(source, root) {
  const uri = pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-mvf-arena-source.mjs")).href;
  // The deepest builder still verifies the old exact source after reversing
  // this candidate. Never relabel candidate bytes as the old source hash.
  const nestedEdits = [
    ["const actualRefstruct = await readFile", `const { reverseMvfArenaRefstruct } = await import(${JSON.stringify(uri)});\n  const actualRefstruct = await readFile`],
    ["reverseSingleIdleRefstruct(actualRefstruct)", "reverseSingleIdleRefstruct(reverseMvfArenaRefstruct(actualRefstruct))"],
  ];
  return transform(parentInner(source, root), [
    ["media/ffmpeg/mpeg2-ebml-reuse-recipe.mjs", "media/ffmpeg/mpeg2-mvf-arena-recipe.mjs"],
    ["makeEbmlReuseShellRecipe as makeAlignedReuseRecipe", "makeMvfArenaShellRecipe as makeAlignedReuseRecipe"],
    ["const edits = [", `const edits = [${nestedEdits.map(edit => JSON.stringify(edit)).join(",")},`],
  ]);
}
const helperEdit = root => [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-ebml-reuse-builder-recipe.mjs")).href,
  pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-mvf-arena-builder-recipe.mjs")).href]];
export const makePacketCacheOuterBuilder = (source, root) => transform(parentOuter(source, root), helperEdit(root));
export const makePacketCacheHevcWrapper = (source, root) => transform(parentHevc(source, root), helperEdit(root));
export function makeMvfArenaHostedBuilder(source, root) {
  const validation = `const mvfSmokePath = path.join(output, "mvf-arena-smoke.json"), mvfBytes = await readFile(mvfSmokePath);
  const mvf = JSON.parse(mvfBytes);
  assert.equal(mvf.status, "passed"); assert.equal(mvf.scope, "actual-wasm32-mvf-arena-refstruct-not-conversion");
  assert.equal(mvf.maximumRawSlots, 6); assert.equal(mvf.maximumReservedBytes, 8388608);
  assert.equal(mvf.measuredPayloadBytes, 1163520); assert.equal(mvf.measuredReservedBytes, 6981216);
  assert.equal(mvf.sequentialReuses, 200000); assert.equal(mvf.constructorFailureCases, 2); assert.equal(mvf.initErrorFlagCases, 4);
  for (const field of ["overflowPreserved", "liveAliasesPreserved", "deferredClosePassed", "zeroEveryTimePassed",
    "nonselectedAndOversizeUnchanged", "ownedAllocationsBalanced"]) assert.equal(mvf[field], true);
  assert.equal(mvf.conversionsPerformed, 0); assert.equal(mvf.conversionSpeedGainProven, false);
  const mvfSource = await readFile(path.join(output, "single-idle-refstruct.c"), "utf8");
  const mvfSourceSealPath = path.join(output, "mvf-source.sha256"), mvfSourceSeal = await readFile(mvfSourceSealPath, "utf8");
  const mvfSourceHashes = mvfSourceSeal.trim().split("\\n").map(line => line.split(/\\s+/)[0]);
  assert.equal(mvfSourceHashes.length, 2); assert.equal(mvfSourceHashes[0], sha(mvfSource));
  assert.match(mvfSourceHashes[1], /^[a-f0-9]{64}$/);
  const { reverseMvfArenaRefstruct } = await import(${JSON.stringify(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-mvf-arena-source.mjs")).href)});
  manifest.mvfArena = { actualWasmLifecycle: mvf, exactSource: mvfBytes.toString(), sha256: sha(mvfBytes),
    actualRefstructSha256: sha(mvfSource), parentRefstructSha256: sha(reverseMvfArenaRefstruct(mvfSource)),
    actualHevcSha256: mvfSourceHashes[1], sourceSealExact: mvfSourceSeal,
    selector: "HEVC/single-thread/decoder/tab_mvf-only", maximumRawSlots: 6, maximumReservedBytes: 8388608,
    overflowPreserved: true, allocatorPolicyChanged: true, idleObjectAdmissionChanged: false,
    liveReferencesChanged: false, codecSettingsChanged: false, heapLimitsChanged: false,
    browserFidelityVerified: false, fullOriginalCompleted: false, completeChromiumMemoryAcceptance: false,
    conversionSpeedGainProven: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
  await unlink(mvfSmokePath);
  await unlink(mvfSourceSealPath);
`;
  return transform(makeEbmlReuseHostedBuilder(source, root), [
    ...helperEdit(root),
    ["const sourceFiles = [", `const sourceFiles = [${MVF_NATIVE_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ["private-fixed-heaps-ebml-reuse-candidate-not-browser-acceptance", "private-fixed-heaps-mvf-arena-candidate-not-browser-acceptance"],
    ["  const retained = JSON.parse(await readFile(manifestPath));", "  " + validation + "  const retained = JSON.parse(await readFile(manifestPath));"],
  ]);
}
