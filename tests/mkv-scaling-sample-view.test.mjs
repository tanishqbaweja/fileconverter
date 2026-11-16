import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createScalingSampleView } from "../scripts/lib/mkv-scaling-sample-view.mjs";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { createLosslessNativeMemoryJournal, compactLosslessNativeMemoryJournal, replayLosslessNativeMemoryJournal } from "../scripts/lib/lossless-native-memory-journal.mjs";
import { assertLargeScalingLosslessCoverage } from "../scripts/lib/mkv-large-scaling-report.mjs";

test("UNIT ONLY: every conversion/missing/baseline/cleanup point remains; only long-validation graph points thin, all raw rows have a separate lossless path", async () => {
  const view = createScalingSampleView(), rows = [];
  for (let n = 0; n < 40; n++) rows.push({ sequence: n + 1, timestamp: new Date(n * 100).toISOString(),
    privateBytes: n === 5 ? null : 400, processes: [{ pid: n + 1, creationFileTime: String(n + 100) }] });
  const duringConversion = t => t >= 400 && t <= 800;
  const selected = view.select({ samples: rows }, { validation: true, duringConversion });
  for (const row of rows.filter(r => duringConversion(Date.parse(r.timestamp)))) assert.ok(selected.includes(row));
  assert.ok(selected.includes(rows[5])); assert.equal(view.births().length, 40);
  const report = view.report(); assert.equal(report.totalNativeSamples, 40); assert.equal(report.allConversionSamplesRetained, true);
  assert.ok(report.validationGraphPointsThinned > 0);
  assert.equal(report.retainedViewSamples + report.validationGraphPointsThinned, 40);
  assert.deepEqual(view.select({ samples: rows }, { validation: false, duringConversion }), rows);
  const source = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  assert.ok(source.indexOf("await losslessJournal.appendBatch") < source.indexOf("scalingView.select(batch"));
  assert.match(source, /for \(const row of batch.samples\)/); // peak guard inspects FULL batch, not graph view
  assert.match(source, /startClassifiedChromiumMemoryMonitor\(chrome.pid, runtime.directory, 100\)/);
  assert.match(source, /compactLosslessNativeMemoryJournal\(receipt\)/);
  assert.match(source, /scalingView\.births\(\)\.map\(p => p.pid\)/);
});

test("UNIT ONLY: 21001 monitoring records cross old20000 cap losslessly, keep EVERY conversion point/early peak/missing record and all births", { timeout: 30000 }, async () => {
  const runtime = await createOwnedRuntimeScratch("mkv-scale-journal-unit-"); let journal;
  try {
    const view = createScalingSampleView(), retained = [], origin = 1700000000000;
    const duringConversion = time => time >= origin + 10100 && time <= origin + 60000;
    journal = await createLosslessNativeMemoryJournal(1, path.join(runtime.directory, "long-unit.ndjson"));
    for (let first = 1; first <= 21001; first += 200) {
      const samples = Array.from({ length: Math.min(200, 21002 - first) }, (_, offset) => {
        const n = first + offset, phase = n < 101 ? "baseline" : n <= 600 ? "conversion" : n <= 20800 ? "independent-validation" : "cleanup";
        const privateBytes = n === 155 ? 999 : 100;
        return { sequence: n, timestamp: new Date(origin + n * 100).toISOString(), completedAt: new Date(origin + n * 100 + 1).toISOString(),
          phase, nativeElapsedMs: 1, sampleError: n === 220 || n === 20000 ? "unit-unavailable" : null,
          privateBytes: n === 220 || n === 20000 ? null : privateBytes, rssBytes: n === 220 || n === 20000 ? null : 1000,
          processes: n === 220 || n === 20000 ? null : [{ pid: 1, parentPid: 10, createdAt: "2023-01-01T00:00:00Z",
            creationFileTime: "133444444444444444", executableName: "synthetic.exe", privateBytes, rssBytes: 1000 }] };
      });
      const batch = { overflow: false, observerCpuMs: first, samples };
      await journal.appendBatch(batch);
      // Select by bounded groups with the same validation phase used by the
      // harness; no native record ever disappears from the journal.
      for (const sample of samples) retained.push(...view.select({ samples: [sample] }, { validation: sample.phase === "independent-validation", duringConversion }));
    }
    const raw = await journal.close(), archive = await compactLosslessNativeMemoryJournal(raw);
    const replay = await replayLosslessNativeMemoryJournal(archive);
    assert.equal(replay.records, 21001); assert.equal(archive.rawRemoved, true); assert.equal(archive.readbackVerified, true);
    const conversion = replay.summary.native.phases.find(p => p.phase === "conversion");
    assert.equal(conversion.validSamples, 499); assert.equal(conversion.unavailableSamples, 1); assert.equal(conversion.peak[0], 155);
    assert.equal(retained.filter(r => r.phase === "conversion").length, 500);
    assert.ok(retained.some(r => r.sequence === 220 && r.privateBytes === null));
    assert.ok(retained.length < 5000); assert.equal(view.report().totalNativeSamples, 21001);
    assert.equal(view.report().retainedViewSamples, retained.length); assert.equal(view.births().length, 1);
    assert.equal(archive.conversionAcceptance, false);
    const diagnostic = { arms: [{ blank: { privateBytes: 100 }, memory: { peak: { sequence: 155 },
      incrementalPrivateMiB: (999 - 100) / 1048576, validSamples: 499, unavailableSamples: 1 },
      losslessNativeArchive: { ...archive, sampleView: view.report() } }] };
    assert.equal(assertLargeScalingLosslessCoverage(diagnostic).completeNativeRecords, 21001);
    for (const mutate of [r => { r.arms[0].memory.incrementalPrivateMiB--; }, r => { r.arms[0].memory.validSamples--; },
      r => { r.arms[0].losslessNativeArchive.sampleView.allConversionSamplesRetained = false; }]) {
      const changed = structuredClone(diagnostic); mutate(changed); assert.throws(() => assertLargeScalingLosslessCoverage(changed));
    }
  } finally { await journal?.close().catch(() => {}); await runtime.close(); }
});
