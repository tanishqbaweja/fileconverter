// Read-only exact terminal evidence analysis, no browser/native converter/retry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const terminalPath = "evidence/2026-10-10T08-12-27-536Z-aiff-id3-sync-opfs-stress.json";
const terminalBytes = await readFile(path.join(root, terminalPath)), terminal = JSON.parse(terminalBytes);
assert.equal(terminal.status, "failed-or-incomplete-private-stress"); assert.equal(terminal.assetsRestored, true);
const entry = terminal.retainedReports.find(row => row.path.endsWith(".json.gz"));
const gzip = await readFile(path.join(root, entry.path)); assert.equal(sha(gzip), entry.sha256);
const bytes = gunzipSync(gzip); assert.equal(sha(bytes), entry.restoredSha256);
const raw = JSON.parse(bytes), blank = raw.samples.filter(row => row.phase === "blank-baseline");
assert.equal(raw.activeRun, 0); assert.equal(raw.loadedIdle, null); assert.equal(raw.completedRuns.length, 0);
const last = blank.slice(-5), valid = last.filter(row => row.privateBytes !== null), median = [...valid.map(row => row.privateBytes)].sort((a, b) => a - b)[2] ?? null;
const spread = valid.length === 5 ? Math.max(...valid.map(row => row.privateBytes)) - Math.min(...valid.map(row => row.privateBytes)) : null;
const analysis = { recordedAt: new Date().toISOString(), terminalPath, terminalSha256: sha(terminalBytes), rawReport: entry,
  status: "exact-stress-blank-baseline-failure-analyzed-no-conversion", sourceSha256: sha(await readFile(new URL(import.meta.url))),
  sampleCount: blank.length, minimumElapsedMs: 8000, stabilityRelativeSpreadLimit: 0.02,
  elapsedMs: blank.at(-1).elapsedMs - blank[0].elapsedMs, lastFiveMedianBytes: median, lastFiveSpreadBytes: spread,
  lastFiveAllowedSpreadBytes: median === null ? null : median * 0.02, stableWindowResult: stableWindow(blank),
  blankSamples: blank.map(row => ({ timestamp: row.timestamp, elapsedMs: row.elapsedMs, privateBytes: row.privateBytes,
    processCount: row.processes?.length ?? null, unavailable: row.sampleError ?? null })),
  nativePhases: raw.nativeMemory.phases.map(row => ({ phase: row.phase, valid: row.validSamples, unavailable: row.unavailableSamples,
    peakPrivateBytes: row.peak?.[3] ?? null, lastPrivateBytes: row.last?.[3] ?? null })),
  helperBirthsAbsent: terminal.helperProof.launches.every(row => row.absence.status === "owned-identity-absent"),
  browserConversionsPerformed: 0, publicAcceptance: false };
assert.equal(analysis.stableWindowResult, null);
await writeFile(path.join(root, "evidence/aiff-id3-stress-baseline-analysis-2026-10-10.json"), JSON.stringify(analysis, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(analysis));
