import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { mkvStaticSmallReference, readMkvStaticSmallReference } from "../scripts/lib/mkv-static-small-reference.mjs";
import { chooseMkvBudgetRoleCandidates } from "../scripts/lib/owned-burst-role.mjs";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";

const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("no-body-substitution static browser path authenticates the exact production worker and recovery", async () => {
  const bytes = await read(mkvStaticSmallReference.file), r = JSON.parse(bytes), [a] = r.arms;
  const pin = readMkvStaticSmallReference(bytes, r.candidateBuild, a.releaseWorker.sha256);
  assert.equal(pin.sameStaticCoreAndWorker, true);
  assert.throws(() => readMkvStaticSmallReference(bytes, r.candidateBuild, "0".repeat(64)));
  const hosted = JSON.parse(await read("evidence/2026-11-22-mkv-hevc-header-hosted-reproduction.json"));
  assert.deepEqual(a.staticPackage.assets.map(({ relative, bytes, sha256 }) => ({ relative, bytes, sha256 })), hosted.verifierLogReceipt.packaged);
  assert.equal(a.workerResponses, 0);
  assert.deepEqual(a.forbiddenRequests, []);
  assert.ok(a.serverCleanup.ownedRootAbsent && a.browserCleanup.status === "owned-observed-pids-absent");
  assert.equal(a.memory.incrementalPrivateMiB, 158.953125);
  assert.equal(a.memory.cleanupAboveIdleMiB, 44.4765625);
  assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.deepEqual(a.cases.filter(c => c.state === "complete").map(c => c.validation.outputSha256),
    Array(3).fill("19adadcc74ba2a2acde01de262303ba2dcc43035de371999160c115eb7d750e9"));
  assert.equal(a.cases[1].cancellationBefore.outputBytes, 11892295);
  const archive = await read(a.archive.file);
  assert.equal(sha(archive), a.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 16 * 1048576 });
  assert.equal(sha(raw), a.archive.decodedSha256);
  const active = JSON.parse(raw).filter(s => Date.parse(s.timestamp) >= a.memory.start && Date.parse(s.timestamp) <= a.memory.end);
  const valid = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
  for (const s of valid) assert.equal(s.processes.reduce((sum, p) => sum + p.privateBytes, 0), s.privateBytes);
  assert.equal(valid.length, a.memory.validSamples);
  assert.equal(active.length - valid.length, a.memory.unavailableSamples);
  assert.equal((Math.max(...valid.map(s => s.privateBytes)) - a.blank.privateBytes) / 1048576, a.memory.incrementalPrivateMiB);
});

test("served static 5.35 GB third-run budget failure stays failed and keeps the same original gate", async () => {
  const file = "evidence/2026-11-22T07-49-47-193Z-mkv-hevc-header-core-production-static-scale-5gb-repeats.json";
  const bytes = await read(file), r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(sha(bytes), "f06bcbf41fecf4a45561df91a8510d160cd18d5fe69f6c75705232fa086badbe");
  assert.equal(r.status, "failed-not-acceptance");
  assert.equal(r.arms.length, 1); assert.equal(a.plannedProtectedJobs, 3);
  assert.equal(r.peakLimitMiB, 250);
  assert.equal(r.staticDelivery.responseBodiesOverridden, false);
  assert.equal(a.staticPackage.browserResponseBodiesOverridden, 0);
  assert.equal(r.fixture.bytes, 5347972392);
  const passed = a.cases.slice(0, 2);
  for (const c of passed) {
    assert.equal(c.state, "complete"); assert.equal(c.metrics.outputBytes, 5350648699);
    assert.equal(c.validation.outputSha256, r.productionDirectScaleContentReference.outputSha256);
    assert.equal(c.validation.fullDecodedContentInheritedThroughWholeOutputIdentity, true);
    assert.equal(c.outputRemoved, true);
  }
  assert.equal(a.cases[2].state, undefined);
  assert.equal(a.preCleanupJob.state, "cancelled"); assert.equal(a.preCleanupJob.metrics.outputBytes, 1367337019);
  assert.equal(a.budgetFailureRoleDiagnostic.quiescence.cancellationRequested, true);
  assert.deepEqual(a.budgetFailureRoleDiagnostic.roles, []);
  assert.ok(r.fixtureRuntimeRemoved && a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && a.birthCleanup.allObservedBirthsAbsent);
  assert.deepEqual(r.originalAfter, r.originalBefore);

  const archived = await read(a.archive.file);
  assert.equal(sha(archived), a.archive.sha256);
  const raw = gunzipSync(archived, { maxOutputLength: 32 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
  const samples = JSON.parse(raw);
  assert.equal(samples.length, 1502);
  for (const c of passed) assert.deepEqual(summarizeProtectedWindow(samples, c.conversionWindow, a.blank.privateBytes), c.memory);
  const active = samples.filter(s => a.cases.some(c => Date.parse(s.timestamp) >= c.conversionWindow.start && Date.parse(s.timestamp) <= c.conversionWindow.end));
  assert.equal(active.length, 1000);
  for (const s of active) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  const peak = active.reduce((max, s) => max.privateBytes >= s.privateBytes ? max : s);
  assert.deepEqual(peak, a.memory.peak);
  assert.equal((peak.privateBytes - a.blank.privateBytes) / 1048576, 250.78125);
  assert.equal(a.memory.incrementalPrivateMiB, 250.78125);
  const [target, ...other] = chooseMkvBudgetRoleCandidates({ peak, samples, blank: a.blank, rootPid: a.identity.pid });
  assert.equal(other.length, 0);
  assert.ok(Date.parse(target.nativeBirth.createdAt) < Date.parse(a.blank.firstTimestamp));
  assert.equal(target.nativeBirth.pid, 25708);
  assert.equal(target.nativeBirth.type, "unknown");
  assert.equal(target.blankBirthBytes, 15269888);
  assert.equal(target.growthMiB, 232.61328125);
});

test("budget role selection compares exact process births, never a reused PID", () => {
  const mib = 1048576, timestamp = "2026-11-22T00:00:15Z";
  const old = { pid: 42, creationFileTime: "100", privateBytes: 200 * mib };
  const baselineRow = { timestamp, privateBytes: old.privateBytes, processes: [old] };
  const later = { pid: 42, creationFileTime: "101", privateBytes: 80 * mib };
  const r = chooseMkvBudgetRoleCandidates({ peak: { processes: [later] }, samples: [baselineRow],
    blank: { stable: true, lastTimestamp: timestamp }, rootPid: 1 });
  assert.deepEqual(r, [{ nativeBirth: later, blankBirthBytes: null, growthMiB: 80 }]);
});
