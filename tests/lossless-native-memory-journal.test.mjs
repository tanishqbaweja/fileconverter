import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { createLosslessNativeMemoryJournal, replayLosslessNativeMemoryJournal, compactLosslessNativeMemoryJournal } from "../scripts/lib/lossless-native-memory-journal.mjs";
const row = sequence => ({ sequence, timestamp: new Date(1700000000000 + sequence * 100).toISOString(), completedAt: new Date(1700000000001 + sequence * 100).toISOString(),
  nativeElapsedMs: 1, sampleError: null, phase: "conversion-synthetic", privateBytes: sequence === 2 ? 900 : 100, rssBytes: 1000,
  processes: [{ pid: 1, parentPid: 10, createdAt: "2023-01-01T00:00:00Z", creationFileTime: "133444444444444444", executableName: "synthetic.exe", privateBytes: sequence === 2 ? 900 : 100, rssBytes: 1000 }] });
const batch = rows => ({ overflow: false, observerCpuMs: 10, samples: rows });
test("7001 real journal records preserve every sample and early peak beyond the old6000 cap with bounded streamed gzip/readback", { timeout: 30000 }, async () => {
  const runtime = await createOwnedRuntimeScratch("journal-unit-"); let journal;
  try {
    journal = await createLosslessNativeMemoryJournal(1, path.join(runtime.directory, "samples.ndjson"));
    for (let first = 1; first <= 7001; first += 200) {
      const samples = Array.from({ length: Math.min(200, 7002 - first) }, (_, offset) => row(first + offset));
      if (first === 7001) Object.assign(samples[0], { sampleError: "unavailable", privateBytes: null, rssBytes: null, processes: null });
      await journal.appendBatch(batch(samples));
    }
    const receipt = await journal.close(); assert.equal(receipt.records, 7001); assert.equal(receipt.summary.native.sequence, 7001);
    assert.equal(receipt.summary.native.phases[0].peak[0], 2); assert.equal(receipt.summary.native.phases[0].peak[3], 900);
    assert.equal(receipt.summary.native.phases[0].unavailableSamples, 1); assert.equal(receipt.summary.native.phases[0].last[3], null);
    const replay = await replayLosslessNativeMemoryJournal(receipt); assert.equal(replay.verified, true); assert.ok(replay.maximumReadBytes <= 65536);
    const archive = await compactLosslessNativeMemoryJournal(receipt); assert.equal(archive.rawRemoved, true); assert.equal(archive.readbackVerified, true);
    await assert.rejects(lstat(receipt.file), { code: "ENOENT" }); assert.ok(archive.archiveBytes < archive.bytes);
    assert.equal((await replayLosslessNativeMemoryJournal(archive)).records, 7001); assert.equal(archive.conversionAcceptance, false);
  } finally { await journal?.close().catch(() => {}); await runtime.close(); }
});
test("raw journal never coalesces/drops concurrent appends and disk failure remains fatal", async () => {
  const runtime = await createOwnedRuntimeScratch("journal-unit-"); let journal, failed;
  try {
    let release; const blocked = new Promise(resolve => { release = resolve; });
    journal = await createLosslessNativeMemoryJournal(1, path.join(runtime.directory, "one.ndjson"), { writeOverride: async (_bytes, write) => { await blocked; await write(); } });
    const pending = journal.appendBatch(batch([row(1)])); assert.throws(() => journal.appendBatch(batch([row(2)])), /one journal append/);
    release(); await pending; const receipt = await journal.close(); assert.equal(receipt.records, 1);
    failed = await createLosslessNativeMemoryJournal(1, path.join(runtime.directory, "failed.ndjson"), { writeOverride: async () => { throw new Error("synthetic disk full"); } });
    await assert.rejects(failed.appendBatch(batch([row(1)])), /disk full/); assert.throws(() => failed.healthy(), /disk full/); await assert.rejects(failed.close(), /disk full/);
    const incomplete = await failed.failedReceipt(); assert.equal(incomplete.complete, false); assert.equal(incomplete.bytes, 0);
    const retained = await compactLosslessNativeMemoryJournal(incomplete); assert.equal(retained.rawRemoved, true); assert.equal(retained.complete, false);
    await assert.rejects(replayLosslessNativeMemoryJournal(retained), /Incomplete journal/);
  } finally { await Promise.allSettled([journal?.close(), failed?.close()]); await runtime.close(); }
});
test("sequence loss, native overflow and source-root identity changes cannot produce healthy acceptance", async () => {
  const runtime = await createOwnedRuntimeScratch("journal-unit-");
  try {
    for (const [index, mutate] of [sample => { sample.sequence = 2; }, sample => { sample.processes[0].creationFileTime = "133444444444444445"; }].entries()) {
      const journal = await createLosslessNativeMemoryJournal(1, path.join(runtime.directory, `bad${index}.ndjson`));
      try {
        if (index === 1) await journal.appendBatch(batch([row(1)]));
        const sample = row(index === 1 ? 2 : 1); mutate(sample); await assert.rejects(journal.appendBatch(batch([sample])));
        await assert.rejects(journal.close());
      } finally { await journal.close().catch(() => {}); }
    }
    const journal = await createLosslessNativeMemoryJournal(1, path.join(runtime.directory, "overflow.ndjson"));
    try { await assert.rejects(journal.appendBatch({ ...batch([row(1)]), overflow: true })); await assert.rejects(journal.close()); }
    finally { await journal.close().catch(() => {}); }
  } finally { await runtime.close(); }
});
test("corruption and truncated records fail streamed replay; rejected compaction retains raw evidence", async () => {
  const runtime = await createOwnedRuntimeScratch("journal-unit-"); let journal;
  try {
    journal = await createLosslessNativeMemoryJournal(1, path.join(runtime.directory, "proof.ndjson"));
    await journal.appendBatch(batch([row(1)])); const receipt = await journal.close();
    const bytes = await readFile(receipt.file), truncated = bytes.subarray(0, bytes.length - 1); await writeFile(receipt.file, truncated);
    const malformed = { ...receipt, bytes: truncated.length, sha256: createHash("sha256").update(truncated).digest("hex") };
    await assert.rejects(replayLosslessNativeMemoryJournal(malformed), /Truncated/);
    await assert.rejects(compactLosslessNativeMemoryJournal(receipt)); assert.ok((await lstat(receipt.file)).isFile());
  } finally { await journal?.close().catch(() => {}); await runtime.close(); }
});
test("journals reject external/protected-file paths, reuse, oversized metadata and skipped writes", async () => {
  await assert.rejects(createLosslessNativeMemoryJournal(1, path.resolve("test.mkv")));
  const runtime = await createOwnedRuntimeScratch("journal-unit-"); let journal;
  try {
    journal = await createLosslessNativeMemoryJournal(1, path.join(runtime.directory, "same.ndjson"));
    await assert.rejects(createLosslessNativeMemoryJournal(1, journal.file));
    const sample = row(1); sample.extra = "x".repeat(300000); await assert.rejects(journal.appendBatch(batch([sample]))); await assert.rejects(journal.close());
    const skipped = await createLosslessNativeMemoryJournal(1, path.join(runtime.directory, "skipped.ndjson"), { writeOverride: async () => {} });
    await skipped.appendBatch(batch([row(1)])); await assert.rejects(skipped.close(), /not fully written/);
  } finally { await journal?.close().catch(() => {}); await runtime.close(); }
});

test("scale harness takes its peak from full journal, never the3000sample diagnostic tail", async () => {
  const source = await readFile(new URL("../tests/browser/vpx-decoder-qualification.spec.ts", import.meta.url), "utf8");
  assert.match(source, /nativeJournal\.appendBatch\(/);
  assert.match(source, /nativeJournal\?\.peaksExcept\(\["blank"\]\)/);
  assert.match(source, /journalPeaks \? journalPeaks\.peak!\.privateBytes/);
  assert.match(source, /samples\.length > 3000/);
  assert.match(source, /native-journal-retention/);
  assert.match(source, /compactLosslessNativeMemoryJournal\(await nativeJournal\.failedReceipt\(\)\)/);
  assert.match(source, /Journal must cover through the actual final conversion/);
  assert.match(source, /const incrementalPrivateMiB = \(peak - blankBaseline!\.privateBytes\) \/ 1048576/);
});
