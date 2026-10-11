// Additive full-source validator correction; no conversion or acceptance changes.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeEncoderPlaneStagedFullDriver, makeEncoderPlaneStagedFullCaller,
  encoderPlaneStagedFullFiles, verifySingleIdleAbortQualification } from "./encoder-plane-staged-full-recipe.mjs";
export { verifySingleIdleAbortQualification };

const additions = ["scripts/run-encoder-plane-title-original-full.mjs", "scripts/lib/encoder-plane-title-full-recipe.mjs",
  "scripts/lib/matroska-mp4-stream-title.mjs", "scripts/lib/bounded-cleanup-error.mjs",
  "tests/mpeg2-encoder-plane-title-full.test.mjs", "tests/bounded-cleanup-error.test.mjs",
  "scripts/lib/encoder-plane-title-browser-recipe.mjs", "scripts/validate-mpeg2-encoder-plane-titles.mjs",
  "tests/mpeg2-stream-title.test.mjs", "tests/mpeg2-title-evidence.test.mjs",
  "evidence/2026-10-11T00-04-25-682Z-encoder-plane-title-browser-goldens.json",
  "outputs/reports/2026-10-11T00-04-25-682Z-encoder-plane-title-golden-report.json.gz",
  "evidence/2026-10-10T18-57-09-340Z-encoder-plane-staged-original-full-terminal.json"];
