import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const mkvStagedReference = Object.freeze({
  file: "evidence/2026-11-08T01-16-10-010Z-mkv-edit-list-aac-candidate.json",
  sha256: "e35ecbb2b7c882aa0a7a117a9babff9de71d5343cfa4d5009b9a78e2fd8c8c9f",
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
