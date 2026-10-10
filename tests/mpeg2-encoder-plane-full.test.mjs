import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeSingleIdleFullDriver } from "../scripts/lib/single-idle-full-recipe.mjs";
import { makeEncoderPlaneFullDriver, makeEncoderPlaneFullCaller, makeEncoderPlaneAbortStager,
  verifySingleIdleAbortQualification, encoderPlaneFullFiles } from "../scripts/lib/encoder-plane-full-recipe.mjs";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read("evidence/2026-10-09T16-55-27-062Z-progress-compositing-original-full-completion.json"));
const archive = await read(receipt.sourceArchive.path); assert.equal(sha(archive), receipt.sourceArchive.sha256);
const raw = gunzipSync(archive); assert.equal(sha(raw), receipt.sourceArchive.restoredSha256);
const previous = JSON.parse(raw);
const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
const decoderBranch = JSON.parse(await read("evidence/mpeg2-single-idle-build-branch-2026-10-10.json"));
const runtime = path.join(root, "work/encoder-plane-UNIT-ONLY");
const reverse = recipe => recipe.edits.toReversed().reduce((value, [before, after]) => value.replaceAll(after, before), recipe.generated);
const syntax = generated => {
  const value = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(value.status, 0, value.stderr);
};
test("New encoder full driver reverses byte-exactly to the real full-source gate without altering quality or complete-tree250", () => {
  const recipe = makeEncoderPlaneFullDriver(previous, root, runtime, branch);
  const old = makeSingleIdleFullDriver(previous, root, runtime, decoderBranch);
  assert.equal(reverse(recipe), old.generated);
  for (const token of ['number <= 3', 'minimumMs: 300000', 'run.incrementalPrivateMiB <= 250', 'assert.ok(ssim >= 0.98)',
    'maximumTimestampErrorSeconds <= 0.001', 'blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes',
    'expectedSourceBytes = 2958573265', '31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34',
    '"maximumConversionMs":21600000', '"partialOutputStopEnabled":false', 'Never kill an unrelated or reused PID',
    'await verifySource(); cleanup.protectedFixtureUnchanged = true', 'metrics.peakPendingOperations <= 1', '"--headless=new"',
    'a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee', 'manifest.provenance.encoder.commit',
    'scripts/stage-mpeg2-encoder-plane-abort.mjs', '020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837'])
    assert.ok(recipe.generated.includes(token), token);
  assert.ok(!recipe.generated.includes('windowsHide: false') && !recipe.generated.includes('headless: false'));
  syntax(recipe.generated);
  const union = deriveDriverSourcePinFiles(recipe.generated, [...Object.keys(receipt.sourcePins), ...encoderPlaneFullFiles]);
  for (const file of encoderPlaneFullFiles) assert.ok(union.files.includes(file), file);
  assert.ok(union.driverUniqueSourceFiles > 132);
});
test("Full caller identity-only derivative keeps fresh host/disk guards, no live restart, exact original Chrome and terminal cleanup", async () => {
  const source = (await read("scripts/run-single-idle-original-full.mjs")).toString();
  const recipe = makeEncoderPlaneFullCaller(source, root);
  assert.equal(reverse(recipe), source); syntax(recipe.generated);
  for (const token of ['32 * 1024 ** 3', 'inspectStressHostMemory()', 'rawOld.progressProbe.chromeLauncherSha256',
    'Existing same-candidate driver live; never restart', 'if (done && child?.exitCode === null && child?.signalCode === null) await done',
    'generatedCaller: await readFile(import.meta.filename, "utf8")', 'await runtime.close()', 'raw.limitMiB, 250',
    'raw.forbiddenRequests, []', 'raw.progressProbe.partialOutputStopEnabled, false', 'assert.deepEqual(raw.manifest, build.manifest)',
    '-single-idle-full-live.json', '-encoder-plane-full-live.json']) assert.ok(recipe.generated.includes(token), token);
  assert.throws(() => makeEncoderPlaneFullCaller(source + "\n", root));
});
test("Changed stager preserves byte-exact failure-only observer; decoder qualification binds identical actual bytes and original map", async () => {
  const source = (await read("scripts/stage-mpeg2-single-idle-abort.mjs")).toString();
  const recipe = makeEncoderPlaneAbortStager(source, root); assert.equal(reverse(recipe), source); syntax(recipe.generated);
  const q = JSON.parse(await read("evidence/mpeg2-single-idle-abort-layout-2026-10-10.json")); verifySingleIdleAbortQualification(q);
  assert.equal(sha(await read("work/mpeg2-encoder-planes-38044000567/within-mpeg2-split.wasm")), q.binary.sha256);
  assert.equal(sha(await read(path.dirname(q.binary.path) + "/decoder-link.map")), q.mapSha256);
  for (const token of ['qualification.sourcePins', 'qualification.binary.sha256', 'path.dirname(qualification.binary.path)',
    'verifyEncoderPlaneBuildEvidence(build, branch)', '18330', '020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837'])
    assert.ok(recipe.generated.includes(token), token);
  assert.throws(() => makeEncoderPlaneAbortStager(source + "\n", root));
});
