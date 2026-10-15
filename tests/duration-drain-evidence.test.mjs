import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { verifyDurationEquivalenceReports } from "../scripts/lib/duration-drain-equivalence.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const qualificationPath = "evidence/2026-10-15T10-41-15-440Z-duration-drain-independent-qualification.json";
async function unpack(record, maximum) {
  const zip = await read(record.path); assert.equal(sha(zip), record.sha256); assert.equal(zip.length, record.bytes);
  const raw = gunzipSync(zip, { maxOutputLength: maximum }); assert.equal(sha(raw), record.restoredSha256); return JSON.parse(raw);
}
test("actual126-source Wasm duration candidate passes independent arithmetic without changing encoder, heaps or other typed bodies", async () => {
  const native = JSON.parse(await read("evidence/duration-drain-native-38678806473.json"));
  const build = JSON.parse(await read(native.proof.path));
  assert.equal(sha(await read(native.proof.path)), native.proof.sha256);
  assert.equal(build.run.headSha, "d3d3fe2e1ced7e4a2a079109a47b8b56a60b77af"); assert.equal(build.run.conclusion, "success");
  assert.equal(native.sourceCount, 126); assert.deepEqual(native.sourcePins, build.manifest.sources);
  assert.deepEqual(native.currentSourcePins, native.postSourcePins);
  const old = JSON.parse(await read("evidence/packet-drain-native-38673138419.json"));
  for (const file of Object.keys(old.sourcePins)) assert.ok(file in native.sourcePins, file);
  const archived = await unpack(native.archive, 2097152);
  for (const [file, hash] of Object.entries(native.sourcePins)) {
    assert.equal(sha(Buffer.from(archived.sourcePreimages[file].data, "base64")), hash);
    assert.equal(sha(await read(file)), native.currentSourcePins[file]);
  }
  const duration = native.actualDurationBoundary.actualWasmUnit;
  assert.equal(duration.iterations, 126000); assert.equal(duration.sequences, 21); assert.equal(duration.invalidCases, 15);
  assert.equal(duration.independentIntegerOracle, true); assert.deepEqual(duration.lastTwoDurations, [666, 667]);
  assert.equal(duration.regressionTotalTicks, 64000); assert.equal(duration.sourceOffsetLastDts, 64661);
  assert.equal(duration.packetBytesUnchanged, true); assert.equal(duration.ptsDtsUnchanged, true); assert.equal(duration.allocationsAdded, 0);
  assert.deepEqual(native.decoder.memories, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.equal(build.manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.deepEqual(native.functions.filter(row => row.bodySha256 !== old.functions.find(previous => previous.name === row.name).bodySha256).map(row => row.name), ["mpeg2_packets"]);
  assert.equal(native.publicAcceptance, false); assert.equal(native.runtimeBrowserHookQualified, false);
});
test("corrected production output is packet/pixel/metadata exact while the unchanged prior candidate still fails", async () => {
  const proof = JSON.parse(await read(qualificationPath));
  const rejection = JSON.parse(await read("evidence/packet-drain-media-timing-rejection-2026-10-15.json"));
  assert.equal(proof.baseline.sha256, rejection.runs.find(run => run.variant === "baseline").mediaSha256);
  const media = JSON.parse(await read(proof.media.path)), baseline = JSON.parse(await read(proof.baseline.path));
  const report = await unpack(media.report.archive, 2097152), oldReport = await unpack(baseline.report.archive, 2097152);
  assert.deepEqual(verifyDurationEquivalenceReports(oldReport, report), proof.equivalence);
  assert.equal(proof.smallFixtureFidelityQualified, true); assert.equal(proof.equivalence.historicalContainerByteIdentity, false);
  for (const comparison of proof.equivalence.comparisons) {
    assert.equal(comparison.exactlyEquivalentApartFromFilePositions, true); assert.equal(comparison.packetTimingPreservationPassed, true);
    assert.deepEqual(comparison.packetFieldChangesExceptFilePositions, []);
  }
  const rejected = JSON.parse(await read("evidence/2026-10-15T03-31-11-318Z-packet-order-candidate-media.json"));
  // The negative control is the genuine previously rejected browser output,
  // not a simulated timestamp model.
  const rejectedReport = await unpack(rejected.report.archive, 2097152);
  assert.throws(() => verifyDurationEquivalenceReports(oldReport, rejectedReport));
  const badTiming = structuredClone(report);
  badTiming.rows.find(row => row.kind === "independent-packet-order-proof").packets[0].dts++;
  assert.throws(() => verifyDurationEquivalenceReports(oldReport, badTiming));
  const badMetadata = structuredClone(report);
  badMetadata.rows.find(row => row.kind === "independent-pre-assertion-probes").outputProbe.streams[0].duration_ts++;
  assert.throws(() => verifyDurationEquivalenceReports(oldReport, badMetadata));
  const badPayload = structuredClone(report);
  badPayload.rows.find(row => row.kind === "independent-packet-order-proof").packets[0].data_hash = "SHA256:" + "0".repeat(64);
  assert.throws(() => verifyDurationEquivalenceReports(oldReport, badPayload));
});
test("source338/control168 seals, cleanup and lossless raw compaction are independently preserved", async () => {
  const proof = JSON.parse(await read(qualificationPath));
  assert.deepEqual(proof.sourceCounts, { native: 126, browserControl: 44, totalControl: 168, mediaLegacy: 255, mediaSupplemental: 83, totalMedia: 338 });
  const media = JSON.parse(await read(proof.media.path)), extra = JSON.parse(await read(proof.supplemental.path));
  const legacy = await unpack(media.generatedArchive, 8388608), supplemental = await unpack(extra.archive, 2097152);
  for (const [receipt, archive, base64] of [[media, legacy, false], [extra, supplemental, true]]) {
    assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
    for (const [file, hash] of Object.entries(receipt.sourcePins)) {
      assert.equal(sha(base64 ? Buffer.from(archive.preimages[file], "base64") : archive.sources[file]), hash);
      assert.equal(sha(await read(file)), hash, file);
    }
  }
  assert.equal(proof.birthChecks.length, 14); assert.ok(proof.birthChecks.every(row => row.ownedBirthAbsent));
  assert.equal(proof.sampledPidChecks.length, 24); assert.ok(proof.sampledPidChecks.every(row => row.birthWasNotRecordedInConversionSample && row.sampledProcessGone));
  assert.equal(proof.removedRedundantRawJson.bytes, 1896656);
  await assert.rejects(access(path.join(root, proof.removedRedundantRawJson.path)), { code: "ENOENT" });
  assert.equal(sha(gunzipSync(await read(proof.removedRedundantRawJson.retainedLosslessArchive.path))), proof.removedRedundantRawJson.sha256);
  assert.equal(proof.remainingHostedArtifacts, 0); assert.equal(proof.allTwentyLocalToolsVerifiedAndRetained, true);
  assert.equal(proof.localToolBytes, 9744357); assert.equal(proof.independentRuntimeRemoved, true);
  for (const [file, source] of Object.entries(proof.ownSources)) {
    assert.equal(sha(await read(file)), source.sha256); assert.equal(sha(Buffer.from(source.preimage, "base64")), source.sha256);
  }
  assert.equal(proof.fullOriginalAcceptance, false); assert.equal(proof.primaryIncrementalPrivateMiB, null);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.speedGainProven, false); assert.equal(proof.publicAcceptance, false);
});
