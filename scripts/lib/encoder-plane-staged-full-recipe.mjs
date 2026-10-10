// Add only a stage-aware progress observer to the unchanged full-original gate.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeEncoderPlaneFullDriver, makeEncoderPlaneFullCaller, encoderPlaneFullFiles,
  verifySingleIdleAbortQualification } from "./encoder-plane-full-recipe.mjs";
export { verifySingleIdleAbortQualification };
export const encoderPlaneStagedFullFiles = [...encoderPlaneFullFiles,
  "scripts/run-encoder-plane-staged-original-full.mjs", "scripts/lib/encoder-plane-staged-full-recipe.mjs",
  "scripts/lib/staged-output-work-checkpoints.mjs", "tests/mpeg2-encoder-plane-staged-progress.test.mjs"];
function exact(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) {
    assert.equal(generated.split(before).length - 1, count, before);
    generated = generated.replaceAll(before, after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, source, "Only explicit observer and evidence identity edits");
  return { generated, generatedSha256: sha(generated), edits };
}
export function makeEncoderPlaneStagedFullDriver(previous, root, runtime, branch) {
  const old = makeEncoderPlaneFullDriver(previous, root, runtime, branch);
  const oldImport = `import { recordOutputWorkCheckpoint } from ${JSON.stringify(pathToFileURL(path.join(root,
    "scripts/lib/split-copy-work-checkpoints.mjs")).href)};`;
  const edits = [
    [oldImport, `import { recordStagedOutputWorkCheckpoint as recordOutputWorkCheckpoint } from ${JSON.stringify(
      pathToFileURL(path.join(root, "scripts/lib/staged-output-work-checkpoints.mjs")).href)};`],
    ['const sourceFiles = [', 'const sourceFiles = [' + encoderPlaneStagedFullFiles.slice(encoderPlaneFullFiles.length)
      .map(file => JSON.stringify(file) + ',').join('')],
    ['-private-mpeg2-encoder-plane-full-native-100ms', '-private-mpeg2-encoder-plane-staged-full-native-100ms'],
    ['"mpeg2-encoder-plane-full-runtime-"', '"mpeg2-encoder-plane-staged-full-runtime-"'],
  ];
  return { ...old, ...exact(old.generated, edits), previousEncoderPlaneDriverSha256: sha(old.generated),
    encoderPlaneEdits: old.edits, stageAwareObserverOnly: true, publicAcceptance: false };
}
export function makeEncoderPlaneStagedFullCaller(source, root) {
  const old = makeEncoderPlaneFullCaller(source, root);
  const oldImport = `import { makeEncoderPlaneFullDriver as makeSingleIdleFullDriver, verifySingleIdleAbortQualification, encoderPlaneFullFiles as singleIdleFullFiles } from ${JSON.stringify(
    pathToFileURL(path.join(root, "scripts/lib/encoder-plane-full-recipe.mjs")).href)};`;
  const edits = [
    [oldImport, `import { makeEncoderPlaneStagedFullDriver as makeSingleIdleFullDriver, verifySingleIdleAbortQualification, encoderPlaneStagedFullFiles as singleIdleFullFiles } from ${JSON.stringify(
      pathToFileURL(path.join(root, "scripts/lib/encoder-plane-staged-full-recipe.mjs")).href)};`],
    ['name.endsWith("-encoder-plane-full-live.json")', '(name.endsWith("-encoder-plane-full-live.json") || name.endsWith("-encoder-plane-staged-full-live.json"))'],
    ['"encoder-plane-full-wrapper-"', '"encoder-plane-staged-full-wrapper-"'],
    ['-encoder-plane-full-post-cancel-partial-blink.json.gz', '-encoder-plane-staged-full-post-cancel-partial-blink.json.gz'],
    ['-encoder-plane-full-executed-sources.json.gz', '-encoder-plane-staged-full-executed-sources.json.gz'],
    ['-encoder-plane-full-live.json`', '-encoder-plane-staged-full-live.json`'],
    ['-private-mpeg2-encoder-plane-full-native-100ms.json', '-private-mpeg2-encoder-plane-staged-full-native-100ms.json'],
    ['-encoder-plane-full-raw.json.gz', '-encoder-plane-staged-full-raw.json.gz'],
    ['-encoder-plane-original-full${', '-encoder-plane-staged-original-full${'],
  ];
  return { ...old, ...exact(old.generated, edits), previousEncoderPlaneCallerSha256: sha(old.generated),
    encoderPlaneEdits: old.edits, stageAwareObserverOnly: true };
}
