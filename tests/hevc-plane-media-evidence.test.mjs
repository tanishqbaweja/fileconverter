// Real production-browser media/recovery witness; short files are not full acceptance.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectAttemptMediaReport } from "../scripts/lib/hevc-plane-media-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofBytes = await read("evidence/2026-10-11T23-36-02-695Z-hevc-plane-media.json"), proof = JSON.parse(proofBytes);
async function restore(record, limit = 8388608) {
  const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: limit }); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return JSON.parse(bytes);
}
const archive = await restore(proof.generatedArchive), report = await restore(proof.report.archive, 2097152);
test("actual media receipt joins all158 current/pre/post/source bytes and actual new-core/plane-encoder generated adapters", async () => {
  assert.equal(sha(proofBytes), "0fe68009e2457434f4e41169d7751210233c743e0a0795b1ae2729276677d2ee");
  assert.equal(proof.failure, null); assert.equal(proof.status, "three-headless-attempt-core-conversions-and-recovery-passed-not-full-acceptance");
  assert.equal(Object.keys(proof.sourcePins).length, 158); assert.deepEqual(proof.sourcePins, proof.postSourcePins); assert.deepEqual(archive.sourcePins, proof.sourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) { assert.equal(sha(await read(file)), hash, file); assert.equal(sha(archive.sources[file]), hash, file); }
  assert.equal(archive.generated.candidateName, report.candidateName);
  assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"], "07ff8c19e9f58205f21a9cd10f6d7f0e0fb8f1e7086b810818724846117d51e4");
  assert.equal(report.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.deepEqual(report.manifest, archive.generated.composition.manifest);
  assert.match(archive.generated.stage, /createCompositeAllocationAbortCapture/); assert.match(archive.generated.stage, /mapped\[9\] = 4000000/);
  for (const [file, row] of Object.entries(archive.generated.composition.files)) assert.equal(sha(await read(row.path)), report.manifest.artifacts[file], file);
});
test("actual three genuine outputs independently preserve pixels/audio/timelines/artwork/titles and recover on same pages", async () => {
  const build = JSON.parse(await read(proof.build.path)), baseline = JSON.parse(await read(proof.baseline.path)).reports[0].report;
  assert.deepEqual(inspectAttemptMediaReport(report, baseline, build), proof.analysis);
  const cases = report.rows.filter(row => !row.kind && row.container); assert.equal(cases.length, 3);
  for (const row of cases) {
    assert.equal(row.status, "passed"); assert.equal(row.sourceCodec, "hevc"); assert.equal(row.outputCodec, "mpeg2video");
    assert.equal(row.sourceBytes, 4457906); assert.equal(row.outputBytes, 2245558); assert.equal(row.frames, "96"); assert.equal(row.audioTracks, 2);
    assert.equal(row.ssim, 0.983095); assert.equal(row.timestampAlignedSsim, 0.966841);
    assert.equal(row.outputSha256, "554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27");
    assert.equal(row.sourceFrameTimes.length, 96); assert.equal(row.outputFrameTimes.length, 96);
    for (let i = 0; i < 96; i++) assert.ok(Math.abs(row.sourceFrameTimes[i] - row.outputFrameTimes[i]) <= 0.001);
    const m = row.metrics; assert.equal(m.peakWasmMemoryBytes, 50331648); assert.equal(m.peakQueuedBytes, 524288);
    assert.equal(m.peakPendingOperations, 1); assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0);
    assert.equal(m.maxReadChunkBytes, 65536); assert.equal(m.maxWriteChunkBytes, 524288); assert.equal(m.scratchBytes, 0);
    // This production profile honestly uses bounded disk-backed MP4 staging,
    // then a fixed512KiB copy to the selected output; not native direct AVIO.
    assert.equal(m.peakScratchBytes, row.outputBytes); assert.ok(row.warnings[0].includes("private-storage staging"));
  }
  for (const kind of ["attached-picture-preservation", "exact-stream-title-mapping", "independent-decoded-audio", "independent-frame-diagnostic", "independent-presentation-timeline-passed"])
    assert.equal(report.rows.filter(row => row.kind === kind).length, 3, kind);
  for (const row of report.rows.filter(row => row.kind === "independent-decoded-audio")) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
  assert.deepEqual(proof.analysis.recovery.results.map(row => row.phase), ["write-failure", "cancellation"]);
  assert.equal(proof.analysis.genuineValidatedConversions, 3); assert.equal(proof.analysis.speedImprovementProven, false);
});
test("actual fixture/output/tool cleanup, protected whole SHA and host/disk guards passed; short process samples not250MiB acceptance", async () => {
  assert.deepEqual(proof.protectedPre, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  assert.deepEqual(proof.protectedPost, proof.protectedPre); assert.equal(proof.launchHostPreflight.safeToStart, true);
  assert.equal(proof.launchHostPreflight.requiredPhysicalBytes, 2147483648); assert.ok(proof.diskPreflightBytes >= 2147483648);
  assert.equal(proof.cleanup.normalAppAndCssUnchanged, true); assert.equal(proof.cleanup.privateAdditionsAbsent, true);
  assert.equal(proof.cleanup.ownedWrapperAbsent, true); assert.deepEqual(proof.cleanup.newFixtureDirsRemaining, []);
  const helpers = proof.cleanup.helpers; assert.equal(sha(await read(helpers.path)), helpers.sha256); assert.equal(helpers.launchRecords.length, 2);
  for (const row of helpers.launchRecords) assert.equal(row.absence.status, "owned-identity-absent");
  for (const directory of [proof.cleanup.ownedWrapper, helpers.runtime]) await assert.rejects(access(directory), { code: "ENOENT" });
  for (const row of report.rows.filter(row => "cleanupRemovedEntries" in row)) assert.deepEqual(row.cleanupRemovedEntries, []);
  const samples = report.rows.filter(row => "memoryScope" in row); assert.equal(samples.length, 3);
  for (const field of ["completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance"]) assert.equal(proof[field], false);
});
test("post-validation raw report removed only after byte-exact recoverable compact archive, without changing historical receipt", async () => {
  const retention = JSON.parse(await read("evidence/2026-10-11T23-36-02-695Z-hevc-plane-media-retention.json"));
  assert.equal(retention.proof.sha256, sha(proofBytes)); assert.deepEqual(retention.retainedArchive, proof.report.archive);
  assert.equal(retention.rawReport.sha256, proof.report.sha256); assert.equal(retention.rawReport.path, proof.report.path);
  assert.equal(retention.rawReport.removedAfterArchiveValidation, true); assert.equal(retention.exactRawBytesRecoverableFromArchive, true);
  assert.equal(retention.removedFiles, 1); await assert.rejects(access(path.join(root, retention.rawReport.path)), { code: "ENOENT" });
  assert.deepEqual(await restore(retention.retainedArchive, 2097152), report);
});
