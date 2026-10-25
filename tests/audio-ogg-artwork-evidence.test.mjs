import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { AUDIO_OGG_ARTWORK_CASES } from "../scripts/lib/audio-artwork-validation.mjs";
const root = new URL("../", import.meta.url), sha = b => createHash("sha256").update(b).digest("hex");
test("eight real Ogg/Opus cover conversions retain exact image roles/descriptions and matched-control audio without promotion", async () => {
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-25T03-16-02.860Z-audio-metadata-fidelity-result.json", root)));
  const controls = JSON.parse(await readFile(new URL("evidence/2026-10-24T14-26-14.083Z-audio-metadata-fidelity-result.json", root)));
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion"); assert.equal(receipt.publicAcceptance, false);
  assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.cases.length, 8);
  assert.equal(receipt.artifactManifestSha256, "94da3c35e695c4a2b42a4a8cdd863910bbe09b2e9b46d8b66f674d075b3a658c");
  assert.equal(receipt.memory.incrementalPrivateMiB, 230.7890625); assert.equal(receipt.memory.validSamples, 455);
  assert.equal(receipt.memory.unavailableSamples, 0); assert.equal(receipt.losslessJournal.complete, true);
  const archive = await readFile(new URL(receipt.archive.path, root)); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  assert.equal(raw.length, receipt.archive.restoredBytes); const report = JSON.parse(raw);
  for (const field of ["artworkAcceptance", "scalingAcceptance", "headedCoverage", "nativeConversionUsed", "automaticVorbisQualityRepaired"])
    assert.equal(report[field], false);
  assert.equal(Object.keys(report.artifact.buildSourcePins).length, 56); assert.equal(Object.keys(report.artifact.artifactPins).length, 15);
  assert.equal(report.artifact.core.allowedSourceEdits, 10);
  assert.deepEqual(report.artifact.core.memoryLimits, [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }]);
  assert.equal(Object.keys(report.artworkFixtures).length, 6);
  for (const [index, row] of receipt.cases.entries()) {
    const route = AUDIO_OGG_ARTWORK_CASES[index], fixture = report.artworkFixtures[route.source + "-" + route.artwork];
    const name = `${route.source}-to-${route.destination}` + (route.quality ? "-" + route.quality : "");
    const control = controls.cases.find(c => c.name === name); assert.ok(control);
    assert.equal(row.status, "passed-small-private-fidelity-and-metadata-case"); assert.equal(row.tagsPreserved, 25);
    assert.equal(row.fidelity.samples, 96000); assert.equal(row.fidelity.minimumPsnrDb, 60); assert.ok(row.fidelity.psnrDb >= 60);
    assert.equal(row.fidelity.sourceSha256, control.fidelity.sourceSha256); assert.equal(row.fidelity.outputSha256, control.fidelity.outputSha256);
    assert.equal(row.requestedQuality, route.quality ?? "automatic");
    assert.deepEqual(row.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
    assert.deepEqual(row.artwork, fixture.artwork); assert.ok(row.artwork.independentImageDecode);
    assert.equal(row.artwork.pictureRole, route.artwork === "png" ? "Cover (front)" : "Cover (back)");
    assert.equal(row.artwork.description, route.artwork === "png" ? "表紙 — Front cover" : "Pochette arrière café — 音楽");
    assert.equal(fixture.sourcePcmUnchanged.exact, true); assert.equal(fixture.sourcePcmUnchanged.samples, 96000);
    assert.deepEqual(row.failures, []); assert.ok(row.disposableOutputRemoved);
    const metrics = report.cases[index].browserState.metrics;
    assert.equal(metrics.peakWasmMemoryBytes, 33554432); assert.ok(metrics.peakPendingOperations <= 1);
    assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
    for (const n of [metrics.maxReadChunkBytes, metrics.maxWriteChunkBytes, metrics.peakQueuedBytes]) assert.ok(n <= 262144);
  }
  // The known automatic Vorbis failure remains failed in its original receipt.
  assert.equal(controls.cases.find(c => c.name === "opus-to-ogg").status, "failed");
  assert.ok(receipt.protectedOriginalUnchanged); assert.ok(Object.values(receipt.cleanup).every(Boolean));
  assert.equal(receipt.diskProof.provesThisContextOpfsBacking, true); assert.deepEqual(receipt.network.forbidden, []);
  assert.deepEqual(receipt.failures, []); assert.ok(report.processCleanup.every(p => p.status === "owned-identity-absent"));
  const journal = await readFile(new URL(receipt.losslessJournal.file, root)); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const unpacked = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(unpacked), receipt.losslessJournal.sha256);
  const samples = unpacked.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 455);
  for (const [index, sample] of samples.entries()) {
    assert.equal(sample.sequence, index + 1); assert.equal(sample.sampleError, null);
    assert.equal(sample.privateBytes, sample.processes.reduce((total, p) => total + p.privateBytes, 0));
  }
  const peak = Math.max(...samples.filter(s => s.phase !== "blank").map(s => s.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  for (const screenshot of report.screenshots) assert.equal(sha(await readFile(new URL(screenshot.path, root))), screenshot.sha256);
});
