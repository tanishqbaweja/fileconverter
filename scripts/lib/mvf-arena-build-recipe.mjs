import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Workflow as parentWorkflow, makeEbmlReuseBranchCaller } from "./mpeg2-ebml-reuse-build-recipe.mjs";
import { makeEbmlReuseCollectorV2 } from "./ebml-reuse-collector-v2.mjs";
function transform(parent, edits) {
  let generated = parent;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before.slice(0, 180)); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(restored, parent); return { generated, generatedSha256: sha(generated), parentSha256: sha(parent), edits, publicAcceptance: false };
}
export const makeAlignment16Workflow = source => transform(parentWorkflow(source), [
  ["node media/ffmpeg/build-mpeg2-ebml-reuse.mjs", "node media/ffmpeg/build-mpeg2-mvf-arena.mjs"],
]).generated;
export function makeMvfArenaBranchCaller(source, root) {
  return transform(makeEbmlReuseBranchCaller(source, root).generated, [
    ["codex/mpeg2-ebml-reuse-20261014", "codex/mpeg2-mvf-arena-20261015"],
    ["evidence/mpeg2-ebml-reuse-build-branch-2026-10-14", "evidence/mpeg2-mvf-arena-build-branch-2026-10-15"],
    ["ebml-reuse-git-index-", "mvf-arena-git-index-"],
    ['["scripts/prepare-mpeg2-ebml-reuse-build-branch.mjs",', '["scripts/prepare-mvf-arena-build-branch.mjs", "scripts/lib/mvf-arena-build-recipe.mjs", "scripts/prepare-mpeg2-ebml-reuse-build-branch.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/mpeg2-ebml-reuse-build-recipe.mjs")).href,
      pathToFileURL(path.join(root, "scripts/lib/mvf-arena-build-recipe.mjs")).href],
    ["Build private Matroska final-unref buffer reuse with unchanged fixed heaps and codecs", "Build private bounded HEVC MVF arena with unchanged fixed heaps and codecs"],
  ]);
}
export function makeMvfArenaCollector(source, root) {
  const gates = `  const mvfSourceProof = JSON.parse(await readFile(path.join(root, "evidence/mvf-arena-source-2026-10-15.json")));
  const mvf = manifest.mvfArena, mvfSmoke = mvf.actualWasmLifecycle;
  assert.equal(sha(mvf.exactSource), mvf.sha256); assert.deepEqual(JSON.parse(mvf.exactSource), mvfSmoke);
  assert.equal(mvf.actualRefstructSha256, mvfSourceProof.candidateRefstructSha256);
  assert.equal(mvf.parentRefstructSha256, mvfSourceProof.parentRefstructSha256);
  assert.equal(mvf.actualHevcSha256, mvfSourceProof.candidateHevcSha256);
  assert.equal(mvf.selector, "HEVC/single-thread/decoder/tab_mvf-only");
  assert.equal(mvf.maximumRawSlots, 6); assert.equal(mvf.maximumReservedBytes, 8388608);
  assert.equal(mvfSmoke.status, "passed"); assert.equal(mvfSmoke.scope, "actual-wasm32-mvf-arena-refstruct-not-conversion");
  assert.equal(mvfSmoke.measuredReservedBytes, 6981216); assert.equal(mvfSmoke.sequentialReuses, 200000);
  assert.equal(mvfSmoke.constructorFailureCases, 2); assert.equal(mvfSmoke.initErrorFlagCases, 4);
  for (const field of ["overflowPreserved", "liveAliasesPreserved", "deferredClosePassed", "zeroEveryTimePassed",
    "nonselectedAndOversizeUnchanged", "ownedAllocationsBalanced"]) assert.equal(mvfSmoke[field], true);
  assert.equal(mvfSmoke.conversionsPerformed, 0); assert.equal(mvfSmoke.conversionSpeedGainProven, false);
  for (const field of ["idleObjectAdmissionChanged", "liveReferencesChanged", "codecSettingsChanged", "heapLimitsChanged",
    "browserFidelityVerified", "fullOriginalCompleted", "completeChromiumMemoryAcceptance", "conversionSpeedGainProven", "publicAcceptance"])
    assert.equal(mvf[field], false);
`;
  const uri = pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-mvf-arena-source.mjs")).href;
  return transform(makeEbmlReuseCollectorV2(source, root).generated, [
    ["work/mpeg2-ebml-reuse-${runId}", "work/mpeg2-mvf-arena-${runId}"],
    ["evidence/mpeg2-ebml-reuse-build-${runId}.json", "evidence/mpeg2-mvf-arena-build-${runId}.json"],
    ["evidence/mpeg2-ebml-reuse-build-branch-2026-10-14.json", "evidence/mpeg2-mvf-arena-build-branch-2026-10-15.json"],
    ["ebml-reuse-artifact-", "mvf-arena-artifact-"],
    ["private-fixed-heaps-ebml-reuse-candidate-not-browser-acceptance", "private-fixed-heaps-mvf-arena-candidate-not-browser-acceptance"],
    ["  reverseSingleIdleRefstruct(actualRefstruct);", `  const { reverseMvfArenaRefstruct } = await import(${JSON.stringify(uri)});\n  reverseSingleIdleRefstruct(reverseMvfArenaRefstruct(actualRefstruct));`],
    ["  complete = true;", gates + "  complete = true;"],
    ["actual-ebml-reuse-build-unit-verified-not-browser-acceptance", "actual-mvf-arena-build-unit-verified-not-browser-acceptance"],
  ]);
}
