// Derive only from the executed full gate, never the shorter diagnostic stop.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { SINGLE_IDLE_SLOT, SINGLE_IDLE_DECODER_SHA } from "./single-idle-browser-recipe.mjs";
export const PREVIOUS_FULL_DRIVER_SHA = "17f4fab4ed46c60744930440d18e1b1697ae8c2b268682605edb432887ce6e15";
export const singleIdleFullFiles = ["scripts/run-single-idle-original-full.mjs", "scripts/lib/single-idle-full-recipe.mjs",
  "scripts/stage-mpeg2-single-idle-abort.mjs", "scripts/qualify-single-idle-abort-layout.mjs", "tests/mpeg2-single-idle-full.test.mjs",
  "evidence/mpeg2-single-idle-abort-layout-2026-10-10.json", "evidence/2026-10-09T20-41-29-131Z-single-idle-browser-goldens.json",
  "scripts/lib/single-idle-browser-recipe.mjs", "evidence/mpeg2-single-idle-build-37986418102.json"];
export function verifySingleIdleAbortQualification(proof) {
  assert.equal(proof.status, "new-binary-abort-ABI-byte-exact-qualified-not-conversion-acceptance");
  assert.equal(proof.binary.sha256, SINGLE_IDLE_DECODER_SHA); assert.equal(proof.allocator.address, 1786520);
  assert.equal(proof.allocator.bytes, 496); assert.equal(proof.slot.address, 1918608); assert.equal(proof.slot.bytes, 64);
  assert.equal(proof.decoderJavascriptByteExact, true); assert.equal(proof.instantiated, false);
  const expected = { av_malloc: [4311, "71871358e30da08d048ae856c1fc17650e78deefa12d951593c679fbf8e46a56"],
    av_refstruct_pool_get: [4379, "970614eae4a1677cd5bba4b33316de7749764abb6322ae02bfea801baa5d79ca"],
    emscripten_builtin_malloc: [4435, "06e67fc4cb52bb04d550ea948bf4c3a61b81bb2851fb7262b5c061c39751688b"],
    __wrap_posix_memalign: [4470, "82857249c915acb2db80f070cec845e57f7a4f040bc4e60c136165182d15e9ca"] };
  assert.equal(proof.functions.length, 4);
  for (const [name, [index, digest]] of Object.entries(expected)) {
    const row = proof.functions.find(row => row.name === name); assert.equal(row?.bodySha256, digest);
    assert.equal(row.actual.functionIndex, index); assert.equal(row.old.functionIndex, index); assert.equal(row.byteExact, true);
    assert.deepEqual(row.actual.params, row.old.params); assert.deepEqual(row.actual.results, row.old.results);
  }
  assert.deepEqual(proof.changedFunctions.map(row => row.name).toSorted(), ["pool_return_entry", "set_sps"]);
  for (const row of proof.changedFunctions) assert.equal(row.different, true);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.actualFullSourceFailureResolved, false);
}
export function makeSingleIdleFullDriver(previous, root, runtime, branch) {
  assert.equal(sha(previous.generated), PREVIOUS_FULL_DRIVER_SHA);
  assert.equal(path.dirname(runtime), path.join(root, "work"));
  const source = previous.generated, rootLine = source.match(/^const root = (".*?"), MiB = 1024 \*\* 2;$/m); assert.ok(rootLine);
  const traceLine = source.match(/^import \{ startBoundedRendererAttribution \} from (".*?");$/m); assert.ok(traceLine);
  const workflowLine = source.match(/^import \{makeLateSlotBuildWorkflow\} from ".*?";$/m); assert.ok(workflowLine);
  const edits = [
    [rootLine[0], `const root = ${JSON.stringify(root)}, MiB = 1024 ** 2;`],
    [traceLine[0], `import { startBoundedRendererAttribution } from ${JSON.stringify(pathToFileURL(path.join(runtime, "trace-helper.mjs")).href)};`],
    [workflowLine[0], `import {makeSingleIdleBuildWorkflow} from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/single-idle-build-workflow.mjs")).href)};`],
    ['"mpeg2-split-pipeline-output"', JSON.stringify(SINGLE_IDLE_SLOT)],
    ['/^(mpeg2-split-pipeline-output|mpeg2-split-pipeline-[0-9]{8,})$/', '/^mpeg2-single-idle-37986418102$/'],
    ['d280472ff4421e744aa767d9d690a7b73d82a26951bb71446c3fb3d55cacd78d', branch.workflow.generatedSha256],
    ['makeLateSlotBuildWorkflow(canonical)', 'makeSingleIdleBuildWorkflow(canonical)'],
    ['["scripts/stage-mpeg2-late-allocator-abort.mjs", "stage"]', '["scripts/stage-mpeg2-single-idle-abort.mjs", "stage"]'],
    ['["scripts/stage-mpeg2-late-allocator-abort.mjs", "restore"]', '["scripts/stage-mpeg2-single-idle-abort.mjs", "restore"]'],
    ['-private-mpeg2-progress-compositing-full-native-100ms', '-private-mpeg2-single-idle-full-native-100ms'],
    ['"mpeg2-progress-compositing-full-runtime-"', '"mpeg2-single-idle-full-runtime-"'],
    ['"mode":"progress-compositing-full-completion"', '"mode":"single-idle-full-completion"'],
    ['"privatelyChangedUiOnly":true', '"privatelyChangedUiOnly":false,"privateNativeCandidate":"hevc-single-idle"'],
    ['const sourceFiles = [', 'const sourceFiles = [' + singleIdleFullFiles.map(file => JSON.stringify(file) + ',').join('')],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "All full original/three repeats/quality/timing/primary250/lower blank/native monitoring/cleanup gates identical");
  assert.ok(generated.includes('"--headless=new"') && !generated.includes('headless: false'));
  return { generated, generatedSha256: sha(generated), edits, expectedAsset: previous.expectedAsset,
    stylesheet: previous.stylesheet, maximumConversionMs: 21600000, requestedRuns: 3, fullCompletionRequired: true };
}
