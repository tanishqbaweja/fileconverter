// Offline only: the role comes from the existing same-birth census, not PID
// reuse, a new conversion, or modified native acceptance data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { chooseMkvBudgetRoleCandidates } from "./lib/owned-burst-role.mjs";
import { reconcileNativeBirthRole } from "./lib/native-birth-role.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex"), mib = 1048576;
const file = "evidence/2026-11-22T07-49-47-193Z-mkv-hevc-header-core-production-static-scale-5gb-repeats.json";
const bytes = await readFile(file);
assert.equal(sha(bytes), "f06bcbf41fecf4a45561df91a8510d160cd18d5fe69f6c75705232fa086badbe");
const r = JSON.parse(bytes), [a] = r.arms;
assert.equal(r.status, "failed-not-acceptance");
assert.deepEqual(a.budgetFailureRoleDiagnostic.roles, []);
const packed = await readFile(a.archive.file); assert.equal(sha(packed), a.archive.sha256);
const raw = gunzipSync(packed, { maxOutputLength: 32 * mib }); assert.equal(sha(raw), a.archive.decodedSha256);
const samples = JSON.parse(raw), peak = samples.find(s => s.sequence === a.memory.peak.sequence);
assert.deepEqual(peak, a.memory.peak);
assert.equal(peak.processes.reduce((n, p) => n + p.privateBytes, 0), peak.privateBytes);
const [{ nativeBirth, blankBirthBytes, growthMiB }] = chooseMkvBudgetRoleCandidates({ peak, samples, blank: a.blank, rootPid: a.identity.pid });
const observer = a.observer.birthTypeCapture;
const rootRole = reconcileNativeBirthRole(peak.processes.find(p => p.pid === a.identity.pid), observer);
const role = reconcileNativeBirthRole(nativeBirth, observer);
assert.equal(rootRole.type, "browser"); assert.equal(role.type, "renderer");
assert.equal(nativeBirth.parentPid, a.identity.pid);
const helper = "scripts/lib/birth-type-capture.mjs", helperBytes = await readFile(helper);
assert.equal(sha(helperBytes), r.sourcePins[helper]);
const phases = [];
const phase = (name, scope) => {
  const scoped = samples.filter(s => Date.parse(s.timestamp) >= scope.start && Date.parse(s.timestamp) <= scope.end);
  const ms = scoped.flatMap(s => (s.processes ?? []).filter(p => p.pid === nativeBirth.pid && p.creationFileTime === nativeBirth.creationFileTime).map(p => p.privateBytes / mib));
  assert.equal(scoped.length, ms.length); assert.ok(ms.length > 0);
  phases.push({ name, samples: ms.length, firstMiB: ms[0], lastMiB: ms.at(-1), peakMiB: Math.max(...ms) });
};
const stable = (name, s) => phase(name, { start: Date.parse(s.firstTimestamp), end: Date.parse(s.lastTimestamp) });
stable("blank", a.blank); stable("loaded-idle", a.loaded);
for (const [i, c] of a.cases.entries()) {
  phase(`job-${i + 1}`, c.conversionWindow);
  if (c.cleanupStable) stable(`cleanup-${i + 1}`, c.cleanupStable);
}
const incrementalPrivateMiB = (peak.privateBytes - a.blank.privateBytes) / mib;
assert.equal(incrementalPrivateMiB, 250.78125);
const receipt = { schemaVersion: 1, scope: "offline renderer role reconciliation; not browser replay, allocator attribution or acceptance",
  originalReceipt: { file, sha256: sha(bytes) }, archive: a.archive, helper: { file: helper, sha256: sha(helperBytes), directlyPinned: true },
  rootRole, role, nativeBirth, blankBirthBytes, growthMiB, phases,
  stableRendererRetentionMiB: phases.filter(p => p.name.startsWith("cleanup")).map(p => p.lastMiB - phases[1].lastMiB),
  acceptance: { incrementalPrivateMiB, failed: true, limitMiB: 250, allProcessesIncluded: true, baselineChanged: false },
  allocatorOrCodeCauseProven: false, conversionReplayed: false, originalEvidenceChanged: false };
const output = "evidence/2026-11-22-mkv-static-scale-renderer-reconciliation.json", body = JSON.stringify(receipt, null, 2) + "\n";
try { await writeFile(output, body, { flag: "wx" }); }
catch (error) { if (error.code !== "EEXIST") throw error; assert.equal(await readFile(output, "utf8"), body); }
console.log(JSON.stringify({ output, role, phases, retention: receipt.stableRendererRetentionMiB, acceptance: receipt.acceptance }));
