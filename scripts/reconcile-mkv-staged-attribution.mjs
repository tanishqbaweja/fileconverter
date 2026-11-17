// Offline reconciliation only: no browser launch, conversion, service change or replay.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { reconcileNativeBirthRole } from "./lib/native-birth-role.mjs";
import { renderProductionStagedRepeatReport } from "./lib/mkv-production-staged-repeat-report.mjs";
const sha = b => createHash("sha256").update(b).digest("hex");
const file = "evidence/2026-11-16T13-03-58-368Z-mkv-hevc-header-core-production-staged-original-repeats.json";
const bytes = await readFile(file), digest = sha(bytes);
assert.equal(digest, "d5edb76abe6f4a239bb44d89bcae0c121d7a4085d7964b0f797e5d62ced18258");
const r = JSON.parse(bytes), [a] = r.arms, packed = await readFile(a.archive.file);
assert.equal(sha(packed), a.archive.sha256);
const raw = gunzipSync(packed, { maxOutputLength: 16 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
const samples = JSON.parse(raw), diagnostic = a.budgetFailureRoleDiagnostic.roles[0];
const atPeak = samples.filter(s => s.timestamp === a.memory.peak.timestamp);
assert.equal(atPeak.length, 1); const peak = atPeak[0];
assert.deepEqual(peak.processes, a.memory.peak.processes); assert.equal(peak.privateBytes, a.memory.peak.privateBytes);
assert.equal(peak.processes.reduce((n, p) => n + p.privateBytes, 0), peak.privateBytes);
const child = peak.processes.find(p => p.pid === diagnostic.nativeBirth.pid);
for (const key of ["pid", "parentPid", "createdAt", "creationFileTime"]) assert.equal(child[key], diagnostic.nativeBirth[key]);
const role = reconcileNativeBirthRole(child, a.observer.birthTypeCapture);
assert.equal(role.utilitySubtype, "on_device_model.mojom.OnDeviceModelService");
// Original receipt pinned the caller, but omitted this transitive helper. State
// that gap, and independently check its tracked bytes at executedHead instead.
const codeFile = "scripts/lib/birth-type-capture.mjs";
const code = execFileSync("git", ["show", `${r.executedHead}:${codeFile}`], { windowsHide: true, maxBuffer: 65536 });
assert.equal(sha(code), "fb76463e1e90d87ffb8a2d13b3cb6b7a53db3ffffdff2aab4c1b954f7655a398");
assert.deepEqual(await readFile(codeFile), code);
const caller = execFileSync("git", ["show", `${r.executedHead}:scripts/qualify-mkv-direct-reuse.mjs`], { windowsHide: true, maxBuffer: 2 * 1048576 });
assert.equal(sha(caller), r.sourcePins["scripts/qualify-mkv-direct-reuse.mjs"]);
assert.ok(caller.toString().includes('import { startClassifiedChromiumMemoryMonitor } from "./lib/birth-type-capture.mjs"'));
const primary = (peak.privateBytes - a.blank.privateBytes) / 1048576;
assert.equal(primary, a.memory.incrementalPrivateMiB); assert.equal(primary, 405.11328125);
const result = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), scope: "Offline diagnostic reconciliation, not a new conversion or acceptance",
  sourceReceipt: { file, sha256: digest, executedHead: r.executedHead }, nativeArchive: a.archive,
  classifierProvenance: { file: codeFile, sha256: sha(code), matchesTrackedExecutedHead: true,
    matchesCurrentBytes: true, directlyPinnedInOriginalReceipt: false, callerPinnedInOriginalReceipt: true,
    limitation: "Transitive helper was omitted from original sourcePins; tracked historical identity is not a runtime pin" },
  nativeBirth: Object.fromEntries(["pid", "parentPid", "createdAt", "creationFileTime"].map(k => [k, child[k]])),
  diagnosticSnapshotPrivateBytes: diagnostic.nativeBirth.privateBytes, nativePeakTimestamp: peak.timestamp,
  nativePeakChildPrivateBytes: child.privateBytes, laterCensus: diagnostic.result, retainedObserver: role,
  acceptance: { status: r.status, originalBlankPrivateBytes: a.blank.privateBytes, peakTreePrivateBytes: peak.privateBytes,
    incrementalPrivateMiB: primary, limitMiB: 250, passed: false, processIncluded: true, baselineChanged: false },
  diagnosticsOnly: { childMiB: child.privateBytes / 1048576,
    restOfTreeDeltaFromOriginalBlankMiB: primary - child.privateBytes / 1048576,
    restOfTreeDeltaNeededToPassWithSameChildMiB: 250 - child.privateBytes / 1048576,
    smallerMetricIsNotAcceptance: true, appTriggeredServiceAllocationProven: false },
  action: "Do not rerun unchanged, exclude the service, disable it, rebase the blank or claim that writer tuning fixes this failed run",
  newConversionPerformed: false, rawEvidenceModified: false, wholeGoalComplete: false,
};
const base = "evidence/2026-11-17-mkv-staged-attribution-reconciliation";
const html = renderProductionStagedRepeatReport(r, [samples]).html;
result.currentHtml = { file: base + ".html", sha256: sha(html) };
await writeFile(base + ".html", html, { flag: "wx" });
await writeFile(base + ".json", JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ file: base + ".json", acceptance: result.acceptance, retainedObserver: role }));
