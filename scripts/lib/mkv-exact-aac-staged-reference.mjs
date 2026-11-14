import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const mkvStagedReference = Object.freeze({
  file: "evidence/2026-11-08T01-16-10-010Z-mkv-edit-list-aac-candidate.json",
  sha256: "e35ecbb2b7c882aa0a7a117a9babff9de71d5343cfa4d5009b9a78e2fd8c8c9f",
});
export const mkvHevcRegressionFixture = Object.freeze({
  file: "fixtures/media/within-test-synthetic-hevc-aac.mkv", bytes: 5945271,
  sha256: "5b8fdc40c1679299442736984826ff4d01be2e69915906ea4e31c0dde267dedc",
});
export const mkvFixedHevcReference = Object.freeze({
  file: "evidence/2026-11-14T22-55-45-030Z-mkv-fixed-input-hevc-baseline.json",
  sha256: "f7aa250b73b97c4848347d952f26719f221b32270638b3aef62c1bd48e6fe372",
});

export function readMkvExactAacStagedReference(bytes, tools, fixture) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), mkvStagedReference.sha256);
  const report = JSON.parse(bytes), [arm] = report.arms;
  assert.equal(report.status, "passed-unpublished-small-staged-clock-control-not-public-acceptance");
  assert.equal(report.exactAacCandidate, true);
  assert.deepEqual(report.candidateBuild, tools);
  assert.equal(report.fixture.bytes, fixture.bytes);
  assert.equal(report.fixture.packetHashes, fixture.packetHashes);
  assert.deepEqual(report.fixture.aac, fixture.aac);
  assert.deepEqual(arm.cases.map(row => row.state), ["complete", "cancelled", "error", "complete"]);
  assert.ok(arm.ownedRuntimeRemoved && report.fixtureRuntimeRemoved && report.toolDownloadRemoved);
  assert.ok(arm.cases.every(row => row.outputRemoved));
  const [first, last] = [arm.cases[0], arm.cases[3]];
  assert.ok(first.validation.candidateGate.passed && last.validation.candidateGate.passed);
  assert.match(first.validation.outputSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.validation.outputSha256, last.validation.outputSha256);
  return { ...mkvStagedReference, outputSha256: first.validation.outputSha256, outputBytes: first.metrics.outputBytes };
}

// Different native core deliberately under test: bind the unchanged fixture and
// previously validated output bytes, without weakening the old same-tool gate.
export function readMkvHevcRegressionReference(bytes, fixture) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), mkvStagedReference.sha256);
  const report = JSON.parse(bytes), [arm] = report.arms, first = arm.cases[0], last = arm.cases[3];
  assert.equal(report.status, "passed-unpublished-small-staged-clock-control-not-public-acceptance");
  assert.equal(fixture.bytes, mkvHevcRegressionFixture.bytes);
  assert.equal(fixture.sha256, mkvHevcRegressionFixture.sha256, "Exact reusable HEVC input required");
  for (const key of ["packetHashes", "aac"]) assert.deepEqual(fixture[key], report.fixture[key], `Historical HEVC content required: ${key}`);
  assert.deepEqual(arm.cases.map(row => row.state), ["complete", "cancelled", "error", "complete"]);
  for (const row of [first, last]) {
    assert.ok(row.validation.candidateGate.passed && row.validation.fullDecode && row.validation.aac.completeDecodedPcmEqual && row.outputRemoved);
    assert.equal(row.validation.aac.packetTimingAndTrim.initialSkipSamples, 1024);
    assert.equal(row.validation.outputSha256, first.validation.outputSha256);
  }
  assert.ok(arm.ownedRuntimeRemoved && report.fixtureRuntimeRemoved && report.toolDownloadRemoved);
  if (arm.browserCleanup.status !== "owned-observed-pids-absent") {
    assert.equal(arm.browserCleanup.status, "owned-observed-pids-not-proven-absent");
    assert.equal(arm.birthCleanup.allObservedBirthsAbsent, true);
    assert.equal(arm.birthCleanup.observedPidCount, arm.browserCleanup.observedPids.length);
    assert.deepEqual(arm.birthCleanup.unresolved, []);
    assert.equal(arm.birthCleanup.noProcessesKilled, true);
  }
  return { ...mkvStagedReference, outputBytes: first.metrics.outputBytes, outputSha256: first.validation.outputSha256,
    input: mkvHevcRegressionFixture, historicalInputByteIdentity: false,
    scope: "pinned bitexact fixture with historical encoded packets/PCM; complete output hash required; not same-tool or historical input-byte equivalence" };
}

export function readMkvFixedHevcReference(bytes, fixture) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), mkvFixedHevcReference.sha256);
  const report = JSON.parse(bytes), [arm] = report.arms;
  assert.equal(report.status, "passed-fixed-input-hevc-baseline-not-public-acceptance");
  assert.equal(report.candidateBuild.build.artifacts["within-direct.wasm"].sha256,
    "f56a8592f81294dc07190f400d9ce1399361ebfe963a558ff63bff4041707be7");
  assert.equal(fixture.bytes, mkvHevcRegressionFixture.bytes);
  assert.equal(fixture.sha256, mkvHevcRegressionFixture.sha256);
  for (const key of ["bytes", "sha256", "packetHashes", "aac"]) assert.deepEqual(fixture[key], report.fixture[key]);
  assert.deepEqual(arm.cases.map(row => row.state), ["complete", "cancelled", "error", "complete"]);
  const first = arm.cases[0];
  for (const row of [first, arm.cases[3]]) {
    assert.ok(row.validation.candidateGate.passed && row.validation.fullDecode && row.validation.timingGate.passed);
    assert.ok(row.validation.aac.completeDecodedPcmEqual && row.outputRemoved);
    assert.equal(row.validation.aac.packetTimingAndTrim.initialSkipSamples, 1024);
    assert.equal(row.validation.outputSha256, first.validation.outputSha256);
  }
  assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && report.fixtureRuntimeRemoved && report.toolDownloadRemoved);
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.ok(arm.memory.incrementalPrivateMiB <= 250 && arm.memory.cleanupAboveIdleMiB <= 96);
  return { ...mkvFixedHevcReference, input: mkvHevcRegressionFixture, outputBytes: first.metrics.outputBytes,
    outputSha256: first.validation.outputSha256, priorWasmSha256: report.candidateBuild.build.artifacts["within-direct.wasm"].sha256,
    scope: "same pinned input bytes, previously qualified native core, independently validated output and recovery; no speed or large-file claim" };
}
