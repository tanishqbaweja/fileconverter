import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("historical production MPEG-2 reuse preserves all three real outputs and whole-tree small-fixture evidence", async () => {
  const receipt = JSON.parse(await read("evidence/2026-10-23-mpeg2-compiled-runtime.json"));
  assert.match(receipt.archive.file, /^outputs\/reports\/[0-9TZ.-]+-mpeg2-production-runtime\.json\.gz$/);
  const archive = await read(receipt.archive.file); assert.equal(sha(archive), receipt.archive.sha256); assert.equal(archive.length, receipt.archive.bytes);
  const raw = gunzipSync(archive, { maxOutputLength: 4 * 1048576 });
  assert.equal(sha(raw), receipt.archive.restoredSha256); assert.equal(raw.length, receipt.archive.restoredBytes);
  const report = JSON.parse(raw); assert.deepEqual(report.failures, []); assert.equal(report.executedSourcesAndBrowserPinsVerified, true);
  assert.equal(Object.keys(report.sources).length, receipt.sourcePins);
  assert.deepEqual(report.staticRequests, { manifests: 3, decoder: 1, encoder: 1 });
  assert.equal(report.cacheQualification.results.length, 3);
  for (const [index, row] of report.cacheQualification.results.entries()) {
    assert.equal(row.output.sha256, "a9ede23c2164a31f59e1d1fed9aa60ae43de2ee0928229c3e588e9865aedbb13");
    assert.equal(row.output.bytes, 585266); assert.equal(row.output.codec, "mpeg2video"); assert.equal(row.output.frames, 96);
    assert.equal(row.output.fullNativeDecodePassed, true); assert.ok(row.output.ssim >= 0.98);
    assert.equal(row.output.videoClocks.frames, 96); assert.ok(row.output.videoClocks.maximumVideoPtsErrorSeconds < 0.001);
    assert.equal(row.output.titlePreserved, true); assert.equal(row.output.languagePreserved, true);
    assert.match(row.output.copiedAudioPacketHash, /^0,a,SHA256=[a-f0-9]{64}$/);
    assert.ok(row.conversion.phases.includes(index === 0 ? "Compiled MPEG-2 code" : "Reusing compiled MPEG-2 code"));
    assert.equal(row.conversion.nativeMetrics.wasmMemoryBytes, 50331648);
    assert.ok(row.conversion.nativeMetrics.peakQueuedBytes <= 262144); assert.ok(row.conversion.metrics.peakQueuedBytes <= 524288);
    assert.equal(row.conversion.metrics.peakPendingOperations, 1); assert.equal(row.conversion.metrics.pendingOperations, 0);
  }
  const samples = report.diagnosticMemorySamples; assert.ok(samples.every(sample => sample.privateBytes !== null));
  for (const sample of samples) assert.equal(sample.privateBytes, sample.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  const peak = Math.max(...samples.filter(sample => sample.phase !== "blank").map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.ok(receipt.memory.incrementalPrivateMiB <= 250); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.cleanup.allOwnedProcessesAbsent, true); assert.equal(report.protectedOriginalUnchanged, true);
  for (const key of ["globalSpeedClaim", "causalSpeedComparison", "largeFileAcceptance", "publicAcceptance", "fullGoalComplete"]) assert.equal(receipt[key], false);
});
