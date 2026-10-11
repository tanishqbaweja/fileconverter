// Reversible derivatives of audited build workflow / artifact ownership collector.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeSingleIdleBuildWorkflow } from "./single-idle-build-workflow.mjs";
export function makeAllocationAttemptWorkflow(source) {
  const prior = makeSingleIdleBuildWorkflow(source);
  const before = "node media/ffmpeg/build-mpeg2-single-idle.mjs", after = "node media/ffmpeg/build-mpeg2-allocation-attempt.mjs";
  assert.equal(prior.split(before).length, 2);
  const generated = prior.replace(before, after);
  assert.equal(generated.replace(after, before), prior);
  return generated;
}
export function makeAllocationAttemptCollector(source, root, revision = "") {
  assert.ok(["", "binding-fix"].includes(revision));
  assert.equal(sha(source), "e0b73aad9af787c5676d0864a945c18c521e6851847d92753251793d7f35af42");
  const extra = `  const attempt = JSON.parse(await readFile(path.join(download, "allocation-attempt-smoke.json")));
  assert.deepEqual(attempt, manifest.allocationAttempt.actualWasm32SyntheticDispatch);
  assert.equal(attempt.passed, 9); assert.equal(attempt.cases, 9); assert.equal(attempt.slotBytes, 64);
  assert.deepEqual(attempt.failurePhasesObserved, [1, 4]); assert.equal(attempt.originalDispatchPreserved, true);
  assert.equal(attempt.conversionsPerformed, 0); assert.equal(manifest.allocationAttempt.slotBytes, 64);
  assert.equal(manifest.allocationAttempt.schemaVersion, 1); assert.equal(manifest.allocationAttempt.magic, 1095519281);
  for (const key of ["actualOriginalFailureObserved", "failureCauseProven", "allocatorPolicyChanged", "heapLimitsRaised",
    "codecOptionsChanged", "publicAcceptance", "speedImprovementProven"]) assert.equal(manifest.allocationAttempt[key], false);
  assert.notEqual(sha(decoder), "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec");
  assert.ok(WebAssembly.Module.imports(new WebAssembly.Module(decoder)).some(row => row.name === "within_bind_allocator_attempt_slot"));
`;
  const edits = [
    ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
    ['work/mpeg2-single-idle-${runId}', 'work/mpeg2-allocation-attempt-${runId}'],
    ['evidence/mpeg2-single-idle-build-${runId}.json', 'evidence/mpeg2-allocation-attempt-build-${runId}.json'],
    ['evidence/mpeg2-single-idle-build-branch-2026-10-10.json', `evidence/mpeg2-allocation-attempt-build-branch-2026-10-11${revision ? "-" + revision : ""}.json`],
    ...(revision ? [['assert.equal(process.argv.length, 3)', 'assert.equal(process.argv.length, 4)']] : []),
    ['single-idle-artifact-', 'allocation-attempt-artifact-'],
    ['|single-idle-hevc-policy\\.h)', '|single-idle-hevc-policy\\.h|allocation-attempt-smoke\\.json)'],
    ['private-fixed-heaps-hevc-single-idle-candidate-not-browser-acceptance', 'private-fixed-heaps-allocation-attempt-diagnostic-not-browser-acceptance'],
    ['  complete = true;', extra + '  complete = true;'],
    ['actual-single-idle-build-lifetime-unit-verified-not-browser-acceptance', 'actual-allocation-attempt-build-unit-verified-not-browser-acceptance'],
    ...["./lib/stable-ui-headless-baseline-recipe.mjs", "./lib/owned-runtime-scratch.mjs", "./lib/wasm-memory-limits.mjs",
      "../media/ffmpeg/mpeg2-single-idle-source.mjs"].map(file => [JSON.stringify(file), JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)]),
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, source, "All original run/source/memory/lifetime/ownership/cleanup gates remain");
  return { generated, generatedSha256: sha(generated), edits };
}
