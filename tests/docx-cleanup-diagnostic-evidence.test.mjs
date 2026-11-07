import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const read = file => readFile(new URL("../" + file.replaceAll("\\", "/"), import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const analysis = JSON.parse(await read("evidence/2026-11-07-docx-cleanup-diagnostic-analysis.json"));
const packed = await read(analysis.archivedReceipt.path), raw = gunzipSync(packed, { maxOutputLength: 10485760 }), r = JSON.parse(raw);
test("changed diagnostic receipt is losslessly preserved, not promoted after sublimit non-reproduction", async () => {
  assert.equal(sha(packed), analysis.archivedReceipt.sha256); assert.equal(sha(raw), analysis.originalReceipt.sha256);
  assert.equal(sha(raw), "d7f79516d45b89df4dd78421fa08ba8592202fec116411127eedc642c8804421");
  assert.equal(raw.length, 8477858); assert.equal(analysis.bytesSaved, raw.length - packed.length);
  await assert.rejects(read(analysis.originalReceipt.path), { code: "ENOENT" });
  assert.equal(sha(await read(analysis.analyzer.path)), analysis.analyzer.sha256);
  assert.equal(r.status, "failed-not-acceptance"); assert.equal(r.firstCleanupWithinGate, true);
  assert.equal(analysis.earlierCleanupFailureResolved, false); assert.equal(analysis.productionMemoryFixImplemented, false);
  assert.equal(r.diagnosticComparison.identicalProductionSourcesAndInputs, true);
  assert.equal(r.cases.length, 4); assert.equal(r.cases.at(-1).sourceBytes, 141871070); assert.equal(r.cases.at(-1).outputBytes, 139756049);
  assert.equal(r.cases.at(-1).runMemory.cleanupDeltaFromLoadedMiB, 43.06640625);
  assert.deepEqual(r.outlineControl.cases, []); assert.equal(analysis.nativeWordHeadingBrowserJobs, 0);
  assert.equal(r.publicPromotion, false); assert.equal(analysis.pageTargetNativeBirthJoinVerified, false);
});
test("all native totals and eight trace identities are preserved, late45s observation cannot replace first cleanup", async () => {
  const nativePacked = await read(r.nativeArchive.file); assert.equal(sha(nativePacked), r.nativeArchive.sha256);
  const nativeRaw = gunzipSync(nativePacked, { maxOutputLength: 8388608 }); assert.equal(sha(nativeRaw), r.nativeArchive.decodedSha256);
  const samples = JSON.parse(nativeRaw).filter(s => Date.parse(s.timestamp) >= Date.parse(r.memory.windowStart) && Date.parse(s.timestamp) <= Date.parse(r.memory.windowEnd));
  assert.equal(samples.length, 484);
  for (const s of samples) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  assert.equal((Math.max(...samples.map(s => s.privateBytes)) - r.blankBaseline.privateBytes) / 1048576, 123.2421875);
  assert.equal(analysis.phases.length, 8);
  for (const phase of analysis.phases) {
    const bytes = await read(phase.traceArchive.path); assert.equal(sha(bytes), phase.traceArchive.sha256);
    assert.equal(sha(gunzipSync(bytes, { maxOutputLength: 8388608 })), phase.traceArchive.restoredSha256);
  }
  assert.equal(analysis.phases.at(-1).phase, "cleanup-plus45s");
  assert.equal(r.cleanupDiagnostic.perturbsMemory, true); assert.equal(r.cleanupDiagnostic.noForcedGc, true);
  assert.ok(Date.parse(r.cleanupDiagnostic.rows.at(-1).startedAt) > Date.parse(r.memory.windowEnd));
});
test("known teardown255 is not relabelled a pass; all40 later observed PIDs are absent and original is unchanged", () => {
  assert.equal(r.ownedProcessCleanupErrors[1].code, 255); assert.match(r.ownedProcessCleanupErrors[1].message, /44544/);
  assert.equal(analysis.overallStatusRemainsFailed, true);
  assert.equal(analysis.laterOwnedProcessReconciliation.observedPids.length, 40);
  assert.deepEqual(analysis.laterOwnedProcessReconciliation.current, []);
  assert.equal(analysis.laterOwnedProcessReconciliation.noAdditionalProcessesKilled, true);
  assert.equal(r.ownedRuntimeRemoved, true); assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter);
  assert.equal(r.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
});
