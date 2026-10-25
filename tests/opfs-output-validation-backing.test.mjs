import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { encodeBoundedValidationChunk } from "../scripts/lib/bounded-validation-chunk.mjs";
import { bindOpfsOutputValidationBacking, assertOpfsOutputValidationBackingUnchanged } from "../scripts/lib/opfs-output-validation-backing.mjs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

async function fixture(run) {
  const runtime = await createOwnedRuntimeScratch("opfs-validation-backing-unit-");
  try {
    const profile = path.join(runtime.directory, "profile"), storage = path.join(profile, "Default", "File System", "000", "t", "00");
    await mkdir(storage, { recursive: true }); const bytes = Buffer.alloc(131072);
    for (let index = 0; index < bytes.length; index++) bytes[index] = (index * 79 + (index >> 7)) & 255;
    const file = path.join(storage, "00000002"); await writeFile(file, bytes, { flag: "wx" });
    // Synthetic unit adapter only; not real OPFS or conversion acceptance.
    const page = { async evaluate(callback, args) {
      assert.equal(args.name, "within-test-unit-binding"); assert.equal(args.sampleBytes, 4096);
      return { bytes: bytes.length, samples: args.ranges.map(offset => ({ offset, encoded: encodeBoundedValidationChunk(bytes.subarray(offset, offset + args.sampleBytes)) })) };
    } };
    await run({ profile, storage, file, bytes, page });
  } finally { await runtime.close(); }
}

test("synthetic binding unit proves unique size/range match and unchanged identity without making a converted copy", async () => {
  await fixture(async ({ profile, file, bytes, page }) => {
    const result = await bindOpfsOutputValidationBacking(page, profile, "within-test-unit-binding", bytes.length);
    assert.equal(result.file, file); assert.equal(result.proof.convertedCopyCreated, false); assert.equal(result.proof.nativeConversionUsed, false);
    assert.equal(result.proof.totalBrowserSampleBytes, 12288); assert.equal(result.proof.maximumHostProbeBufferBytes, 4096);
    assert.equal(result.proof.fullContentAndFidelityValidationStillRequired, true);
    await assertOpfsOutputValidationBackingUnchanged(result);
    await writeFile(file, Buffer.alloc(bytes.length + 1)); await assert.rejects(assertOpfsOutputValidationBackingUnchanged(result));
  });
});

test("ambiguous physical files, changed sampled bytes, invalid logical names and oversized validation scopes fail rather than guess", async () => {
  await fixture(async ({ profile, storage, bytes, page }) => {
    await writeFile(path.join(storage, "00000003"), bytes, { flag: "wx" });
    await assert.rejects(bindOpfsOutputValidationBacking(page, profile, "within-test-unit-binding", bytes.length), /unique/);
    await assert.rejects(bindOpfsOutputValidationBacking(page, profile, "..\\escape", bytes.length));
    await assert.rejects(bindOpfsOutputValidationBacking(page, profile, "within-test-unit-binding", 8 * 1048576 + 1));
  });
  await fixture(async ({ profile, file, bytes, page }) => {
    const changed = Buffer.from(bytes); changed[0] ^= 1; await writeFile(file, changed);
    await assert.rejects(bindOpfsOutputValidationBacking(page, profile, "within-test-unit-binding", bytes.length), /unique/);
  });
});

