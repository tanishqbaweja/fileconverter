import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { verifyDurableControl } from "../scripts/lib/durable-packet-cache-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const retained = async row => {
  const bytes = await read(row.path); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  const restored = gunzipSync(bytes, { maxOutputLength: 2097152 }); assert.equal(restored.length, row.restoredBytes);
  assert.equal(sha(restored), row.restoredSha256); return JSON.parse(restored);
};
test("real34 OS samples preserve original peaks without fabricating a Chromium blank or conversion acceptance", async () => {
  const proof = await verifyDurableControl(); assert.equal(proof.nativeControl.observedSamples, 34);
  const checkpoint = await retained(proof.nativeControl.archived);
  assert.equal(checkpoint.coverageThroughSequence, 34); assert.equal(checkpoint.native.sequence, 34);
  assert.equal(checkpoint.baseline, null); assert.equal(checkpoint.conversionAcceptance, false);
  assert.equal(proof.nativeControl.rootIsOwnedNodeNotChromium, true); assert.equal(proof.chromiumBlankBaselineMeasured, false);
  assert.equal(checkpoint.status, "observer-closed-not-conversion-acceptance");
  assert.equal(proof.nativeControl.everyPhasePeakMatchesOriginalObserver, true);
  assert.ok(checkpoint.native.graphBuckets.length <= 16);
});
test("synthetic abrupt exit19 leaves a readable LIVE checkpoint, never a completed-run or real Chromium memory result", async () => {
  const proof = await verifyDurableControl(), checkpoint = await retained(proof.abruptControl.archive);
  assert.equal(proof.abruptControl.syntheticSamplesOnly, true); assert.equal(proof.abruptControl.childExit.code, 19);
  assert.equal(proof.abruptControl.closedJournalBeforeExit, false); assert.equal(checkpoint.status, "observer-live-not-terminal-acceptance");
  assert.equal(checkpoint.coverageThroughSequence, 1); assert.equal(checkpoint.completeRunCoverageProven, false);
  assert.equal(checkpoint.native.phases.find(row => row.phase === "synthetic-abrupt-control").peak[3], 1234567);
  assert.equal(proof.appOrWindowsJobAbortSurvivalVerified, false); assert.equal(proof.conversionAcceptance, false);
  assert.equal(sha(Buffer.from(proof.abruptControl.executedFixture.preimage, "base64")), proof.abruptControl.executedFixture.sha256);
  assert.ok(proof.cleanup.ownedBirthChecks.every(row => row.status === "owned-identity-absent"));
  assert.equal(proof.cleanup.runtimeRemoved, true);
  for (const file of proof.cleanup.rawCheckpointsRemoved) await assert.rejects(access(path.join(root, file)), { code: "ENOENT" });
});
test("first failed synthetic phase control remains failed with exact executed source versions and valid native33-sample evidence", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-12T10-07-17-848Z-durable-native-checkpoint-control.json"));
  assert.equal(proof.status, "durable-checkpoint-control-incomplete"); assert.ok(proof.failure.includes("code: 1"));
  assert.equal(proof.abruptControl, null); assert.equal(proof.conversionAcceptance, false);
  assert.equal(proof.nativeControl.observedSamples, 33); assert.equal(proof.cleanup.runtimeRemoved, true);
  for (const [file, row] of Object.entries(proof.sourcePreimages)) {
    const bytes = Buffer.from(row.data, "base64"); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256, file);
    assert.equal(proof.postSourcePins[file], row.sha256);
  }
  const native = await retained(proof.nativeControl.archived); assert.equal(native.coverageThroughSequence, 33);
});
