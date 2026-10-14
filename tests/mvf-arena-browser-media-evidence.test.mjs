import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
async function unpack(record, maximum) {
  const zipped = await read(record.path); assert.equal(sha(zipped), record.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: maximum }); assert.equal(sha(raw), record.restoredSha256); return JSON.parse(raw);
}
test("failed first control remains failure with exact old preimages; changed control proves new runtime bindings", async () => {
  const failed = JSON.parse(await read("evidence/2026-10-14T22-15-11-816Z-mvf-arena-browser-control-executed-sources.json"));
  assert.equal(failed.status, "failed-browser-control"); assert.ok(failed.failure); assert.equal(failed.proof, null);
  const first = await unpack(failed.archive, 2097152);
  for (const [file, hash] of Object.entries(failed.sourcePins)) assert.equal(sha(Buffer.from(first.preimages[file], "base64")), hash);
  const passed = JSON.parse(await read("evidence/2026-10-14T22-17-16-644Z-mvf-arena-browser-control-executed-sources.json"));
  assert.equal(passed.failure, null); assert.equal(passed.sourceSealScopes.native.actualFiles, 99);
  assert.equal(passed.sourceSealScopes.browser.actualFiles, 38); assert.equal(passed.sourceSealScopes.distinctTotalFiles, 135);
  const proof = JSON.parse(await read(passed.proof.path)); assert.equal(proof.status, "passed-synthetic-abort-control");
  assert.equal(proof.result.terminal.emitted.actualAttemptSlotAddress, 1918992);
  assert.equal(proof.result.terminal.emitted.actualPoolSlotAddress, 1919120);
  assert.equal(proof.result.terminal.emitted.actualReallocSlotAddress, 1919056);
  assert.equal(proof.result.terminal.emitted.actualAllocatorRoot, 1786904);
  assert.equal(proof.cleanup.allSampledNativeBirthsAbsent, true); assert.equal(proof.cleanup.checkedNativeIdentities, 11);
});
test("actual current browser output and recovery evidence preserves quality, limits and all source paths", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-14T22-20-42-730Z-mvf-arena-media.json"));
  assert.equal(proof.failure, null); assert.equal(proof.analysis.genuineValidatedConversions, 4);
  const supplement = JSON.parse(await read("evidence/2026-10-14T22-20-42-722Z-mvf-arena-media-supplement.json"));
  assert.equal(supplement.failure, null); assert.equal(supplement.distinctTotalFiles, 297);
  assert.equal(supplement.legacy.sourceCount, 255); assert.equal(supplement.legacy.maximumFiles, 256);
  assert.equal(supplement.supplemental.sourceCount, 42); assert.equal(supplement.supplemental.maximumFiles, 128);
  const extra = await unpack(supplement.archive, 2097152);
  for (const [file, hash] of Object.entries(supplement.sourcePins)) {
    assert.equal(sha(Buffer.from(extra.preimages[file], "base64")), hash); assert.equal(sha(await read(file)), hash);
  }
  const report = await unpack(proof.report.archive, 2097152);
  const decoded = report.rows.filter(row => row.kind === "independent-frame-diagnostic"); assert.equal(decoded.length, 4);
  for (const row of decoded) {
    assert.equal(row.nativeFullDecodePassed, true); assert.ok(row.ordinalSsim >= .98);
    assert.equal(row.outputSha256, "554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27");
    assert.equal(row.outputBytes, 2245558); assert.equal(row.metrics.peakWasmMemoryBytes, 50331648);
    assert.ok(row.metrics.peakPendingOperations <= 1 && row.metrics.peakQueuedBytes <= 524288);
  }
  assert.equal(proof.cleanup.privateAdditionsAbsent, true); assert.equal(proof.cleanup.normalAppAndCssUnchanged, true);
  assert.deepEqual(proof.protectedPre, proof.protectedPost);
  assert.equal(proof.protectedPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
});
test("independent qualification proves cleanup and whole original while rejecting small-file acceptance claims", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-14T22-20-42-730Z-mvf-arena-independent-qualification.json"));
  assert.equal(proof.allEightOutputHashesMatchGolden, true); assert.equal(proof.allExecutedCurrentPostPreimagesVerified, true);
  assert.equal(proof.sourceCounts.totalMedia, 297); assert.equal(proof.birthChecks.length, 14);
  assert.equal(proof.sampledPidChecks.length, 22); assert.ok(proof.birthChecks.every(row => row.ownedBirthAbsent));
  assert.equal(proof.primaryIncrementalPrivateMiB, null); assert.equal(proof.fullOriginalAcceptance, false);
  assert.equal(proof.speedGainProven, false); assert.equal(proof.publicAcceptance, false); assert.equal(proof.headedCoverageVerified, false);
  assert.equal(proof.removedRedundantRawJson.bytes, 1027944);
  await assert.rejects(access(path.join(root, proof.removedRedundantRawJson.path)), { code: "ENOENT" });
  const execution = JSON.parse(await read("evidence/2026-10-14T22-20-42-730Z-mvf-arena-independent-executed-source.json"));
  assert.equal(sha(execution.generatedSource), execution.generatedSha256); assert.equal(execution.ownedRuntimeRemoved, true);
});