test("physical mode is read-only validation after the same real production engine, and retains all full output/image/PCM and whole-tree gates", async () => {
  const helper = await readFile("scripts/lib/opfs-output-validation-backing.mjs", "utf8");
  assert.match(helper, /entries.length !== 1/); assert.match(helper, /matches.length, 1/);
  assert.match(helper, /maximumBrowserSampleBytes/); assert.match(helper, /const reader = await open\(file, "r"\)/);
  assert.doesNotMatch(helper, /copyFile|writeFile|avcodec|ffmpeg|fetch\(/);
  const runtime = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(runtime, /--artwork-benchmark-physical-validation/);
  assert.match(runtime, /physicalBinding = await bindOpfsOutputValidationBacking/);
  assert.match(runtime, /assertOpfsOutputValidationBackingUnchanged\(physicalBinding\)/);
  assert.match(runtime, /Every benchmark job must match the complete accepted output control/);
  assert.match(runtime, /compareNativeAudioPcm\(input, output/); assert.match(runtime, /journal.peaksExcept\(\["blank"\]\)/);
});

test("retained diagnostic7job pass proves validation exports retain one output worth of backing storage until natural GC, not repeatable memory/speed acceptance", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-25T09-17-12.730Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion"); assert.equal(receipt.publicAcceptance, false);
  assert.equal(receipt.memory.incrementalPrivateMiB, 240.81640625); assert.equal(receipt.memory.validSamples, 556);
  assert.equal(receipt.memory.unavailableSamples, 0); assert.equal(receipt.cases.length, 7);
  const archive = await readFile(receipt.archive.path); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw);
  for (const row of report.cases.slice(1, 5)) {
    const diagnostics = row.validationDiagnostics;
    assert.equal(diagnostics.afterExport.pageRealmHeap.backingStorageSize - diagnostics.terminal.pageRealmHeap.backingStorageSize, row.output.bytes);
    assert.equal(diagnostics.afterCleanup.noForcedGcOrArtificialCooldown, true);
    assert.equal(row.output.sha256, "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3");
  }
  const natural = report.cases[5].validationDiagnostics;
  assert.ok(natural.afterExport.pageRealmHeap.backingStorageSize < natural.terminal.pageRealmHeap.backingStorageSize);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const decoded = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(decoded), receipt.losslessJournal.sha256);
  const samples = decoded.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 556);
  const peak = Math.max(...samples.filter(row => row.phase !== "blank" && row.privateBytes !== null).map(row => row.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true);
});

test("actual physical-backed seven-job proof retains every full validator without converted copies and records its unavailable OS sample honestly", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-25T09-24-27.551Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion"); assert.equal(receipt.publicAcceptance, false);
  assert.equal(receipt.memory.incrementalPrivateMiB, 204.98828125); assert.equal(receipt.memory.validSamples, 510);
  assert.equal(receipt.memory.unavailableSamples, 1); assert.equal(receipt.sourcePins, 35);
  assert.equal(receipt.benchmark.validationBackend, "unique-byte-bound-physical-OPFS-no-output-copy");
  const archive = await readFile(receipt.archive.path); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw); assert.equal(report.cases.length, 7);
  const backingFiles = new Set();
  for (const row of report.cases) {
    assert.equal(row.status, "passed-small-private-fidelity-and-metadata-case"); assert.equal(row.disposableOutputRemoved, true);
    const proof = row.physicalValidation; assert.equal(proof.uniqueLogicalEntry, true); assert.equal(proof.uniquePhysicalMatch, true);
    assert.equal(proof.convertedCopyCreated, false); assert.equal(proof.nativeConversionUsed, false);
    assert.equal(proof.maximumBrowserSampleBytes, 4096); assert.equal(proof.totalBrowserSampleBytes, 12288);
    assert.equal(proof.maximumHostProbeBufferBytes, 4096); assert.equal(proof.sizeCandidates, 1); assert.equal(proof.samples.length, 3);
    assert.equal(proof.logicalBytes, 5633796); assert.equal(proof.physicalIdentity.size, "5633796"); backingFiles.add(proof.physicalFile);
    assert.equal(row.output.sha256, "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3");
    assert.equal(row.artwork.bytes, 4194304); assert.equal(row.artwork.decodedRgbaSha256, "4355f9c1980ad3aaf1f077d06e2b06e4d2c70f3d22143d6ed8e210203c7495ba");
    assert.equal(row.output.tags.fields.filter(field => field.status === "preserved").length, 25);
    assert.deepEqual(row.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
    assert.equal(row.fidelity.samples, 96000); assert.ok(row.fidelity.psnrDb >= 60); assert.equal(row.fullIndependentDecode, true);
    if (!row.benchmarkWarmup) assert.equal(row.validationDiagnostics.afterExport.pageRealmHeap.backingStorageSize
      - row.validationDiagnostics.terminal.pageRealmHeap.backingStorageSize, 12365);
  }
  assert.equal(backingFiles.size, 7);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const decoded = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(decoded), receipt.losslessJournal.sha256);
  const samples = decoded.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 511);
  const valid = samples.filter(sample => sample.sampleError === null); assert.equal(valid.length, 510);
  assert.ok(samples.filter(sample => sample.sampleError !== null).every(sample => sample.privateBytes === null && sample.rssBytes === null && sample.processes === null));
  const peak = Math.max(...valid.filter(sample => sample.phase !== "blank").map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(report.processCleanup.length, 15); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  for (const screenshot of report.screenshots) assert.equal(sha(await readFile(screenshot.path)), screenshot.sha256);
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true);
});
