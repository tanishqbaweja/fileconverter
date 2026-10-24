import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
const root = new URL("../", import.meta.url), sha = b => createHash("sha256").update(b).digest("hex");
const receiptPath = "evidence/2026-10-24T13-50-10.413Z-audio-metadata-fidelity-result.json";
const receiptBytes = await readFile(new URL(receiptPath, root)), receipt = JSON.parse(receiptBytes);
test("retained seven-case browser gate remains failed despite small-lifecycle memory pass and complete cleanup", async () => {
  assert.equal(receipt.status, "failed"); assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false);
  assert.equal(receipt.cases.length, 7); assert.equal(receipt.memory.incrementalPrivateMiB, 209.54296875);
  assert.equal(receipt.memory.validSamples, 667); assert.equal(receipt.memory.unavailableSamples, 0);
  assert.equal(receipt.diskProof.provesThisContextOpfsBacking, true); assert.equal(receipt.protectedOriginalUnchanged, true);
  assert.deepEqual(Object.values(receipt.cleanup), [true, true, true, true]);
  for (const row of receipt.cases) { assert.equal(row.tagsPreserved, 25); assert.equal(row.fidelity.samples, 96000); assert.equal(row.disposableOutputRemoved, true); }
  const bytes = await readFile(new URL(receipt.archive.path, root)); assert.equal(sha(bytes), receipt.archive.sha256);
  const raw = gunzipSync(bytes, { maxOutputLength: 1024 * 1024 });
  assert.equal(raw.length, receipt.archive.restoredBytes); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const journal = await readFile(new URL(receipt.losslessJournal.file, root)); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1024 * 1024 })), receipt.losslessJournal.sha256);
});
test("retained quality and raw repeated-field failures cannot disappear behind aggregate tag counts", () => {
  const quality = receipt.cases.find(c => c.name === "opus-to-ogg");
  assert.equal(quality.status, "failed"); assert.equal(quality.fidelity.minimumPsnrDb, 60); assert.ok(quality.fidelity.psnrDb < 60);
  const duplicate = receipt.cases.find(c => c.name === "flac-to-ogg-repeated-values");
  assert.equal(duplicate.status, "failed"); assert.deepEqual(duplicate.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽;Deuxième café"]);
});
test("source-pinned native reference probe matches both retained browser FLAC PCM hashes without relaxing equality", async () => {
  const reference = JSON.parse(await readFile(new URL("evidence/2026-10-24T14-06-23.031Z-audio-pcm-reference.json", root)));
  assert.equal(reference.receipt, receiptPath); assert.equal(reference.receiptSha256, sha(receiptBytes));
  assert.equal(reference.browserFlagsChanged, false); assert.equal(reference.fullMetadataAcceptance, false); assert.equal(reference.ownedFixtureScratchRemoved, true);
  assert.equal(reference.cases.length, 2);
  for (const row of reference.cases) {
    const browser = receipt.cases.find(c => c.name === row.source + "-to-flac");
    assert.equal(row.retainedBrowserFlacPcmSha256, browser.fidelity.outputSha256);
    const normal = row.variants.find(v => v.name === "default"); assert.equal(normal.matchesRetainedBrowserPcm, false);
    assert.equal(normal.pcmSha256, browser.fidelity.sourceSha256);
    for (const name of ["scalar", "scalar-bitexact"]) {
      const scalar = row.variants.find(v => v.name === name); assert.equal(scalar.matchesRetainedBrowserPcm, true);
      assert.equal(scalar.pcmSha256, browser.fidelity.outputSha256); assert.deepEqual(scalar.decoderFlagsBeforeInput.slice(0, 2), ["-cpuflags", "0"]);
    }
  }
  for (const file of ["scripts/check-audio-pcm-reference.mjs", "scripts/lib/audio-metadata-fidelity-fixture.mjs"])
    assert.equal(sha(await readFile(new URL(file, root))), reference.sourcePins[file]);
  const source = await readFile(new URL("scripts/lib/streaming-audio-fidelity.mjs", root), "utf8");
  assert.match(source, /"-cpuflags", "0", "-i"/); assert.match(source, /lossless && !result.exact/);
});
test("changed real browser gate proves exact FLAC and existing higher-quality control, but parser-only duplicate fix remains failed", async () => {
  const next = JSON.parse(await readFile(new URL("evidence/2026-10-24T14-26-14.083Z-audio-metadata-fidelity-result.json", root)));
  assert.equal(next.status, "failed"); assert.equal(next.publicAcceptance, false); assert.equal(next.cases.length, 8);
  assert.equal(next.artifactManifestSha256, "5a27d717ece754e672bd410e6a2062bc43a19fae1eaa1132cffa7653ed0b9692");
  assert.equal(next.memory.incrementalPrivateMiB, 210.13671875); assert.equal(next.memory.validSamples, 493); assert.equal(next.memory.unavailableSamples, 0);
  assert.equal(next.protectedOriginalUnchanged, true); assert.ok(Object.values(next.cleanup).every(Boolean));
  for (const name of ["ogg-to-flac", "opus-to-flac"]) {
    const row = next.cases.find(c => c.name === name); assert.equal(row.status, "passed-small-private-fidelity-and-metadata-case");
    assert.equal(row.fidelity.exact, true); assert.equal(row.fidelity.referenceDecoderCpu, "scalar-no-SIMD");
  }
  const automatic = next.cases.find(c => c.name === "opus-to-ogg"), higher = next.cases.find(c => c.name === "opus-to-ogg-higher");
  assert.equal(automatic.status, "failed"); assert.ok(automatic.fidelity.psnrDb < 60);
  assert.equal(higher.status, "passed-small-private-fidelity-and-metadata-case"); assert.ok(higher.fidelity.psnrDb >= 60);
  assert.equal(automatic.fidelity.sourceSha256, higher.fidelity.sourceSha256); assert.equal(higher.requestedQuality, "higher");
  assert.deepEqual(next.cases.find(c => c.name === "flac-to-ogg-repeated-values").repeatedValues, ["CUSTOM_REPEAT=Deuxième café"]);
  const archive = await readFile(new URL(next.archive.path, root)); assert.equal(sha(archive), next.archive.sha256);
  assert.equal(sha(gunzipSync(archive, { maxOutputLength: 1048576 })), next.archive.restoredSha256);
  const journal = await readFile(new URL(next.losslessJournal.file, root)); assert.equal(sha(journal), next.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1048576 })), next.losslessJournal.sha256);
});
test("combined native parser/wrapper repair preserves both repeated values in the real browser without concealing unchanged automatic quality failure", async () => {
  const next = JSON.parse(await readFile(new URL("evidence/2026-10-24T14-59-06.074Z-audio-metadata-fidelity-result.json", root)));
  assert.equal(next.status, "failed"); assert.equal(next.publicAcceptance, false); assert.equal(next.cases.length, 8);
  assert.equal(next.cases.filter(c => c.status === "passed-small-private-fidelity-and-metadata-case").length, 7);
  assert.equal(next.artifactManifestSha256, "dadb5f342e41401c6b050079b743003250b9e1f35ade62b80d89e419071c2625");
  const repeated = next.cases.find(c => c.name === "flac-to-ogg-repeated-values");
  assert.equal(repeated.status, "passed-small-private-fidelity-and-metadata-case");
  assert.deepEqual(repeated.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
  assert.deepEqual(next.cases.filter(c => c.status === "failed").map(c => c.name), ["opus-to-ogg"]);
  assert.ok(next.cases.find(c => c.name === "opus-to-ogg").fidelity.psnrDb < 60);
  assert.equal(next.memory.incrementalPrivateMiB, 200.33203125); assert.equal(next.memory.validSamples, 438); assert.equal(next.memory.unavailableSamples, 1);
  assert.ok(next.protectedOriginalUnchanged); assert.ok(Object.values(next.cleanup).every(Boolean));
  for (const c of next.cases) { assert.equal(c.tagsPreserved, 25); assert.equal(c.fidelity.samples, 96000); assert.ok(c.disposableOutputRemoved); }
  const archive = await readFile(new URL(next.archive.path, root)); assert.equal(sha(archive), next.archive.sha256);
  assert.equal(sha(gunzipSync(archive, { maxOutputLength: 1048576 })), next.archive.restoredSha256);
  const journal = await readFile(new URL(next.losslessJournal.file, root)); assert.equal(sha(journal), next.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1048576 })), next.losslessJournal.sha256);
  const rows = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }).toString().trim().split("\n").map(JSON.parse);
  const missing = rows.filter(r => r.sample?.privateBytes === null);
  assert.equal(missing.length, 1); assert.equal(missing[0].sample.phase, "blank"); assert.match(missing[0].sample.sampleError, /OpenProcess/);
});
test("five new repeated-input routes retain both values but FLAC order failures and unchanged automatic quality remain explicit", async () => {
  const next = JSON.parse(await readFile(new URL("evidence/2026-10-24T15-05-16.297Z-audio-metadata-fidelity-result.json", root)));
  assert.equal(next.status, "failed"); assert.equal(next.publicAcceptance, false); assert.equal(next.cases.length, 5);
  assert.equal(next.memory.incrementalPrivateMiB, 198.9765625); assert.equal(next.memory.validSamples, 413); assert.equal(next.memory.unavailableSamples, 0);
  const ordered = ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"];
  for (const row of next.cases) {
    assert.equal(row.tagsPreserved, 25); assert.equal(row.fidelity.samples, 96000); assert.ok(row.disposableOutputRemoved);
    if (row.name.includes("to-flac")) {
      assert.equal(row.status, "failed"); assert.equal(row.fidelity.exact, true);
      assert.deepEqual(row.repeatedValues, ordered.toReversed()); assert.ok(row.failures.some(s => /reordered/.test(s)));
    } else { assert.deepEqual(row.repeatedValues, ordered); }
  }
  assert.deepEqual(next.cases.filter(c => c.status === "passed-small-private-fidelity-and-metadata-case").map(c => c.name),
    ["flac-to-opus-repeated-values", "ogg-to-opus-repeated-values"]);
  assert.ok(next.protectedOriginalUnchanged); assert.ok(Object.values(next.cleanup).every(Boolean));
  const archive = await readFile(new URL(next.archive.path, root)); assert.equal(sha(archive), next.archive.sha256);
  const unpacked = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(unpacked), next.archive.restoredSha256);
  const report = JSON.parse(unpacked);
  for (const fixture of Object.values(report.repeatedFixtures)) assert.equal(fixture.sourcePcmUnchanged.exact, true);
  const journal = await readFile(new URL(next.losslessJournal.file, root)); assert.equal(sha(journal), next.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1048576 })), next.losslessJournal.sha256);
});
test("actual native dictionary probe reproduces muxer ordering swap and bounded atomic repair, not browser repair acceptance", async () => {
  const report = JSON.parse(await readFile(new URL("outputs/reports/2026-10-24T15-13-05.779Z-audio-metadata-native.json", root)));
  assert.equal(report.status, "passed"); assert.equal(report.publicAcceptance, false); assert.equal(report.behavior.browserConversionVerified, false);
  for (const key of ["muxerEncoderSwapReproduced", "reservedTailPreservesUserValueOrder", "reservedTailAtomicAndBounded", "alreadyOrderedSkipsAllocation"])
    assert.equal(report.behavior[key], true);
  assert.equal(report.ownedCompilerOutputAndScratchRemoved, true);
  const file = "media/ffmpeg/audio-muxer-metadata-order.h"; assert.equal(sha(await readFile(new URL(file, root))), report.sources[file]);
});
