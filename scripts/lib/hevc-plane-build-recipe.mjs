// Reversible derivatives; keep the same hosted ownership/retention/source caps.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Workflow, makeAlignment16Collector } from "./alignment16-build-recipe.mjs";
function transform(prior, edits) {
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior); return { generated, generatedSha256: sha(generated), edits };
}
export function makeHevcPlaneWorkflow(source) {
  return transform(makeAlignment16Workflow(source), [["node media/ffmpeg/build-mpeg2-alignment16.mjs", "node media/ffmpeg/build-mpeg2-hevc-planes.mjs"]]).generated;
}
export { makeHevcPlaneWorkflow as makeAlignment16Workflow };
export function makeHevcPlaneBranchCaller(source, root) {
  assert.equal(sha(source), "9eef6722a954d68f5a3d5d8ecdea9f8e3b04c7c26134f15e71eb69c35b2293a7");
  const edits = [
    ['root = path.resolve(import.meta.dirname, "..")', `root = ${JSON.stringify(path.resolve(root))}`],
    ["codex/mpeg2-alignment16-20261011", "codex/mpeg2-hevc-planes-20261012-include-fix"],
    ["evidence/mpeg2-alignment16-build-branch-2026-10-11", "evidence/mpeg2-hevc-plane-build-branch-2026-10-12-include-fix"],
    ["alignment16-git-index-", "hevc-plane-git-index-"],
    ["Build decoder-only alignment16 candidate with unchanged fixed heaps and encoder", "Build bounded HEVC plane candidate with fixed alignment16 heap and unchanged encoder"],
    ["alignment16-private-build-branch-pushed-not-dispatched", "hevc-plane-private-build-branch-pushed-not-dispatched"],
    ['["scripts/prepare-alignment16-build-branch.mjs", "scripts/lib/alignment16-build-recipe.mjs"]',
      '["scripts/prepare-hevc-plane-build-branch.mjs", "scripts/lib/hevc-plane-build-recipe.mjs", "scripts/prepare-alignment16-build-branch.mjs", "scripts/lib/alignment16-build-recipe.mjs"]'],
  ];
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    const relative = match[1] === "./lib/alignment16-build-recipe.mjs" ? "./lib/hevc-plane-build-recipe.mjs" : match[1];
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", relative)).href)}`)]);
  }
  return transform(source, edits);
}
export function makeHevcPlaneCollector(source, root) {
  const prior = makeAlignment16Collector(source, root).generated;
  const extra = `  const plane = JSON.parse(await readFile(path.join(download, "hevc-plane-smoke.json")));
  assert.deepEqual(plane, manifest.hevcPlanes.actualWasmLifecycle);
  assert.equal(plane.status, "passed"); assert.equal(plane.scope, "actual-libavutil-hevc-plane-lifecycle-not-conversion");
  assert.equal(plane.selectorConfigurations, 80); assert.equal(plane.sequentialReuses, 200000);
  assert.equal(plane.sequentialFreshAllocations, 1); assert.equal(plane.maximumIdleEntriesPerSelectedPool, 1); assert.equal(plane.conversionsPerformed, 0);
  for (const key of ["liveReferencesUnchanged", "uninitWithLiveReferencesPassed", "allocatorCallbackFailurePassed", "zeroEveryAcquisitionPassed", "nonselectedCacheUnchanged"]) assert.equal(plane[key], true);
  assert.equal(manifest.hevcPlanes.getBufferSha256, "79c74c197a61441287a0c8cb6e1a2703aadc1db0dc9f2625a2dd5a7f70b4f6e0");
  assert.equal(manifest.hevcPlanes.bufferSha256, "76fcae1c9409074b9b287d77d189ba06ab84e680e818a7649c56a6ad43db081a");
  assert.equal(manifest.hevcPlanes.maximumIdleEntriesPerSelectedPool, 1); assert.equal(manifest.hevcPlanes.privateFramePoolFieldAddedBytes, 4);
  for (const key of ["liveReferencesChanged", "codecSettingsChanged", "publicStructAbiChanged", "heapLimitsRaised", "browserFidelityVerified", "fullOriginalCompleted", "completeChromiumMemoryAcceptance", "speedGainProven", "publicAcceptance"]) assert.equal(manifest.hevcPlanes[key], false);
  assert.equal(manifest.artifacts["hevc-plane-get-buffer.c"], manifest.hevcPlanes.getBufferSha256);
  assert.equal(manifest.artifacts["hevc-plane-buffer.c"], manifest.hevcPlanes.bufferSha256);
  assert.equal(sha(manifest.hevcPlanes.generatedOuterBuilder), manifest.hevcPlanes.generatedOuterBuilderSha256);
  assert.notEqual(sha(decoder), "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014");
`;
  return transform(prior, [
    ["work/mpeg2-alignment16-${runId}", "work/mpeg2-hevc-planes-${runId}"],
    ["evidence/mpeg2-alignment16-build-${runId}.json", "evidence/mpeg2-hevc-plane-build-${runId}.json"],
    ["evidence/mpeg2-alignment16-build-branch-2026-10-11.json", "evidence/mpeg2-hevc-plane-build-branch-2026-10-12-include-fix.json"],
    ["alignment16-artifact-", "hevc-plane-artifact-"],
    ["|alignment16-smoke\\.json)", "|alignment16-smoke\\.json|hevc-plane-smoke\\.json|hevc-plane-(?:buffer|get-buffer)\\.c)"],
    ["private-decoder-dlmalloc-alignment16-fixed-heaps-not-browser-acceptance", "private-alignment16-hevc-plane-single-idle-not-browser-acceptance"],
    ["  complete = true;", extra + "  complete = true;"],
    ["actual-alignment16-build-unit-verified-not-browser-acceptance", "actual-hevc-plane-build-unit-verified-not-browser-acceptance"],
  ]);
}
