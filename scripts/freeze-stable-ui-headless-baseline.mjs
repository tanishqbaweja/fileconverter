// Independent retained-evidence review; no conversion or browser relaunch.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { baselineBinding, compareMatchedHeadlessUi, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 3);
const receiptPath = process.argv[2]; assert.match(receiptPath, /^evidence\/[0-9TZ-]+-stable-ui-headless-baseline\.json$/);
const receiptBytes = await read(receiptPath), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.status, "matched-headless-geometry-and-five-goldens-passed"); assert.equal(receipt.failure, null);
assert.equal(receipt.browserMode, "headless"); assert.equal(receipt.subprocessWindowsHidden, true);
for (const host of [receipt.hostPreflight, receipt.launchHostPreflight]) assert.ok(host.freePhysicalBytes >= 2 * 1024 ** 3 && host.freeVirtualBytes >= 2 * 1024 ** 3);
assert.ok(receipt.diskPreflightBytes >= 2 * 1024 ** 3);
assert.deepEqual(receipt.protectedPre, receipt.protectedPost);
assert.equal(receipt.protectedPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(receipt.protectedPost.bytes, 2958573265);
assert.deepEqual(receipt.postSourcePins, receipt.sourcePins); assert.equal(Object.keys(receipt.sourcePins).length, 18);
for (const [file, hash] of Object.entries(receipt.sourcePins)) assert.equal(sha(await read(file)), hash, file);
assert.equal(receipt.cleanup.ownedWrapperAbsent, true); assert.equal(receipt.cleanup.assetsRestored, true);
await assert.rejects(access(receipt.cleanup.ownedWrapper), { code: "ENOENT" });
assert.equal(receipt.cleanup.numericProcessObservation.observedPidCount, 25);
assert.equal(receipt.cleanup.numericProcessObservation.nativeBirthsUnavailable, true);
assert.deepEqual(receipt.cleanup.numericProcessObservation.current, []);
assert.equal(receipt.rawRemovedAfterLosslessArchive, true);
await assert.rejects(access(path.join(root, receipt.rawReport.path)), { code: "ENOENT" });
const compressed = await read(receipt.compressedReport.path); assert.equal(sha(compressed), receipt.compressedReport.sha256);
const raw = gunzipSync(compressed, { maxOutputLength: 2 * 1024 ** 2 }); assert.equal(sha(raw), receipt.rawReport.sha256); assert.equal(raw.length, receipt.rawReport.bytes);
assert.equal(receipt.bytesSaved, raw.length - compressed.length);
const report = JSON.parse(raw), priorBytes = await read(receipt.candidateValidation.path);
assert.equal(sha(priorBytes), receipt.candidateValidation.sha256); const prior = JSON.parse(priorBytes);
const candidateGzip = await read(prior.compressedReport.path); assert.equal(sha(candidateGzip), prior.compressedReport.sha256);
const candidateRaw = gunzipSync(candidateGzip, { maxOutputLength: 2 * 1024 ** 2 }); assert.equal(sha(candidateRaw), prior.rawReport.sha256);
const compared = compareMatchedHeadlessUi(JSON.parse(candidateRaw), report); assert.deepEqual(compared, receipt.analysis);
assert.equal(compared.maximumDeltaCssPixels, 0); assert.equal(compared.matchingHeadlessGeometryAccepted, true);
const archive = await read(receipt.generatedArchive.path); assert.equal(sha(archive), receipt.generatedArchive.sha256);
const generated = JSON.parse(gunzipSync(archive, { maxOutputLength: 262144 }));
for (const [name, code] of Object.entries(generated)) assert.equal(sha(code), receipt.generatedArchive.hashes[name]);
assert.ok(generated.spec.includes("headless: true") && !generated.spec.includes("headless: false"));
assert.equal((generated.driver.match(/windowsHide: true/g) ?? []).length, 6);
const rows = kind => report.rows.filter(row => row.kind === kind);
assert.equal(rows("actual-served-stable-ui-baseline").length, 5);
for (const row of rows("actual-served-stable-ui-baseline")) assert.deepEqual({ url: row.url, bytes: row.bytes, sha256: row.sha256 }, baselineBinding);
const conversions = report.rows.filter(row => !row.kind && row.status === "passed"); assert.equal(conversions.length, 3);
for (let i = 0; i < conversions.length; i++) {
  const actual = conversions[i], expected = prior.conversions[i];
  for (const field of ["sourceBytes", "outputBytes", "sourceCodec", "outputCodec", "frames", "audioTracks", "ssim", "outputSha256", "destination"])
    assert.deepEqual(actual[field], expected[field]);
  const m = actual.metrics; assert.equal(m.peakPendingOperations, 1); assert.equal(m.peakWasmMemoryBytes, 50331648);
  assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0);
  assert.ok(m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 524288 && m.peakQueuedBytes <= 524288);
}
assert.equal(report.manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(report.manifest.allowMemoryGrowth, false);
assert.equal(rows("independent-frame-diagnostic").length, 3); assert.ok(rows("independent-frame-diagnostic").every(row => row.nativeFullDecodePassed));
assert.equal(rows("independent-decoded-audio").length, 3);
for (const row of rows("independent-decoded-audio")) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
assert.equal(rows("attached-picture-preservation").length, 3); assert.ok(rows("attached-picture-preservation").every(row => row.status === "passed"));
assert.equal(rows("independent-presentation-timeline-passed").length, 3);
assert.equal(rows("actual-split-native-ownership").length, 5);
for (const row of rows("actual-split-native-ownership")) for (const sample of row.samples) {
  for (const field of ["activePackets", "queuedFrames", "queuedPackets", "additionalPixelBufferBytes", "additionalJsPacketBufferBytes"]) assert.equal(sample[field], 0);
  assert.equal(sample.closed, true); assert.equal(sample.aggregateWasmMemoryBytes, 50331648); assert.ok(sample.maximumMediaAvioWriteBytes <= 262144);
}
for (const kind of ["direct-write-failure", "cancel-after-direct-output"]) { assert.equal(rows(kind).length, 1); assert.equal(rows(kind)[0].status, "passed"); assert.deepEqual(rows(kind)[0].partialBytes, []); }
const inventories = report.rows.filter(row => "cleanupRemovedEntries" in row); assert.equal(inventories.length, 5);
for (const row of inventories) assert.deepEqual(row.cleanupRemovedEntries, []);
assert.equal(receipt.screenshots.length, 6);
for (const screenshot of receipt.screenshots) { const bytes = await read(screenshot.path); assert.equal(sha(bytes), screenshot.sha256); assert.equal(bytes.length, screenshot.bytes); }
for (const field of ["conversionSpeedAcceptance", "completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "publicAcceptance", "headedManualValidation"]) assert.equal(receipt[field], false);
const proofPath = receiptPath.replace(/\.json$/, "-validation.json");
const proof = { recordedAt: new Date().toISOString(), status: "independently-verified-matched-headless-ui-and-five-goldens",
  executionReceipt: { path: receiptPath, bytes: receiptBytes.length, sha256: sha(receiptBytes) },
  verifier: { path: "scripts/freeze-stable-ui-headless-baseline.mjs", sha256: sha(await read("scripts/freeze-stable-ui-headless-baseline.mjs")) },
  geometryMaximumDeltaCssPixels: compared.maximumDeltaCssPixels, matchedUiStates: 6, actualBaselineBindings: 5,
  goldenConversions: 3, fullDecodes: 3, identicalDecodedAudioComparisons: 3, artworkChecks: 3, timelineChecks: 3,
  recoveryChecks: 2, emptyCleanupInventories: 5, unchangedSourcePins: 18, rawLosslesslyCompacted: true, bytesSaved: receipt.bytesSaved,
  visualReview: { allSixHeadlessScreenshotsInspected: true, metricsAndControlsReadable: true, errorAndCancelVisible: true,
    noNewOverlapObserved: true, caveat: "Same scroll-clipped heading edges; private public remux/MPEG4/10GiB labels remain unsuitable for publication", headedManualValidation: false },
  completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false, conversionSpeedAcceptance: false, publicAcceptance: false };
await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, status: proof.status, geometryDelta: 0, bytesSaved: receipt.bytesSaved }));
