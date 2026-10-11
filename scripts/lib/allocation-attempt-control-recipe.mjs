// Additive mechanical derivatives; preserve all qualified code/export/ownership gates.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeDirectBufferExportControlRecipe } from "./direct-buffer-export-only-control.mjs";
import { ALLOCATION_ATTEMPT_DECODER_SHA256 } from "./allocation-attempt-abort-capture.mjs";
const apply = (source, edits) => {
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before.slice(0, 120)); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, source); return { generated, edits, generatedSha256: sha(generated) };
};
export function makeAllocationAttemptExportRecipe(source) {
  const prior = makeDirectBufferExportControlRecipe(source);
  const result = apply(prior.generated, [
    ["createDirectBufferExportOnlyControl", "createAllocationAttemptExportOnlyControl"],
    ['"86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec"', JSON.stringify(ALLOCATION_ATTEMPT_DECODER_SHA256)],
  ]);
  return { ...result, originalRecipe: prior, publicAcceptance: false };
}
export function makeAllocationAttemptBrowserFactory(source) {
  assert.equal(sha(source), "13f1098aaacecf74fd6b211d2f0f3a56c3b9388223a2d2d7b05e801bd51bc644");
  const edits = [
    ['import { DIRECT_BUFFER_DECODER_SHA256 } from "./direct-buffer-allocator-abort-capture.mjs";',
      'import { ALLOCATION_ATTEMPT_DECODER_SHA256 as DIRECT_BUFFER_DECODER_SHA256 } from "./direct-buffer-allocator-abort-capture.mjs";'],
    ["export function makeDirectBufferControlBrowserRecipe", "export function makeAllocationAttemptControlBrowserRecipe"],
    ["actualAllocatorRoot:1786520", "actualAllocatorRoot:1786648"],
    ["avBufferAlloczFunctionIndex:4187,avMallocFunctionIndex:4311,builtinMallocFunctionIndex:4435",
      "avBufferAlloczFunctionIndex:4188,avMallocFunctionIndex:4312,builtinMallocFunctionIndex:4436"],
    ["work/mpeg2-single-idle-37986418102", "work/mpeg2-allocation-attempt-38138821153"],
    ["assert.equal(terminal.emitted.heapLiveBytes,null);assert.equal(terminal.emitted.failedIndividualAllocationBytes,null);",
      `assert.equal(terminal.emitted.heapLiveBytes,null);assert.equal(terminal.emitted.failedIndividualAllocationBytes,33554432);
  assert.equal(terminal.emitted.allocationAttemptUnavailable,null);
  assert.equal(terminal.emitted.allocationAttempt.phase,"fast-malloc-pending");
  assert.equal(terminal.emitted.allocationAttempt.wrapperRequestedBytes,terminal.syntheticRequestedAllocationBytes);
  assert.equal(terminal.emitted.allocationAttempt.wordsRead,16);assert.equal(terminal.emitted.allocationAttempt.completed,false);
  assert.equal(terminal.emitted.actualAttemptSlotAddress,1918736);`],
    ['"Direct-buffer synthetic OOM proves only failure-hook/header integration on current core; original HEVC failure size/free headers/retention/fragmentation remain unknown. Synthetic control is never staged for media; snapshots are NOT250MiB acceptance."',
      '"Native attempt slot qualifies this synthetic fatal request/phase only, never the historical HEVC failure or its cause. Snapshots are NOT250MiB/fidelity/speed acceptance; control is never staged for media."'],
  ];
  const first = apply(source, edits);
  const replacements = [["directBufferControlFiles", "allocationAttemptControlFiles", 2],
    ["createDirectBufferAllocatorAbortCapture", "createAllocationAttemptAbortCapture", 2],
    ["direct-buffer-allocator-abort-capture.mjs", "allocation-attempt-abort-capture.mjs", 4],
    ["direct-buffer-abort-control", "allocation-attempt-abort-control", 4]];
  let generated = first.generated;
  for (const [before, after, count] of replacements) {
    assert.equal(generated.split(before).length, count + 1, before); generated = generated.replaceAll(before, after);
  }
  let restored = generated;
  for (const [before, after] of replacements.toReversed()) restored = restored.replaceAll(after, before);
  assert.equal(restored, first.generated);
  return { generated, generatedSha256: sha(generated), edits, replacements, publicAcceptance: false };
}
