// Offline verification of actual retained execution, not a synthetic browser claim.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { verifySingleIdleGoldenReport, verifySingleIdleBuildEvidence, SINGLE_IDLE_DECODER_SHA } from "../scripts/lib/single-idle-browser-recipe.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const proof = JSON.parse(await read("evidence/2026-10-09T20-41-29-131Z-single-idle-browser-goldens.json"));
const archived = async record => {
  const compressed = await read(record.path); assert.equal(sha(compressed), record.sha256); assert.equal(compressed.length, record.bytes);
  const raw = gunzipSync(compressed, { maxOutputLength: 8388608 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
  return JSON.parse(raw);
};
test("Actual new-core browser evidence proves three byte-exact conversions/two recovery cases, not large-file or speed acceptance", async () => {
  assert.equal(proof.status, "five-headless-goldens-byte-exact-and-recovery-passed"); assert.equal(proof.failure, null);
  const report = await archived(proof.report.archive), priorBytes = await read(proof.baseline.path); assert.equal(sha(priorBytes), proof.baseline.sha256);
  const baseline = JSON.parse(priorBytes).reports[0].report;
  assert.deepEqual(verifySingleIdleGoldenReport(report, baseline), proof.analysis);
  const buildBytes = await read(proof.build.path); assert.equal(sha(buildBytes), proof.build.sha256);
  const branchBytes = await read(proof.branch.path); assert.equal(sha(branchBytes), proof.branch.sha256);
  const build = JSON.parse(buildBytes); verifySingleIdleBuildEvidence(build, JSON.parse(branchBytes));
  assert.deepEqual(report.manifest, build.manifest);
  assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"], SINGLE_IDLE_DECODER_SHA);
  for (const field of ["completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance"]) assert.equal(proof[field], false);
});
test("Retained actual executed source preimages bind every captured pin and generated headless/hidden suite", async () => {
  const executed = await archived(proof.generatedArchive);
  assert.deepEqual(executed.sourcePins, proof.sourcePins); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(executed.sources[file]), hash, file);
  assert.ok(executed.generated.spec.includes("headless: true") && !executed.generated.spec.includes("headless: false"));
  assert.equal((executed.generated.driver.match(/windowsHide: true/g) ?? []).length, 6);
  assert.ok(executed.generated.driver.includes("Never stop an unrelated or reused PID"));
  assert.ok(executed.generated.stage.includes(SINGLE_IDLE_DECODER_SHA));
  assert.equal(proof.browserMode, "headless"); assert.equal(proof.subprocessWindowsHidden, true);
  assert.equal(proof.hostPreflight.safeToStart, true); assert.equal(proof.launchHostPreflight.safeToStart, true);
});
test("Actual cleanup restored six assets/App/CSS, absent private files/runtime/fixtures and protected original byte-exact", () => {
  const cleanup = proof.cleanup;
  assert.equal(Object.keys(cleanup.restored).length, 6); assert.equal(cleanup.normalAppAndCssUnchanged, true);
  assert.equal(cleanup.privateAdditionsAbsent, true); assert.equal(cleanup.ownedWrapperAbsent, true);
  assert.deepEqual(cleanup.newFixtureDirsRemaining, []); assert.equal(cleanup.helpers.launchRecords.length, 2);
  for (const record of cleanup.helpers.launchRecords) assert.equal(record.absence.status, "owned-identity-absent");
  assert.deepEqual(proof.protectedPre, proof.protectedPost);
  assert.equal(proof.protectedPost.bytes, 2958573265);
  assert.equal(proof.protectedPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.noDocker, true); assert.deepEqual(proof.failureArtifacts, []);
});
