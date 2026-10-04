import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const e = JSON.parse(await read("evidence/persistent-chromium-memory-2026-10-04.json"));

test("native blank control retains the real short-lived peak, unknown processes and unavailable readings without conversion acceptance", () => {
  const r = e.control;
  assert.equal(e.publicAcceptance, false);
  assert.equal(r.intervalMs, 100);
  assert.equal(r.samples, 2192);
  assert.equal(r.validSamples, 2191);
  assert.equal(r.timeline.length, r.samples);
  assert.deepEqual(r.timeline.map((s) => s[0]), Array.from({ length: r.samples }, (_, i) => i + 1));
  assert.equal(r.timeline.filter((s) => s[2] == null).length, 1);
  for (const row of r.timeline) {
    if (row[5]) { assert.equal(row[2], null); assert.equal(row[3], null); }
    else assert.ok(row[2] > 0 && row[3] >= 0);
  }
  assert.equal(r.peak.privateBytes, Math.max(...r.timeline.filter((s) => s[2] != null).map((s) => s[2])));
  assert.equal(r.peak.privateBytes, r.peak.processes.reduce((sum, p) => sum + p.privateBytes, 0));
  assert.equal(r.peak.privateBytes, 504782848);
  assert.equal(r.earlyDiagnosticBaseline.privateBytes, 260272128);
  assert.ok(r.peak.browserAgeMs >= 180000 && r.peak.browserAgeMs < 182000);
  const spike = r.processPeaks.find((p) => p.peakPrivateBytes === 277286912);
  assert.equal(spike.type, "unknown");
  assert.equal(spike.utilitySubtype, null);
  assert.equal(spike.observedSamples, 10);
  assert.ok(r.peak.processes.some((p) => p.pid === spike.pid));
  assert.ok(r.referenceMatches.every((s) => s.exactlyMatchingNativeSnapshots > 0));
  assert.equal(r.observer.maximumValidSampleGapMs, 219);
  assert.equal(r.environment.logicalProcessors, 20);
  assert.equal(r.environment.ownedProcesses, 0);
});

test("changed observer smoke proves a sub-second allocated descendant and null-on-exit with actual source-bound cleanup", async () => {
  const r = e.smoke.data;
  assert.equal(r.status, "passed-observer-smoke");
  assert.equal(sha(`${JSON.stringify(r, null, 2)}\n`), e.smoke.sha256);
  assert.equal(e.smoke.observedAllocatedChildSamples, 5);
  const allocated = r.samples.filter((s) => s.processes?.some((p) => p.pid === r.descendantPid && p.privateBytes >= 40 * 1024 ** 2));
  assert.equal(allocated.length, 5);
  assert.ok(Date.parse(allocated.at(-1).timestamp) - Date.parse(allocated[0].timestamp) < 500);
  assert.ok(r.samples.some((s) => s.sampleError && s.privateBytes === null && s.processes === null));
  for (const source of [r, e.control]) for (const [file, expected] of Object.entries(source.sourceHashes)) assert.equal(sha(await read(file)), expected, file);
  assert.equal(r.cleanup.repositoryLocalCompilerScratchRemoved, true);
  assert.equal(r.cleanup.observerStopped, true);
  assert.equal(r.cleanup.convertedMediaCreated, false);
  assert.equal(e.control.cleanup.repositoryLocalProfileAndCompilerScratchRemoved, true);
  assert.equal(e.control.cleanup.inputFilesSelected, 0);
  assert.equal(e.control.cleanup.conversionsPerformed, 0);
});
