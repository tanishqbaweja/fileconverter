import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeEncoderPlaneStagedFullDriver, makeEncoderPlaneStagedFullCaller } from "../scripts/lib/encoder-plane-staged-full-recipe.mjs";
import { makeEncoderPlaneTitleFullDriver, makeEncoderPlaneTitleFullCaller,
  encoderPlaneTitleFullFiles } from "../scripts/lib/encoder-plane-title-full-recipe.mjs";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read("evidence/2026-10-10T18-57-09-340Z-encoder-plane-staged-original-full-terminal.json"));
async function restore(record, cap = 8388608) {
  const compressed = await read(record.path);
  assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const restored = gunzipSync(compressed, { maxOutputLength: cap });
  assert.equal(restored.length, record.restoredBytes); assert.equal(sha(restored), record.restoredSha256);
  return JSON.parse(restored);
}
const parent = JSON.parse(await read(receipt.previousTerminal.path));
const previous = await restore(parent.sourceArchive);
const executed = await restore(receipt.sourceArchive);
const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
const build = JSON.parse(await read("evidence/mpeg2-encoder-plane-build-38044000567.json"));
const reverse = recipe => recipe.edits.toReversed().reduce((s, [before, after]) => s.replaceAll(after, before), recipe.generated);
function syntax(source) {
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"],
    { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
}

test("full title derivative reverses to actual executed driver and retains all full stress gates", () => {
  const old = makeEncoderPlaneStagedFullDriver(previous, root, receipt.wrapper, branch);
  assert.equal(old.generated, executed.generated);
  const recipe = makeEncoderPlaneTitleFullDriver(previous, root, receipt.wrapper, branch);
  assert.equal(reverse(recipe), executed.generated); syntax(recipe.generated);
  const probe = recipe.generated.indexOf("run.independentPreAssertionProbe = after;");
  assert.ok(probe > 0 && probe < recipe.generated.indexOf('assert.equal(video.codec_name, "mpeg2video")'));
  for (const token of ['number <= 3', 'run.incrementalPrivateMiB <= 250', 'assert.ok(ssim >= 0.98)',
    'maximumTimestampErrorSeconds <= 0.001', 'minimumMs: 300000', 'expectedSourceBytes = 2958573265',
    '"maximumConversionMs":21600000', '"partialOutputStopEnabled":false', 'metrics.peakPendingOperations <= 1',
    '"--headless=new"', 'run.exactVideoTitleMapping = validateMatroskaMp4StreamTitle(originalVideo.tags, video.tags)',
    'run.exactAudioTitleMappings', 'cleanupErrors.push(JSON.stringify(describeOwnedCleanupError(error)))',
    'Preserve primary video disposition', 'Preserve audio ${i} ${field}']) assert.ok(recipe.generated.includes(token), token);
  assert.ok(!recipe.generated.includes('windowsHide: false'));
  const union = deriveDriverSourcePinFiles(recipe.generated, [...new Set([...Object.keys(parent.sourcePins),
    ...encoderPlaneTitleFullFiles, "scripts/lib/encoder-plane-build-workflow.mjs", branch.workflow.path])]);
  // Match the actual caller: build .sh/.patch inputs are added separately under
  // its strict path/hash/size guards, never dropped or allowed as driver imports.
  const files = [...new Set([...union.files, ...Object.keys(build.manifest.sources)])];
  for (const file of [...Object.keys(receipt.sourcePins), ...encoderPlaneTitleFullFiles]) assert.ok(files.includes(file), file);
  assert.ok(files.length <= 256);
});

test("new caller qualifies actual title goldens and old source pins before same full settings/cleanup, never an unchanged retry", async () => {
  const input = (await read("scripts/run-single-idle-original-full.mjs")).toString();
  const old = makeEncoderPlaneStagedFullCaller(input, root);
  assert.equal(old.generated, executed.generatedCaller);
  const recipe = makeEncoderPlaneTitleFullCaller(input, root);
  assert.equal(reverse(recipe), old.generated); syntax(recipe.generated);
  for (const token of ['verifyEncoderPlaneTitleGoldenReport(JSON.parse(titleRaw)', 'Object.entries(lastFull.sourcePins)',
    'observeOwnedProcessExit(lastFull.driverIdentity)', 'name.endsWith("-encoder-plane-title-full-live.json")',
    'assert.ok(!raw.cleanup.errors?.length)', 'proof.candidate.completedConversions, 3', 'assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3)',
    'await runtime.close()', 'proof.postSourcePins']) {
    assert.ok(recipe.generated.includes(token), token);
  }
  assert.throws(() => makeEncoderPlaneTitleFullCaller(input + "\n", root));
});

test("actual failed original has video/audio titles; retaining new probes does not validate the deleted historical output", async () => {
  const raw = await restore(receipt.candidate.compressedReport, 33554432);
  assert.match(raw.failure.message, /^Preserve primary video title\n/);
  assert.ok(raw.failure.message.includes("+ undefined") && raw.failure.message.includes("- 'HDHub4u.Ag'"));
  const streams = raw.source.probe.streams.filter(s => s.codec_type === "audio" ||
    (s.codec_type === "video" && !s.disposition?.attached_pic));
  assert.equal(streams.length, 2);
  for (const stream of streams) assert.equal(stream.tags.title, "HDHub4u.Ag");
  assert.equal(raw.runs[0].independentValidation, null);
  assert.equal(raw.runs[0].independentPreAssertionProbe, undefined);
  assert.deepEqual(raw.cleanup.errors, ["AggregateError: One or more owned cleanup actions failed"]);
  assert.equal(raw.status, "failed");
});
