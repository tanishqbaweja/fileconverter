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
