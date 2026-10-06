import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const url = new URL("../evidence/mpeg2-split-properties-native-measured-2026-10-06.json", import.meta.url);
const sha = (value) => createHash("sha256").update(value).digest("hex");

// Independent reconstruction of the synthetic source property record, not an
// import of the production serializer or a copy of the runner's output bytes.
// Enum values below come from the pinned FFmpeg 8.1.2 headers, not current HEAD.
function expectedProperties(row) {
  const wire = new Uint8Array(65536), view = new DataView(wire.buffer);
  let cursor = 160;
  const values = [[0, 0x31504657], [4, 1], [12, row.width], [16, row.height],
    [20, row.pixelFormat === "yuv422p" ? 1 : 0], [24, 3], [28, 1001], [32, 1000],
    [36, 1], [40, 90000], [44, 118], [48, 2], [52, 26], [56, 4],
    [60, 1], [64, 1], [68, 1], [72, 1], [76, 1], [80, 0], [136, 5], [140, 4]];
  for (const [offset, value] of values) view.setUint32(offset, value, true);
  view.setBigInt64(88, 1152921504606846985n, true);
  view.setBigInt64(96, -9223372036854775808n, true);
  view.setBigInt64(104, -1152921504606846985n, true);
  view.setBigInt64(112, 9223372036854775807n, true);
  const encoder = new TextEncoder();
  function dictionary(entries) {
    for (const [key, value] of entries) {
      const k = encoder.encode(key + "\0"), v = encoder.encode(value + "\0");
      view.setUint32(cursor, k.length, true); view.setUint32(cursor + 4, v.length, true); cursor += 8;
      wire.set(k, cursor); cursor += k.length; wire.set(v, cursor); cursor += v.length;
    }
  }
  dictionary([["Title", "Unicode: ☃ 日本"], ["title", "different case"], ["empty", ""],
    ["duplicate", "first"], ["duplicate", "second"]]);
  const rawSideTypes = [1, 20, 15, 31]; // A53 CC, SEI unregistered, ICC, EXIF.
  for (let i = 0; i < 4; i++) {
    view.setUint32(cursor, rawSideTypes[i], true); view.setUint32(cursor + 4, 33 + i, true);
    view.setUint32(cursor + 8, 1, true); cursor += 16;
    for (let j = 0; j < 33 + i; j++) wire[cursor++] = (i * 17 + j) & 255;
    dictionary([["side-note", "private test bytes"]]);
  }
  view.setUint32(8, cursor, true);
  return wire.subarray(0, cursor);
}

test("Actual native property report proves exact clocks and metadata bytes across all formats and stride cases", async () => {
  const p = JSON.parse(await readFile(url)), r = p.nativeReport;
  assert.equal(p.run.databaseId, 37438448154); assert.equal(p.run.jobId, 112185969488);
  assert.equal(p.run.headSha, "ea5597d11af7f6e58529187311fa3f91419dde74"); assert.equal(p.run.conclusion, "success");
  assert.equal(p.run.jobSeconds, 245); assert.equal(p.run.buildStepSeconds, 202);
  assert.equal((Date.parse(p.run.completedAt) - Date.parse(p.run.startedAt)) / 1000, p.run.jobSeconds);
  assert.equal((Date.parse(p.run.buildCompletedAt) - Date.parse(p.run.buildStartedAt)) / 1000, p.run.buildStepSeconds);
  const canonicalReport = JSON.stringify(r, null, 2) + "\n";
  assert.equal(Buffer.byteLength(canonicalReport), 15115); assert.equal(p.report.bytes, 15115);
  assert.equal(sha(canonicalReport), "b05a75e9e480c9d77779a0999d471a8ffad2fc9c25d87cd80e5b6b0d0192a025");
  assert.equal(p.report.sha256, sha(canonicalReport));
  assert.equal(r.checkedCases, 12); assert.equal(r.rows.length, 12);
  const keys = new Set();
  for (const row of r.rows) {
    assert.ok((row.width === 18 && row.height === 10) || (row.width === 1920 && row.height === 804));
    assert.ok(["yuv420p", "yuv422p"].includes(row.pixelFormat));
    assert.ok(["false:false", "true:false", "false:true"].includes(`${row.negativeSource}:${row.negativeTarget}`));
    const key = `${row.width}:${row.pixelFormat}:${row.negativeSource}:${row.negativeTarget}`;
    assert.equal(keys.has(key), false); keys.add(key);
    const expected = expectedProperties(row);
    assert.equal(expected.length, 637); assert.equal(row.propertyBytes, expected.length);
    assert.equal(row.propertySha256, sha(expected));
    assert.equal(row.metadataEntries, 5); assert.equal(row.byteArraySideEntries, 4);
    assert.equal(row.exact64BitTiming, true); assert.equal(row.sourceBackingAndPropertiesUnchanged, true);
    assert.equal(row.nativePixelReferencesUnchanged, true);
    const pixelBytes = row.width * row.height * (row.pixelFormat === "yuv420p" ? 1.5 : 2);
    assert.equal(row.metrics.copiedBytes, pixelBytes); assert.equal(row.metrics.peakFrameBytes, pixelBytes);
    for (const field of ["copiedFrames", "completedFrames", "peakActiveFrames"]) assert.equal(row.metrics[field], 1);
    for (const field of ["additionalPixelBufferBytes", "activeFrames", "queuedFrames"]) assert.equal(row.metrics[field], 0);
    assert.equal(row.metrics.closed, true);
  }
});

test("Compiled property contract keeps bounded heaps, adverse cleanup and synthetic-only scope explicit", async () => {
  const p = JSON.parse(await readFile(url)), r = p.nativeReport;
  assert.equal(p.cleanup.recipeCompletedSuccessfully, true); assert.equal(p.cleanup.hostedStepPassed, true);
  assert.equal(p.cleanup.localDownloadZipRetained, false); assert.equal(p.cleanup.localMediaOrBrowserProfilesCreated, false);
  assert.equal(p.cleanup.binariesOrSourceBundleDownloaded, false);
  assert.equal(p.artifact.deletedAfterVerification, true); assert.equal(p.artifact.remainingArtifacts, 0);
  assert.equal(p.localSourceHashesMatched, 10); assert.equal(Object.keys(r.sources).length, 10);
  assert.equal(Object.keys(r.artifacts).length, 4);
  assert.deepEqual(r.actualLimits.decoder, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(r.actualLimits.encoder, [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  assert.equal(r.nativeStackBytesEach, 262144); assert.equal(r.nativePropertySlotBytesEach, 65536);
  assert.equal(r.additionalPixelBufferBytes, 0); assert.equal(r.rejectedRecords, 17);
  assert.equal(r.repeatedTransfers, 100); assert.equal(r.rejectedSources, 7);
  assert.equal(r.emptySourceClearedOldProperties, true); assert.equal(r.finalNativePixelReferences, 0);
  assert.equal(r.status, "passed-synthetic-native-pixels-and-properties-not-conversion");
  for (const field of ["conversionPerformed", "publicAcceptance", "processMemoryAcceptance"]) {
    assert.equal(p[field], false); assert.equal(r[field], false);
  }
  for (const field of ["originalFixtureRead", "mediaFilesRead", "mediaFilesWritten"]) assert.equal(r[field], false);
  assert.equal(p.speedGainClaim, null); assert.equal(r.speedGainClaim, null);
  assert.match(r.limits, /other or structured side types explicitly refuse/);
});
