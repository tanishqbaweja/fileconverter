// Actual retained headless browser receipts, never mock or replay acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root)), json = async file => JSON.parse(await read(file));
const base = "evidence/2026-11-05-webcodecs-vp9-recovery-qualification-42020605269", sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("actual same-browser cancellation/write failure trigger at real writes, abort output, and never make a third attempt", async () => {
  const r = await json(base + ".json"); assert.equal(r.executedHead, "de8f6c4c1d3d7a1678d3432fa8410e650c18559a");
  assert.equal(r.status, "passed-private-vp9-recovery-sequence-not-large-or-public-acceptance"); assert.equal(r.recovery.passed, true);
  assert.equal(r.recovery.cases.length, 5);
  for (const [index, fault] of [[0, "cancel-after-write"], [2, "write"]]) {
    const row = r.recovery.cases[index]; assert.equal(row.requestedFault, fault); assert.equal(row.result.qualificationFaultTriggered, true);
    assert.equal(row.result.type, "error"); assert.equal(row.result.errorStage, "conversion"); assert.equal(row.result.writeAttempts, 1);
    assert.equal(row.result.cleanupComplete, true); assert.equal(row.result.isolation.childrenStarted, 2);
    assert.equal(row.result.isolation.terminationRequests, 2); assert.equal(row.browserOutputBytes, 0);
  }
  assert.equal(r.recovery.cases[0].result.errorName, "AbortError");
  // Native write error is recorded honestly as Error, not claimed to be real quota exhaustion.
  assert.equal(r.recovery.cases[2].result.errorName, "Error");
});
test("three real recoveries preserve identical complete VP9 and all strict fidelity gates in one browser", async () => {
  const r = await json(base + ".json"), outputs = r.recovery.cases.filter(row => row.validation);
  assert.equal(outputs.length, 3);
  for (const row of outputs) {
    assert.equal(row.result.type, "complete"); assert.equal(row.browserOutputBytes, 99413); assert.equal(row.validation.passed, true);
    assert.equal(row.outputSha256, "82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b");
    assert.equal(row.validation.clocks.frames, 48); assert.equal(row.validation.clocks.maximumVideoPtsErrorSeconds, 0);
    assert.equal(row.validation.outputFrames.framesWithDuration, 48); assert.equal(row.validation.containerDuration.errorSeconds, 0);
    assert.equal(row.validation.ssim.score, 0.993273); assert.equal(row.validation.ssim.minimumRequired, 0.98);
    assert.ok(row.validation.metadata.length === 8 && row.validation.metadata.every(value => value.equal));
    assert.equal(row.result.metrics.peakPendingOperations, 1); assert.equal(row.result.metrics.peakQueuedBytes, 98994);
    assert.equal(row.result.metrics.wasmMemoryBytes, 33554432);
  }
  assert.deepEqual(r.privateCpuOverride.served, { javascript: 6, wasm: 6 }); assert.equal(r.privateAssetErrorCount, 0);
});
test("whole recovery sequence keeps unchanged blank formula, valid samples, bounded retention, privacy and cleanup", async () => {
  const r = await json(base + ".json");
  assert.equal(r.blankBaseline.stable, true); assert.equal(r.blankBaseline.privateBytes, 347942912);
  assert.equal(r.memory.peak.privateBytes, 585408512); assert.equal(r.memory.incrementalPrivateMiB, (585408512 - 347942912) / 1048576);
  assert.equal(r.memory.incrementalPrivateMiB, 226.46484375); assert.equal(r.memory.validSamples, 218); assert.equal(r.memory.unavailableSamples, 0);
  for (const row of r.recovery.cases) {
    assert.equal(row.passed, true); assert.equal(row.opfsRemoved, true); assert.equal(row.outputRemoved, true);
    assert.ok(row.memory.incrementalPrivateMiB <= 250 && row.memory.unavailableSamples === 0);
    assert.ok(Math.abs(row.cleanupDeltaFromLoadedMiB) < 4.7);
  }
  assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.ownedStaticStageRemoved, true);
  assert.equal(r.processCleanup.length, 3); assert.ok(r.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.deepEqual(r.forbiddenRequests, []); assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(r.publicAcceptance, false); assert.equal(r.fullStressAcceptance, false); assert.equal(r.speedGainProven, false);
  const packed = await read(r.rawArchive.file), raw = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(sha(packed), r.rawArchive.sha256); assert.equal(sha(raw), r.rawArchive.decodedSha256); assert.equal(raw.length, 605429);
  const manifest = await json("evidence/2026-11-05-webcodecs-vp9-recovery-qualification-control-42020605269-archive.json");
  assert.equal(manifest.allRoundtripsVerified, true); assert.equal(manifest.retainedBytes, 274902);
  assert.equal(sha(await read(base + ".json")), manifest.reports[0].compactSha256);
});
