// One exact terminal diagnostic: losslessly compact its large JSON and retain
// independently checked category/DOM facts. No browser run or source conversion.
import assert from "node:assert/strict";
import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import { summarizeLiveMemory } from "./lib/live-memory-infra.mjs";
import { queryObservedPidCensus } from "./lib/owned-chromium-cleanup.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const file = "evidence/2026-11-07T03-18-12-703Z-docx-html-qualification.json", full = path.resolve(root, file);
assert.equal(path.dirname(full), path.join(root, "evidence")); assert.equal(await realpath(full), full);
const identity = await lstat(full, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
const raw = await readFile(full); assert.equal(raw.length, 8477858);
assert.equal(sha(raw), "d7f79516d45b89df4dd78421fa08ba8592202fec116411127eedc642c8804421");
const r = JSON.parse(raw); assert.equal(r.status, "failed-not-acceptance"); assert.equal(r.firstCleanupWithinGate, true);
assert.equal(r.failures.length, 1); assert.equal(r.ownedProcessCleanupErrors[1].code, 255);
assert.equal(r.diagnosticComparison.identicalProductionSourcesAndInputs, true);
assert.equal(r.cases.length, 4); assert.equal(r.cases.at(-1).sourceBytes, 141871070);
assert.equal(r.cases.at(-1).outputBytes, 139756049);
const nativeBytes = await readFile(path.join(root, r.nativeArchive.file)); assert.equal(sha(nativeBytes), r.nativeArchive.sha256);
const nativeRaw = gunzipSync(nativeBytes, { maxOutputLength: 8388608 }); assert.equal(sha(nativeRaw), r.nativeArchive.decodedSha256);
const samples = JSON.parse(nativeRaw), active = samples.filter(s => Date.parse(s.timestamp) >= Date.parse(r.memory.windowStart) && Date.parse(s.timestamp) <= Date.parse(r.memory.windowEnd));
const valid = active.filter(s => s.privateBytes !== null);
assert.equal(valid.length, r.memory.validSamples); assert.equal(active.length - valid.length, r.memory.unavailableSamples);
for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
assert.equal((Math.max(...valid.map(s => s.privateBytes)) - r.blankBaseline.privateBytes) / 1048576, 123.2421875);
const phases = [];
for (const row of r.cleanupDiagnostic.rows) {
  const archive = row.memoryInfra.archive, archiveFile = path.join(root, "output/playwright", path.basename(archive.path));
  const packed = await readFile(archiveFile); assert.equal(sha(packed), archive.sha256);
  const traceRaw = gunzipSync(packed, { maxOutputLength: 8388608 }); assert.equal(sha(traceRaw), archive.restoredSha256);
  assert.deepEqual(summarizeLiveMemory(JSON.parse(traceRaw), row.memoryInfra.rows), row.memoryInfra.summary);
  phases.push({ phase: row.phase, nativePrivateBytesBefore: row.nativeBefore.privateBytes,
    dom: { documents: row.dom.documents, nodes: row.dom.nodes, jsEventListeners: row.dom.jsEventListeners },
    realms: row.realms.targets.map(t => ({ type: t.type, usedJSHeapBytes: t.usedJSHeapBytes,
      allocatedJSHeapBytes: t.allocatedJSHeapBytes, embedderHeapUsedBytes: t.embedderHeapUsedBytes, backingStorageBytes: t.backingStorageBytes })),
    rendererCategoryObservations: row.memoryInfra.summary.flatMap(s => s.processes.filter(p => p.pid === 12616).map(p => ({
      pid: p.pid, traceName: p.traceName, nativePrivateBytesBeforeDump: p.osPrivateBytesBeforeDump,
      blinkGcSize: p.allocators.blink_gc?.size ?? null, v8Size: p.allocators.v8?.size ?? null,
      mallocSize: p.allocators.malloc?.size ?? null, allocatorValuesOverlap: true, summedAllocatorTotal: null,
    }))), traceArchive: { ...archive, path: path.relative(root, archiveFile).replaceAll("\\", "/") } });
}
assert.equal(phases.length, 8);
const pids = [...new Set([...samples.flatMap(s => (s.processes ?? []).map(p => p.pid)), r.serverLaunchIdentity.pid])].sort((a, b) => a - b);
assert.equal(pids.length, 40); const current = await queryObservedPidCensus(pids); assert.deepEqual(current, []);
const packed = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(packed), raw);
await writeFile(full + ".gz", packed, { flag: "wx" });
assert.equal(sha(gunzipSync(await readFile(full + ".gz"))), sha(raw));
const nowIdentity = await lstat(full, { bigint: true }); assert.equal(nowIdentity.dev, identity.dev); assert.equal(nowIdentity.ino, identity.ino);
assert.equal(sha(await readFile(full)), sha(raw)); await unlink(full);
const proof = { recordedAt: new Date().toISOString(), status: "verified-changed-diagnostic-not-acceptance-original-cleanup-failure-unresolved",
  analyzer: { path: "scripts/analyze-docx-cleanup-diagnostic.mjs", sha256: sha(await readFile(new URL(import.meta.url))) },
  originalReceipt: { path: file, bytes: raw.length, sha256: sha(raw) },
  archivedReceipt: { path: file + ".gz", bytes: packed.length, sha256: sha(packed) },
  originalRemovedAfterIdentityAndLosslessVerification: true, bytesSaved: raw.length - packed.length, semanticsChanged: false,
  executedHead: r.executedHead, comparison: r.diagnosticComparison, overallStatusRemainsFailed: true,
  memory: r.memory, firstLargeCleanupMiB: r.cases.at(-1).runMemory.cleanupDeltaFromLoadedMiB,
  firstCleanupWithinGate: r.firstCleanupWithinGate, earlierCleanupFailureResolved: false, nativeWordHeadingBrowserJobs: 0,
  phases, ownedCleanupCommandErrors: r.ownedProcessCleanupErrors,
  laterOwnedProcessReconciliation: { acquiredAt: new Date().toISOString(), observedPids: pids, current, noAdditionalProcessesKilled: true },
  ownedRuntimeRemoved: r.ownedRuntimeRemoved, protectedOriginalAfter: r.protectedOriginalAfter,
  publicPromotion: false, productionMemoryFixImplemented: false, allocationStackAttribution: false,
  pageTargetNativeBirthJoinVerified: false, newBrowserRuns: 0,
  nextAction: "Preserve teardown errors and fail closed on live/unavailable observed-process census; run previously unreached real native heading and recovery jobs. Do not infer a converter fix from the diagnostic non-reproduction." };
const target = "evidence/2026-11-07-docx-cleanup-diagnostic-analysis.json";
await writeFile(path.join(root, target), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ path: target, bytesSaved: proof.bytesSaved, status: proof.status, phases: phases.length, allObservedPidsAbsent: current.length === 0 }));