export const encoderPlaneTitleFullFiles = [...encoderPlaneStagedFullFiles, ...additions];
function exact(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) {
    assert.equal(generated.split(before).length - 1, count, before);
    generated = generated.replaceAll(before, after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, source, "Only explicit title mapping, diagnostic retention and evidence identities");
  return { generated, generatedSha256: sha(generated), edits };
}
const uri = (root, file) => JSON.stringify(pathToFileURL(path.join(root, file)).href);
export function makeEncoderPlaneTitleFullDriver(previous, root, runtime, branch) {
  const old = makeEncoderPlaneStagedFullDriver(previous, root, runtime, branch);
  const imports = `import { validateMatroskaMp4StreamTitle } from ${uri(root, "scripts/lib/matroska-mp4-stream-title.mjs")};\n` +
    `import { describeOwnedCleanupError } from ${uri(root, "scripts/lib/bounded-cleanup-error.mjs")};\n`;
  const edits = [
    ['import assert from "node:assert/strict";', imports + 'import assert from "node:assert/strict";'],
    ['const sourceFiles = [', 'const sourceFiles = [' + additions.map(file => JSON.stringify(file) + ',').join('')],
    ['const output = await outputPayload(metrics.outputBytes), after = await probe(output, true);',
      'const output = await outputPayload(metrics.outputBytes), after = await probe(output, true);\n    run.independentPreAssertionProbe = after;'],
    ['assert.equal(video.tags?.title, originalVideo.tags?.title, "Preserve primary video title");',
      'run.exactVideoTitleMapping = validateMatroskaMp4StreamTitle(originalVideo.tags, video.tags);'],
    ['for (const field of ["language", "title"])\n        assert.equal(outputAudio[i].tags?.[field], inputAudio[i].tags?.[field], `Preserve audio ${i} ${field}`);',
      'for (const field of ["language"])\n        assert.equal(outputAudio[i].tags?.[field], inputAudio[i].tags?.[field], `Preserve audio ${i} ${field}`);\n    run.exactAudioTitleMappings = inputAudio.map((stream, i) => validateMatroskaMp4StreamTitle(stream.tags, outputAudio[i].tags));'],
    ['cleanupErrors.push(String(error));', 'cleanupErrors.push(JSON.stringify(describeOwnedCleanupError(error)));'],
    ['-private-mpeg2-encoder-plane-staged-full-native-100ms', '-private-mpeg2-encoder-plane-title-full-native-100ms'],
    ['"mpeg2-encoder-plane-staged-full-runtime-"', '"mpeg2-encoder-plane-title-full-runtime-"'],
  ];
  return { ...old, ...exact(old.generated, edits), previousStagedDriverSha256: sha(old.generated),
    stagedDriverEdits: old.edits, titleMappingAndDiagnosticRetentionOnly: true, publicAcceptance: false };
}
export function makeEncoderPlaneTitleFullCaller(source, root) {
  const old = makeEncoderPlaneStagedFullCaller(source, root);
  const oldImport = `import { makeEncoderPlaneStagedFullDriver as makeSingleIdleFullDriver, verifySingleIdleAbortQualification, encoderPlaneStagedFullFiles as singleIdleFullFiles } from ${uri(root, "scripts/lib/encoder-plane-staged-full-recipe.mjs")};`;
  const titleGuard = `
const titleProof = JSON.parse(await read("evidence/2026-10-11T00-04-25-682Z-encoder-plane-title-browser-goldens.json"));
assert.equal(titleProof.status, "five-headless-title-preservation-and-recovery-passed"); assert.equal(titleProof.failure, null);
assert.equal(titleProof.build.sha256, sha(buildBytes));
assert.equal(titleProof.branch.sha256, sha(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json")));
const titleArchive = titleProof.report.archive, titleBytes = await read(titleArchive.path);
assert.equal(titleBytes.length, titleArchive.bytes); assert.equal(sha(titleBytes), titleArchive.sha256);
const titleRaw = gunzipSync(titleBytes, { maxOutputLength: 2097152 });
assert.equal(titleRaw.length, titleArchive.restoredBytes); assert.equal(sha(titleRaw), titleArchive.restoredSha256);
const titleBaseline = JSON.parse(await read("evidence/mpeg2-late-abort-goldens-2026-10-08.json")).reports[0].report;
assert.deepEqual(verifyEncoderPlaneTitleGoldenReport(JSON.parse(titleRaw), titleBaseline, build), titleProof.analysis);
assert.deepEqual(titleProof.sourcePins, titleProof.postSourcePins);
for (const [file, hash] of Object.entries(titleProof.sourcePins)) assert.equal(sha(await read(file)), hash, file);
const lastFull = JSON.parse(await read("evidence/2026-10-10T18-57-09-340Z-encoder-plane-staged-original-full-terminal.json"));
assert.equal(lastFull.status, "failed-or-incomplete"); assert.equal(lastFull.executions, 1);
assert.deepEqual(lastFull.sourcePins, lastFull.postSourcePins);
for (const [file, hash] of Object.entries(lastFull.sourcePins)) assert.equal(sha(await read(file)), hash, file);
assert.equal(lastFull.wrapperAbsent, true); assert.equal(lastFull.productionRestored, true);
`;
  const edits = [
    [oldImport, `import { makeEncoderPlaneTitleFullDriver as makeSingleIdleFullDriver, verifySingleIdleAbortQualification, encoderPlaneTitleFullFiles as singleIdleFullFiles } from ${uri(root, "scripts/lib/encoder-plane-title-full-recipe.mjs")};\nimport { verifyEncoderPlaneTitleGoldenReport } from ${uri(root, "scripts/lib/encoder-plane-title-browser-recipe.mjs")};`],
    ['const hashFile = async file =>', titleGuard + '\nconst hashFile = async file =>'],
    ['[...Object.keys(receipt.sourcePins), ...singleIdleFullFiles, "scripts/lib/encoder-plane-build-workflow.mjs", branch.workflow.path]',
      '[...new Set([...Object.keys(receipt.sourcePins), ...singleIdleFullFiles, "scripts/lib/encoder-plane-build-workflow.mjs", branch.workflow.path])]'],
    ['// No stale-state restart: check actual old launch identities; do not kill anything.',
      '// No stale-state restart: check actual old launch identities; do not kill anything.\n    for (const row of lastFull.candidate.ownedLaunches) {\n      const absence = await observeOwnedProcessExit(row.identity); assert.equal(absence.status, "owned-identity-absent");\n    }\n    assert.equal((await observeOwnedProcessExit(lastFull.driverIdentity)).status, "owned-identity-absent");'],
    ['name.endsWith("-encoder-plane-staged-full-live.json")', '(name.endsWith("-encoder-plane-staged-full-live.json") || name.endsWith("-encoder-plane-title-full-live.json"))'],
    ['"encoder-plane-staged-full-wrapper-"', '"encoder-plane-title-full-wrapper-"'],
    ['-encoder-plane-staged-full-post-cancel-partial-blink.json.gz', '-encoder-plane-title-full-post-cancel-partial-blink.json.gz'],
    ['-encoder-plane-staged-full-executed-sources.json.gz', '-encoder-plane-title-full-executed-sources.json.gz'],
    ['-encoder-plane-staged-full-live.json`', '-encoder-plane-title-full-live.json`'],
    ['-private-mpeg2-encoder-plane-staged-full-native-100ms.json', '-private-mpeg2-encoder-plane-title-full-native-100ms.json'],
    ['-encoder-plane-staged-full-raw.json.gz', '-encoder-plane-title-full-raw.json.gz'],
    ['-encoder-plane-staged-original-full${', '-encoder-plane-title-original-full${'],
  ];
  return { ...old, ...exact(old.generated, edits), previousStagedCallerSha256: sha(old.generated),
    stagedCallerEdits: old.edits, titleMappingAndDiagnosticRetentionOnly: true };
}
