import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url));
const evidence = JSON.parse(await read("evidence/production-native-memory-2026-10-04.json"));

test("changed protected-fixture profiler evidence keeps true remux size, packet identity, stable baseline and three repetitions", () => {
  assert.equal(evidence.status, "passed-three-repeat-session"); assert.equal(evidence.source.bytes, 2958573265);
  assert.equal(evidence.source.sha256.toLowerCase(), "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(evidence.blankBaseline.stable, true); assert.equal(evidence.loadedIdle.stable, true);
  assert.equal(evidence.runs.length, 3); assert.equal(evidence.incrementalPrivateMiB, 236.5);
  for (const run of evidence.runs) {
    assert.equal(run.outputBytes, 2962151522);
    assert.equal(run.sha256, "aff831693c020c02a0163e25d0f08a7529d0fb0e4022f0cb984c60d90348334a");
    assert.equal(run.mediaProbe.withinValidation.mediaTraversal, "full-compressed-packet-hash");
    assert.equal(run.mediaProbe.withinValidation.compressedPacketStreamHash, evidence.runs[0].mediaProbe.withinValidation.compressedPacketStreamHash);
    assert.equal(run.peakPrivateBytes, Math.max(run.cimPeakPrivateBytes, run.nativePeaks.peak.privateBytes));
    assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - evidence.blankBaseline.privateBytes) / 1048576);
    assert.ok(run.incrementalPrivateMiB <= 250 && run.cleanupDeltaFromLoadedMiB <= 96);
    assert.ok(run.maxReadChunkBytes <= 262144 && run.maxWriteChunkBytes <= 1048576);
    assert.equal(run.peakPendingOperations, 1);
  }
  assert.equal(evidence.cancellationCheck.passed, true);
  assert.deepEqual(evidence.cancellationCheck.projectLocalEntriesAfter, []);
  assert.ok(Object.values(evidence.checks).every(Boolean));
});

test("every retained phase peak is an actual simultaneous process sum including unknown utility and unavailable reads", () => {
  const m = evidence.nativeMemory;
  assert.equal(m.sequence, 2708); assert.equal(m.error, null); assert.equal(m.identities.length, 26);
  assert.equal(m.phases.reduce((sum, p) => sum + p.validSamples + p.unavailableSamples, 0), m.sequence);
  assert.equal(m.phases.reduce((sum, p) => sum + p.unavailableSamples, 0), 1);
  for (const phase of m.phases) {
    for (const row of [phase.peak, phase.rssPeak, phase.last, ...phase.unavailableExamples].filter(Boolean)) {
      if (row[6] != null) { assert.equal(row[3], null); assert.equal(row[4], null); assert.equal(row[7], null); continue; }
      assert.equal(row[3], row[7].reduce((sum, p) => sum + p[1], 0));
      assert.equal(row[4], row[7].reduce((sum, p) => sum + p[2], 0));
      assert.ok(row[7].every(([i]) => ["browser", "unknown"].includes(m.identities[i].type)));
    }
  }
  const cleanup = m.phases.find((p) => p.phase === "cleanup-2").peak;
  assert.equal((cleanup[3] - evidence.blankBaseline.privateBytes) / 1048576, 341.56640625);
  assert.ok(cleanup[3] > evidence.peakPrivateBytes, "Higher cleanup peak is retained, not repurposed as a baseline or hidden");
  const utility = cleanup[7].find(([i]) => m.identities[i].pid === 5700);
  assert.equal(utility[1], 276844544); assert.equal(m.identities[utility[0]].type, "unknown");
  for (const run of evidence.runs) {
    const p = m.phases.filter((p) => [`pre-conversion-${run.run}`, `conversion-${run.run}`].includes(p.phase));
    assert.equal(run.nativePeaks.peak.privateBytes, Math.max(...p.map((p) => p.peak[3])));
    assert.equal(run.nativePeaks.validSamples, p.reduce((sum, p) => sum + p.validSamples, 0));
  }
});

test("production observer proof remains source-bound and cleanup claims exclude policy-blocked runtime cache", async () => {
  for (const [file, expected] of Object.entries(evidence.currentSources)) {
    assert.equal(createHash("sha256").update(await read(file)).digest("hex"), expected, file);
  }
  assert.equal(evidence.cleanup.protectedFixturePostHashVerified, true);
  assert.equal(evidence.cleanup.profileAndObserverScratchAbsent, true);
  assert.equal(evidence.cleanup.convertedPayloadInsideRemovedProfile, true);
  assert.equal(evidence.runtimeScratchInventoryAfterGate.blockedTotalFileBytes, 47);
  assert.equal(evidence.runtimeScratchInventoryAfterGate.deletionPolicyBlocked, true);
  assert.equal(evidence.runtimeScratchInventoryAfterGate.bypassAttempted, false);
});
