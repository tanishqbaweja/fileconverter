import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { validateNativeBatch } from "./lib/persistent-chromium-memory.mjs";

const root = path.resolve(import.meta.dirname, ".."), controlPath = process.argv[2], smokePath = process.argv[3];
assert.match(controlPath ?? "", /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-fast-chromium-blank-control\.json$/);
assert.match(smokePath ?? "", /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-persistent-memory-monitor-smoke\.json$/);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const read = async (p) => { assert.ok((await stat(path.join(root, p))).size <= 16 * 1024 ** 2); return readFile(path.join(root, p)); };
const controlRaw = await read(controlPath), smokeRaw = await read(smokePath);
const r = JSON.parse(controlRaw), smoke = JSON.parse(smokeRaw);
assert.equal(r.status, "completed-diagnostic"); assert.equal(r.publicAcceptance, false);
assert.equal(smoke.status, "passed-observer-smoke"); assert.equal(r.intervalMs, 100);
assert.equal(r.cleanup.inputFilesSelected, 0); assert.equal(r.cleanup.conversionsPerformed, 0);
assert.equal(r.cleanup.repositoryLocalProfileAndCompilerScratchRemoved, true); assert.equal(r.cleanup.observerStopped, true);
assert.equal(smoke.cleanup.repositoryLocalCompilerScratchRemoved, true);
assert.equal(smoke.cleanup.convertedMediaCreated, false);
for (const source of [r, smoke]) for (const [file, hash] of Object.entries(source.sourceHashes)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
const valid = r.samples.filter((s) => s.privateBytes != null), rootPid = valid[0].processes.find((p) => p.type === "browser").pid;
assert.ok(valid.length >= 2000 && r.samples.length <= 3000);
assert.ok(r.baseline.stable && Date.parse(r.baseline.lastTimestamp) - r.browserStartedAt < 45000);
let sequence = 0;
for (let start = 0; start < r.samples.length; start += 256) {
  sequence = validateNativeBatch({ samples: structuredClone(r.samples.slice(start, start + 256)), overflow: false, observerCpuMs: 0 }, rootPid, sequence);
}
assert.equal(r.peak.privateBytes, Math.max(...valid.map((s) => s.privateBytes)));
assert.equal(r.peak.privateBytes, r.peak.processes.reduce((sum, p) => sum + p.privateBytes, 0));
assert.ok(r.peak.browserAgeMs > 175000 && r.peak.browserAgeMs < 200000, "Actual three-minute window, not a substitute acceptance baseline");
assert.ok(r.samples.some((s) => s.browserAgeMs > 230000));
const burst = smoke.samples.filter((s) => s.processes?.some((p) => p.pid === smoke.descendantPid && p.privateBytes >= 40 * 1024 ** 2));
assert.ok(burst.length >= 2);
assert.ok(smoke.samples.some((s) => s.sampleError && s.privateBytes === null));
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `@{ownedProcesses=@(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*chromium-fast-control-*') -or $_.ProcessId -eq ${r.observer.pid} }).Count;logicalProcessors=(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors} | ConvertTo-Json -Compress`], { windowsHide: true });
const environment = JSON.parse(stdout);
assert.equal(environment.ownedProcesses, 0); assert.ok(environment.logicalProcessors > 0);
const referenceMatches = r.cimComparisons.map((reference) => {
  const matches = valid.filter((s) => Date.parse(s.timestamp) >= reference.startedAt && Date.parse(s.timestamp) <= reference.completedAt)
    .filter((s) => reference.tree.processes?.length === s.processes.length && reference.tree.processes.every((p) =>
      s.processes.some((row) => row.pid === p.pid && Date.parse(row.createdAt) === Date.parse(p.createdAt) && row.privateBytes === p.privateBytes)));
  return { queryDurationMs: reference.durationMs, exactlyMatchingNativeSnapshots: matches.length };
});
assert.ok(referenceMatches.filter((r) => r.exactlyMatchingNativeSnapshots > 0).length >= 2);
assert.ok((await readdir(path.join(root, "work"))).every((n) => !n.startsWith("chromium-fast-control-") && !n.startsWith("memory-monitor-smoke-")));
const output = "evidence/persistent-chromium-memory-2026-10-04.json";
const evidence = { recordedAt: new Date().toISOString(), requirement: "A-09/M-04", publicAcceptance: false,
  scope: "Read-only OS observer validation and blank Chrome control, not conversion acceptance, no profile support changes",
  control: { path: controlPath, sha256: sha(controlRaw), browserVersion: r.browserVersion, sourceHashes: r.sourceHashes,
    intervalMs: r.intervalMs, earlyDiagnosticBaseline: r.baseline, observer: r.observer,
    samples: r.samples.length, validSamples: valid.length, peak: r.peak, processPeaks: r.processPeaks,
    timelineColumns: ["sequence", "timestamp", "privateBytes", "rssBytes", "nativeElapsedMs", "sampleError"],
    timeline: r.samples.map((s) => [s.sequence, s.timestamp, s.privateBytes, s.rssBytes, s.nativeElapsedMs, s.sampleError]),
    slowCimReferences: r.cimComparisons, referenceMatches, environment, cleanup: r.cleanup },
  smoke: { path: smokePath, sha256: sha(smokeRaw), data: smoke, observedAllocatedChildSamples: burst.length },
  limitations: ["No native output/browser conversion/re-certification", "Unknown subtype processes remain included; no undocumented command-line reads",
    "100-ms sampled peaks are not proof of continuous maxima", "Future long conversion gate must incorporate these native peaks without changing baseline/formula"],
};
await writeFile(path.join(root, output), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ output, samples: r.samples.length, privatePeakMiB: r.peak.privateBytes / 1024 ** 2,
  earlyBaselineMiB: r.baseline.privateBytes / 1024 ** 2, observer: r.observer }, null, 2)}\n`);
