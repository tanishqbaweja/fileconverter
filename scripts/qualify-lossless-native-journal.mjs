// Actual Windows observer -> lossless disk journal -> independent streamed
// replay. Observe this owned Node tree only; no browser, media or acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { finishOwnedCleanupPhases } from "./lib/phased-owned-cleanup.mjs";
import { startChromiumMemoryMonitor } from "./lib/persistent-chromium-memory.mjs";
import { createLosslessNativeMemoryJournal, compactLosslessNativeMemoryJournal, replayLosslessNativeMemoryJournal } from "./lib/lossless-native-memory-journal.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(":", "-");
const file = path.join(root, `output/playwright/lossless-native-journal-${stamp}.ndjson`);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sources = ["scripts/qualify-lossless-native-journal.mjs", "scripts/lib/lossless-native-memory-journal.mjs",
  "scripts/lib/native-memory-peaks.mjs", "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/windows-tree-monitor.cs",
  "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/phased-owned-cleanup.mjs"];
assert.equal(process.platform, "win32"); await mkdir(path.dirname(file), { recursive: true });
const sourcePins = Object.fromEntries(await Promise.all(sources.map(async source => [source, sha(await readFile(path.join(root, source)))])));
const runtime = await createOwnedRuntimeScratch("journal-native-");
let monitor, journal, receipt, failure; const cleanupPhases = [];
try {
  monitor = await startChromiumMemoryMonitor(process.pid, runtime.directory, 100);
  journal = await createLosslessNativeMemoryJournal(process.pid, file);
  for (let attempt = 0; attempt < 12; attempt++) {
    await pause(250); const batch = await monitor.drain();
    await journal.appendBatch({ ...batch, samples: batch.samples.map(sample => ({ ...sample, phase: "native-journal-probe" })) });
  }
  await monitor.close(); monitor = undefined;
  receipt = await journal.close(); assert.ok(receipt.records >= 20);
  assert.equal((await replayLosslessNativeMemoryJournal(receipt)).verified, true);
  receipt = await compactLosslessNativeMemoryJournal(receipt);
  const replay = await replayLosslessNativeMemoryJournal(receipt); assert.equal(replay.verified, true);
  assert.ok(receipt.summary.native.phases[0].validSamples > 0);
} catch (error) { failure = error; process.exitCode = 1; }
finally {
  try {
    await finishOwnedCleanupPhases([
      { name: "observers", actions: [async () => { await monitor?.close(); }] },
      { name: "journal-retention", actions: [async () => {
        if (receipt?.rawRemoved) return;
        if (journal) {
          let complete; try { complete = await journal.close(); } catch { complete = await journal.failedReceipt(); }
          receipt = await compactLosslessNativeMemoryJournal(complete);
        }
      }] },
      { name: "source-verification", actions: [async () => {
        for (const [source, digest] of Object.entries(sourcePins)) assert.equal(sha(await readFile(path.join(root, source))), digest, source);
      }] },
      { name: "disposable-files", actions: [() => runtime.close()] },
    ], cleanupPhases);
  } catch (error) { failure ??= error; process.exitCode = 1; }
  const report = { status: failure ? "failed-native-journal-check" : "passed-native-journal-check",
    scope: "Actual Windows owned Node-tree observation only, not Chromium conversion/memory/scaling qualification", rootPid: process.pid,
    sourcePins, receipt, cleanupPhases, runtime: runtime.directory, failure: failure ? String(failure) : null,
    publicAcceptance: false, conversionAcceptance: false, generatedMediaBytes: 0, originalReadOrModified: false };
  const reportPath = file.replace(/\.ndjson$/, ".json"); await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: path.relative(root, reportPath), status: report.status, records: receipt?.records,
    archiveBytes: receipt?.archiveBytes, originalBytes: receipt?.bytes, rawRemoved: receipt?.rawRemoved, cleanupPhases, failure: report.failure }));
}
