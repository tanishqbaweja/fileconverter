import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { mkvStaticSmallReference, readMkvStaticSmallReference } from "../scripts/lib/mkv-static-small-reference.mjs";
import { chooseMkvBudgetRoleCandidates } from "../scripts/lib/owned-burst-role.mjs";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
import { reconcileNativeBirthRole } from "../scripts/lib/native-birth-role.mjs";
import { summarizeLifecycleTrace } from "../scripts/lib/lifecycle-allocation-attribution.mjs";

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
  const role = reconcileNativeBirthRole(target.nativeBirth, a.observer.birthTypeCapture);
  assert.equal(role.type, "renderer");
  assert.equal(role.utilitySubtype, null);
  assert.equal(reconcileNativeBirthRole({ ...target.nativeBirth, parentPid: 1 }, a.observer.birthTypeCapture).type, null);
  const reconciliation = JSON.parse(await read("evidence/2026-11-22-mkv-static-scale-renderer-reconciliation.json"));
  assert.deepEqual(reconciliation.role, role);
  assert.deepEqual(reconciliation.stableRendererRetentionMiB, [76.2265625, 74.640625]);
  assert.equal(reconciliation.acceptance.incrementalPrivateMiB, a.memory.incrementalPrivateMiB);
  assert.equal(reconciliation.allocatorOrCodeCauseProven, false);
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

test("single served 5.35 GB renderer run binds active and cleanup allocator views without treating them as acceptance", async () => {
  const file = "evidence/2026-11-22T08-00-55-184Z-mkv-hevc-header-core-production-static-scale-5gb-renderer-diagnostic.json";
  const bytes = await read(file), r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases;
  assert.equal(sha(bytes), "f2ccee3783cfd1a7cff58ee984534680b95a2d5bfe4ddf6588d770380f382024");
  assert.equal(r.status, "completed-production-static-5gb-renderer-diagnostic-not-acceptance");
  assert.equal(r.publicAcceptance, false); assert.equal(a.retention.forcedGc, false);
  assert.equal(a.retention.acceptanceMetric, false);
  assert.equal(a.retention.allocation.noEngineChanges, true);
  assert.equal(a.retention.allocationCallsiteCauseProven, false);
  assert.equal(c.rendererCheckpointActive, true);
  assert.equal(c.rendererCheckpointTrigger.outputBytes, 1084028692);
  assert.equal(c.state, "complete");
  assert.equal(c.validation.outputSha256, "bc0d3bac6d8a18b9589b74bdb1bc7c035e1c7b4ee25d40c260360e1b5a38a835");
  assert.ok(c.outputRemoved && a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved && a.birthCleanup.allObservedBirthsAbsent);
  assert.deepEqual(r.originalBefore, r.originalAfter);
  const dumps = a.retention.allocation.checkpoints, rendererRows = [];
  assert.deepEqual(dumps.map(d => d.phase), ["loaded-before-media", "active-after-1gib", "stable-cleanup"]);
  assert.deepEqual(dumps.map(d => d.state.jobState), ["idle", "running", "complete"]);
  for (const d of dumps) {
    assert.equal(d.error, null); assert.equal(d.detached, true);
    const zipped = await read(d.rawArchive.path);
    assert.equal(sha(zipped), d.rawArchive.sha256);
    const raw = gunzipSync(zipped, { maxOutputLength: 8 * 1048576 });
    assert.equal(sha(raw), d.rawArchive.restoredSha256);
    assert.deepEqual(summarizeLifecycleTrace(JSON.parse(raw), { success: true, dumpGuid: d.summary.guid }, d.processes), d.summary);
    assert.equal(d.summary.allocatorValuesOverlap, true);
    assert.equal(d.summary.summedAllocatorTotal, null);
    const renderer = d.summary.processes.filter(p => p.pid === 27484 && p.allocators.malloc);
    assert.equal(renderer.length, 1);
    const [p] = renderer;
    assert.equal(reconcileNativeBirthRole(p.identity, a.observer.birthTypeCapture).type, "renderer");
    assert.equal(p.identity.creationFileTime, "134398080891756229");
    rendererRows.push(p);
  }
  assert.deepEqual(rendererRows.map(p => p.identity.privateBytes), [44666880, 178536448, 61698048]);
  assert.deepEqual(rendererRows.map(p => p.allocators["blink_gc/main"].size / 1048576), [3.125, 38.375, 6.625]);
  assert.deepEqual(rendererRows.map(p => p.allocators["blink_gc/workers"].size / 1048576), [0.75, 5.5, 0.75]);
  assert.deepEqual(rendererRows.map(p => p.allocators["partition_alloc/partitions/array_buffer"].allocated_objects_size), [4656, 1319488, 1056]);
  assert.equal(dumps[0].realms.targets.find(t => t.type === "page").targetId, dumps[2].realms.targets.find(t => t.type === "page").targetId);
  assert.notEqual(dumps[1].realms.targets.find(t => t.type === "worker").targetId, dumps[2].realms.targets.find(t => t.type === "worker").targetId);
  const archive = await read(a.archive.file); assert.equal(sha(archive), a.archive.sha256);
  const active = summarizeProtectedWindow(JSON.parse(gunzipSync(archive, { maxOutputLength: 32 * 1048576 })), c.conversionWindow, a.blank.privateBytes);
  assert.equal(active.incrementalPrivateMiB, 225.30859375);
  assert.equal(a.memory.incrementalPrivateMiB, active.incrementalPrivateMiB);
  assert.equal(a.memory.cleanupAboveIdleMiB, 26.9375);
});

