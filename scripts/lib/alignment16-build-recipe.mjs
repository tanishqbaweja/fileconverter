// Additive, reversible private derivatives; preserve original ownership/gates.
import assert from "node:assert/strict";
import { makeAllocationAttemptWorkflow, makeAllocationAttemptCollector } from "./allocation-attempt-build-recipe.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export function makeAlignment16Workflow(source) {
  const prior = makeAllocationAttemptWorkflow(source);
  const before = "node media/ffmpeg/build-mpeg2-allocation-attempt.mjs", after = "node media/ffmpeg/build-mpeg2-alignment16.mjs";
  assert.equal(prior.split(before).length, 2);
  const generated = prior.replace(before, after); assert.equal(generated.replace(after, before), prior); return generated;
}
export function makeAlignment16Collector(source, root) {
  const prior = makeAllocationAttemptCollector(source, root).generated;
  const extra = `  const alignment = JSON.parse(await readFile(path.join(download, "alignment16-smoke.json")));
  assert.deepEqual(alignment, manifest.alignment16.actualWasmSmoke);
  assert.equal(alignment.passed, 13); assert.equal(alignment.cases, 13); assert.equal(alignment.mallocAlignment, 16);
  assert.equal(alignment.observedRequestBytes, 1597463); assert.equal(alignment.largeWrapperRejectedFreshPointer, false);
  assert.equal(alignment.heapBytes, 33554432); assert.equal(alignment.conversionsPerformed, 0);
  assert.equal(manifest.alignment16.originalSdkSourceSha256, "175ef7cab6d59b858471ad8ba16ee8a2f0536ddf666742b5e044b187171695d6");
  for (const key of ["separateEncoderSdkRestored", "upstreamAllocatorBodyUnchanged", "allocatorPolicyChanged"]) assert.equal(manifest.alignment16[key], true);
  for (const key of ["liveReferencesChanged", "codecSettingsChanged", "heapLimitsRaised", "browserFidelityVerified", "speedGainProven", "publicAcceptance"]) assert.equal(manifest.alignment16[key], false);
  assert.equal(manifest.allocationAttempt.allocatorPolicyChanged, true);
  assert.notEqual(sha(decoder), "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039");
`;
  const edits = [
    ["work/mpeg2-allocation-attempt-${runId}", "work/mpeg2-alignment16-${runId}"],
    ["evidence/mpeg2-allocation-attempt-build-${runId}.json", "evidence/mpeg2-alignment16-build-${runId}.json"],
    ["evidence/mpeg2-allocation-attempt-build-branch-2026-10-11.json", "evidence/mpeg2-alignment16-build-branch-2026-10-11.json"],
    ["allocation-attempt-artifact-", "alignment16-artifact-"],
    ["|allocation-attempt-smoke\\.json)", "|allocation-attempt-smoke\\.json|alignment16-smoke\\.json)"],
    ["private-fixed-heaps-allocation-attempt-diagnostic-not-browser-acceptance", "private-decoder-dlmalloc-alignment16-fixed-heaps-not-browser-acceptance"],
    ['"failureCauseProven", "allocatorPolicyChanged", "heapLimitsRaised"', '"failureCauseProven", "heapLimitsRaised"'],
    ["  complete = true;", extra + "  complete = true;"],
    ["actual-allocation-attempt-build-unit-verified-not-browser-acceptance", "actual-alignment16-build-unit-verified-not-browser-acceptance"],
  ];
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated; for (const [before, after] of edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, prior, "Source, lifetime, fixed heaps, encoder bytes, artifact ownership/cleanup gates retained");
  return { generated, generatedSha256: sha(generated), edits };
}
