import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proofUrl = new URL("../evidence/mpeg2-split-frame-native-measured-2026-10-06.json", import.meta.url);
test("Executed split native contract retains exact limits, cleanup and non-conversion scope", async () => {
  const p = JSON.parse(await readFile(proofUrl));
  assert.equal(p.run.databaseId, 37435181293); assert.equal(p.run.jobId, 112175137251);
  assert.equal(p.run.headSha, "f5bba0c174c4a223b24d2033f2a838e9cca1755c");
  assert.equal(p.run.conclusion, "success");
  assert.equal((Date.parse(p.run.completedAt) - Date.parse(p.run.startedAt)) / 1000, p.run.jobSeconds);
  assert.equal((Date.parse(p.run.buildCompletedAt) - Date.parse(p.run.buildStartedAt)) / 1000, p.run.buildStepSeconds);
  assert.equal(p.run.jobSeconds, 252); assert.equal(p.run.buildStepSeconds, 207);
  assert.equal(p.report.bytes, 12379);
  assert.equal(p.report.sha256, "f368256ca45440d5d32b1c45622e3312c78667c9b6d0a7d8433491a7e5713125");
  assert.equal(p.artifact.deletedAfterLocalValidation, true); assert.equal(p.artifact.remainingArtifactsAfterDeletion, 0);
  assert.equal(p.cleanup.hostedStepPassed, true); assert.equal(p.cleanup.localDownloadZipRetained, false);
  assert.equal(p.cleanup.binariesAndSourceBundleDownloaded, false);
  assert.equal(p.cleanup.localMediaOrBrowserProfilesCreated, false);
  const report = p.nativeReport;
  assert.equal(report.status, "passed-synthetic-native-frame-transport-not-conversion");
  for (const field of ["publicAcceptance", "conversionPerformed", "processMemoryAcceptance"]) {
    assert.equal(p[field], false); assert.equal(report[field], false);
  }
  assert.equal(p.speedGainClaim, null); assert.equal(report.speedGainClaim, null);
  for (const field of ["mediaFilesRead", "mediaFilesWritten", "originalFixtureRead"]) assert.equal(report[field], false);
  assert.equal(report.nativeStackBytesEach, 262144);
  assert.deepEqual(report.actualLimits.decoder, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(report.actualLimits.encoder, [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  assert.equal(Object.keys(report.sources).length, 7); assert.equal(Object.keys(report.artifacts).length, 4);
  for (const value of [...Object.values(report.sources), ...Object.values(report.artifacts)]) assert.match(value, /^[a-f0-9]{64}$/);
});

test("Every native stride/format case independently regenerates the complete active pixel hash", async () => {
  const { nativeReport: r } = JSON.parse(await readFile(proofUrl));
  assert.equal(r.checkedCases, 12); assert.equal(r.rows.length, 12);
  const keys = new Set();
  for (const row of r.rows) {
    assert.ok((row.width === 18 && row.height === 10) || (row.width === 1920 && row.height === 804));
    assert.ok(["yuv420p", "yuv422p"].includes(row.pixelFormat));
    assert.ok(["false:false", "true:false", "false:true"].includes(`${row.negativeSource}:${row.negativeTarget}`));
    const key = `${row.width}:${row.pixelFormat}:${row.negativeSource}:${row.negativeTarget}`;
    assert.equal(keys.has(key), false); keys.add(key);
    const hash = createHash("sha256"); let activeBytes = 0;
    for (let plane = 0; plane < 3; plane++) {
      const width = plane ? row.width / 2 : row.width;
      const rows = !plane || row.pixelFormat === "yuv422p" ? row.height : row.height / 2;
      const line = new Uint8Array(width);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < width; x++) line[x] = (y * 13 + x * 7 + plane * 31) & 255;
        hash.update(line); activeBytes += width;
      }
    }
    assert.equal(hash.digest("hex"), row.activePixelSha256);
    assert.equal(row.decoderBackingUnchanged, true); assert.equal(row.encoderPaddingUnchanged, true);
    assert.equal(row.nativeReferenceCountBeforeAndAfter, 1);
    assert.deepEqual(row.metrics, { scope: "private-pixel-transport-not-conversion-acceptance",
      decoderMemoryBytes: 33554432, encoderMemoryBytes: 16777216, additionalPixelBufferBytes: 0,
      queuedFrames: 0, activeFrames: 0, peakActiveFrames: 1, completedFrames: 1, copiedFrames: 1,
      copiedBytes: activeBytes, peakFrameBytes: activeBytes, closed: true });
  }
});