test("a real scale census separates explicit listener calls from live browser counters", async () => {
  const file = "evidence/2026-11-22T08-11-06-118Z-mkv-hevc-header-core-production-static-scale-5gb-renderer-diagnostic.json";
  const bytes = await read(file), r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases;
  assert.equal(sha(bytes), "f61a1d10849d2180d7a281c9d22b2ec662a1efe8c920af0cead469be651da1a5");
  assert.equal(r.status, "completed-production-static-5gb-renderer-diagnostic-not-acceptance");
  assert.equal(r.publicAcceptance, false);
  assert.equal(a.staticPackage.browserResponseBodiesOverridden, 0);
  assert.equal(r.peakLimitMiB, 250); assert.equal(r.cleanupLimitMiB, 96);
  assert.equal(c.state, "complete"); assert.equal(c.metrics.outputBytes, 5350648699);
  assert.equal(c.validation.outputSha256, r.productionDirectScaleContentReference.outputSha256);
  assert.ok(c.outputRemoved && a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved && a.birthCleanup.allObservedBirthsAbsent);
  assert.deepEqual(r.originalBefore, r.originalAfter);
  const { beforeStart, activeAfter1GiB, stableCleanup } = a.listenerRegistrationCensus;
  const [, beforeDOM, activeDOM, , cleanupDOM] = a.retention.checkpoints;
  assert.ok(beforeDOM.startedAt <= beforeStart.at && beforeStart.at <= c.conversionWindow.start);
  assert.ok(activeAfter1GiB.at <= activeDOM.startedAt && activeDOM.completedAt - activeAfter1GiB.at < 1000);
  assert.equal(activeAfter1GiB.jobState, "running");
  assert.equal(activeAfter1GiB.outputBytes, 1075050607);
  assert.deepEqual(activeAfter1GiB.calls, beforeStart.calls);
  assert.deepEqual([beforeDOM, activeDOM, cleanupDOM].map(d => d.dom.jsEventListeners), [179, 423, 210]);
  assert.deepEqual(stableCleanup.calls.window, { adds: 22, removes: 3 });
  const sizes = [], embedder = [];
  for (const dump of a.retention.allocation.checkpoints) {
    const zipped = await read(dump.rawArchive.path);
    assert.equal(sha(zipped), dump.rawArchive.sha256);
    const raw = gunzipSync(zipped, { maxOutputLength: 8 * 1048576 });
    assert.equal(sha(raw), dump.rawArchive.restoredSha256);
    const [p] = dump.summary.processes.filter(p => p.pid === 29876 && p.allocators["blink_gc/main"]);
    assert.equal(p.identity.creationFileTime, "134398087212425369");
    assert.equal(reconcileNativeBirthRole(p.identity, a.observer.birthTypeCapture).type, "renderer");
    sizes.push(p.allocators["blink_gc/main"].size / 1048576);
    embedder.push(dump.realms.targets.find(t => t.type === "page").embedderHeapUsedBytes);
  }
  assert.deepEqual(sizes, [3, 33.375, 62.875]);
  assert.deepEqual(embedder, [3022800, 31555312, 4982840]);
  const native = await read(a.archive.file); assert.equal(sha(native), a.archive.sha256);
  const active = summarizeProtectedWindow(JSON.parse(gunzipSync(native, { maxOutputLength: 32 * 1048576 })), c.conversionWindow, a.blank.privateBytes);
  assert.equal(active.incrementalPrivateMiB, 225.0546875);
  assert.equal(a.memory.cleanupAboveIdleMiB, 86.75390625);
});
