import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceName = "size-independent-memory-audit-2026-09-07.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);

test("P-07 evidence keeps genuine re-encode and stream-copy scaling distinct", () => {
  assert.equal(evidence.requirement, "P-07");
  assert.equal(evidence.status, "verified");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.acceptanceLimitMiB, 250);
  assert.equal(evidence.series.genuineReencode.classification, "decode-reencode");
  assert.equal(evidence.series.streamCopyRemux.classification, "stream-copy-remux");
  assert.match(evidence.series.genuineReencode.classificationProof, /HEVC.*VP8/);
  assert.match(evidence.series.streamCopyRemux.classificationProof, /not claimed as transcoding/);
});

test("the genuine HEVC-to-VP8 series is strongly sublinear and bounded", () => {
  const series = evidence.series.genuineReencode;
  const [small, large] = series.points;
  assert.equal(series.profileId, "mkv-to-webm");
  assert.equal(series.commonTopology.inputVideoCodec, "hevc");
  assert.equal(series.commonTopology.outputVideoCodec, "vp8");
  assert.ok(series.scaling.inputSizeMultiplier > 78);
  assert.ok(series.scaling.outputSizeMultiplier > 129);
  assert.ok(series.scaling.memoryMultiplier < 1.35);
  assert.ok(series.scaling.memoryIncreaseMiB < 54);
  assert.equal(large.sourceBytes, evidence.protectedFixture.bytes);
  assert.equal(large.runCount, 3);
  assert.equal(large.repeatableOutput, true);
  for (const point of [small, large]) {
    assert.equal(point.passed, true);
    assert.ok(point.outputBytes > 0);
    assert.ok(point.worstIncrementalPrivateMiB <= evidence.acceptanceLimitMiB);
    assert.match(point.outputSha256, /^[a-f0-9]{64}$/);
    assert.match(point.rawReportSha256, /^[a-f0-9]{64}$/);
  }
});

test("the 6-to-10 GiB remux series remains bounded and I/O-like", () => {
  const series = evidence.series.streamCopyRemux;
  const [six, ten] = series.points;
  assert.equal(series.profileId, "mkv-to-mp4");
  assert.equal(series.commonTopology.inputVideoCodec, series.commonTopology.outputVideoCodec);
  assert.equal(series.commonTopology.inputAudioCodec, series.commonTopology.outputAudioCodec);
  assert.ok(series.scaling.inputSizeMultiplier > 1.66);
  assert.ok(series.scaling.memoryMultiplier < 1.08);
  assert.ok(Math.abs(series.scaling.sixGiBThroughputMBps - series.scaling.tenGiBThroughputMBps) < 1);
  assert.equal(ten.outputBytes, 10746764442);
  for (const point of [six, ten]) {
    assert.equal(point.passed, true);
    assert.ok(point.worstIncrementalPrivateMiB <= evidence.acceptanceLimitMiB);
  }
});

test("both series enforce fixed backpressure and documented cleanup", async () => {
  for (const series of Object.values(evidence.series)) {
    assert.equal(series.commonTopology.maximumReadChunkBytes, 256 * 1024);
    assert.equal(series.commonTopology.maximumWriteChunkBytes, 256 * 1024);
    assert.equal(series.commonTopology.maximumQueuedBytes, 256 * 1024);
    assert.equal(series.commonTopology.maximumPendingOperations, 1);
  }
  assert.equal(evidence.independentValidation.browserConversionOnly, true);
  assert.equal(evidence.independentValidation.fullOutputBytesValidated, true);
  assert.equal(evidence.independentValidation.allOutputsDeletedAfterValidation, true);
  assert.equal(evidence.cleanup.convertedOutputsRetained, 0);
  assert.equal(evidence.cleanup.browserProfilesRetained, 0);

  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const ledger = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(ledger.includes(evidenceName), relativePath);
  }
});
