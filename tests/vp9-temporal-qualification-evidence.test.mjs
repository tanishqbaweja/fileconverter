import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const read = file => readFile(new URL("../" + file, import.meta.url)), json = async file => JSON.parse(await read(file)),
  base = "evidence/2026-11-06-vp9-temporal-qualification-42129383089", sha = v => createHash("sha256").update(v).digest("hex");
const r = await json(base + ".json"), expected = "82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b";
test("actual guarded browser control and three recoveries remain byte-identical and pass every strict small fidelity gate", () => {
  assert.equal(r.executedHead, "758ba7297bb248d26f0cce9dd89aba0178548d62");
  assert.equal(r.status, "passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");
  assert.deepEqual(r.failures, []); assert.equal(r.temporalAllocationGuard.bitExactComparedWithUnmodifiedLibvpx, true);
  assert.equal(r.privateCpuOverride.runId, 42129383089); assert.equal(r.outputSha256, expected);
  assert.equal(r.recovery.passed, true);
  const outputs = [{ outputSha256: r.outputSha256, validation: r.independentFidelity }, ...r.recovery.cases.filter(row => row.validation)];
  assert.equal(outputs.length, 4);
  for (const output of outputs) {
    assert.equal(output.outputSha256, expected); assert.equal(output.validation.passed, true);
    assert.equal(output.validation.clocks.frames, 48); assert.equal(output.validation.clocks.maximumVideoPtsErrorSeconds, 0);
    assert.equal(output.validation.outputFrames.framesWithDuration, 48); assert.equal(output.validation.containerDuration.errorSeconds, 0);
    assert.equal(output.validation.ssim.score, 0.993273); assert.equal(output.validation.ssim.minimumRequired, 0.98);
    assert.equal(output.validation.metadata.length, 8); assert.ok(output.validation.metadata.every(row => row.equal));
  }
});
test("real adverse writes abort cleanly and same-blank whole-Chrome measurement remains below250MiB", () => {
  assert.equal(r.blankBaseline.stable, true); assert.equal(r.memory.incrementalPrivateMiB, 243.875);
  assert.equal(r.memory.incrementalPrivateMiB, (r.memory.peak.privateBytes - r.blankBaseline.privateBytes) / 1048576);
  assert.equal(r.memory.peak.privateBytes, 603475968); assert.equal(r.memory.validSamples, 240); assert.equal(r.memory.unavailableSamples, 0);
  assert.equal(r.recovery.cases.length, 5);
  for (const row of r.recovery.cases) {
    assert.equal(row.passed, true); assert.equal(row.opfsRemoved, true); assert.equal(row.outputRemoved, true);
    assert.equal(row.result.cleanupComplete, true); assert.equal(row.result.isolation.childrenStarted, 2);
    assert.ok(row.result.metrics.peakPendingOperations <= 1 && row.result.metrics.peakQueuedBytes <= 1048576);
    assert.ok(row.memory.incrementalPrivateMiB <= 250); assert.equal(row.memory.unavailableSamples, 0);
    if (row.requestedFault) { assert.equal(row.result.type, "error"); assert.equal(row.result.qualificationFaultTriggered, true); assert.equal(row.browserOutputBytes, 0); }
  }
  assert.equal(r.recovery.cases[0].result.errorName, "AbortError"); assert.equal(r.recovery.cases[2].result.errorName, "Error");
  assert.equal(r.headed, false); assert.equal(r.browserServicesDisabled, false);
  assert.equal(r.fullStressAcceptance, false); assert.equal(r.speedGainProven, false); assert.equal(r.publicAcceptance, false);
});
test("raw evidence is losslessly archived and all owned conversions/profile/processes removed with original unchanged", async () => {
  const packed = await read(r.rawArchive.file), raw = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(sha(packed), r.rawArchive.sha256); assert.equal(sha(raw), r.rawArchive.decodedSha256); assert.equal(raw.length, 632345);
  assert.deepEqual(r.forbiddenRequests, []); assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.ownedStaticStageRemoved, true);
  assert.ok(r.processCleanup.length === 3 && r.processCleanup.every(row => row.status === "owned-identity-absent"));
  const archive = await json("evidence/2026-11-06-webcodecs-vp9-recovery-qualification-control-42129383089-archive.json");
  assert.equal(archive.retainedBytes, 282068); assert.equal(archive.allRoundtripsVerified, true);
  assert.equal(sha(await read(base + ".json")), archive.reports[0].compactSha256);
});
