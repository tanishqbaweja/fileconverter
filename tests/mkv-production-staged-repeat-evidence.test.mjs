import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { renderProductionStagedRepeatReport } from "../scripts/lib/mkv-production-staged-repeat-report.mjs";
import { deriveScalingRepeatWindow } from "../scripts/lib/mkv-large-scaling-repeat-report.mjs";
import { reconcileChromiumBirths } from "../scripts/lib/reconcile-chromium-births.mjs";
import { headerProtectedReference, readHeaderProtectedReference } from "../scripts/lib/mkv-header-protected-reference.mjs";
import { mkvProtectedCopy } from "../scripts/lib/mkv-protected-copy-contract.mjs";
const file = "evidence/2026-11-16T13-03-58-368Z-mkv-hevc-header-core-production-staged-original-repeats.json";
const read = f => readFile(new URL(`../${f}`, import.meta.url)), sha = b => createHash("sha256").update(b).digest("hex");
async function load() {
  const bytes = await read(file); assert.equal(sha(bytes), "d5edb76abe6f4a239bb44d89bcae0c121d7a4085d7964b0f797e5d62ced18258");
  const r = JSON.parse(bytes), [a] = r.arms, packed = await read(a.archive.file);
  assert.equal(sha(packed), "7a1303cd9eaedf3512dfc81df5e2740615e9527d9c49183fbe5c6116c3e3fac2"); assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 16 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
  return { r, a, samples: JSON.parse(raw) };
}
test("actual production-staged original gate FAILS third job405.11MiB; two complete byte-identical originals are not3+1 acceptance and failed selected copy is genuinely cancelled", async () => {
  const { r, a } = await load(); assert.equal(r.status, "failed-not-acceptance"); assert.equal(a.status, "failed-not-acceptance"); assert.equal(r.arms.length, 1); assert.equal(a.cases.length, 3);
  const ref = readHeaderProtectedReference(await read(headerProtectedReference.file), r.candidateBuild);
  assert.deepEqual(r.protectedReference, ref); assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 }); assert.deepEqual(r.originalBefore, r.originalAfter);
  for (const c of a.cases.slice(0, 2)) {
    assert.equal(c.state, "complete"); assert.equal(c.metrics.outputBytes, 2962151594); assert.equal(c.validation.outputSha256, ref.outputSha256);
    assert.equal(c.validation.fullVideoDecode, false); assert.equal(c.validation.fullVideoDecodeInheritedThroughWholeOutputIdentity, true);
    assert.equal(c.validation.independentValidation.noValidationReplay, true); assert.equal(c.metrics.peakScratchBytes, c.metrics.outputBytes);
    assert.equal(c.metrics.scratchBytes, 0); assert.equal(c.metrics.maxScratchReadChunkBytes, 524288); assert.equal(c.metrics.maxScratchWriteChunkBytes, 524288);
    assert.equal(c.metrics.peakPendingOperations, 1); assert.ok(c.outputRemoved && c.validation.candidateGate.passed);
  }
  assert.deepEqual(a.cases.slice(0, 2).map(c => c.metrics.elapsedMs), [53729.03500000015, 43378.55999999866]);
  assert.deepEqual(a.cases.slice(0, 2).map(c => c.cleanupAboveIdleMiB), [10.05078125, 17.265625]);
  assert.equal(a.cases[2].validation, undefined); assert.equal(a.cases[2].state, undefined); // no invented complete third output
  const d = a.budgetFailureRoleDiagnostic;
  assert.equal(d.stateBeforeQuiescence.phase, "Copying staged MP4 to selected destination");
  assert.equal(d.quiescence.cancellationRequested, true); assert.equal(d.quiescence.terminalState, "cancelled"); assert.equal(a.preCleanupJob.state, "cancelled");
  assert.equal(a.preCleanupJob.metrics.scratchBytes, 0); assert.equal(d.roles.length, 1);
  const p = d.roles[0]; assert.equal(p.nativeBirth.pid, 32416); assert.equal(p.nativeBirth.privateBytes, 264974336);
  assert.equal(p.result.status, "observed-birth-not-in-matching-census"); assert.equal(p.result.type, null); assert.equal(p.result.utilitySubtype, null);
  const peakChild = a.memory.peak.processes.find(q => q.pid === 32416);
  for (const key of ["pid", "parentPid", "createdAt", "creationFileTime", "executableName"]) assert.equal(peakChild[key], p.nativeBirth[key]);
  assert.equal(peakChild.privateBytes, 303366144); // later primary peak, not the earlier diagnostic snapshot; INCLUDED
  assert.equal(a.workerResponses, 0); assert.equal(a.releaseWorker.overrides, false); assert.equal(a.productionWorkerBinding.sha256, r.productionStagedRecoveryReference.productionWorkerSha256);
  assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.toolDownloadRemoved); assert.equal(a.birthCleanup.allObservedBirthsAbsent, true);
  assert.equal(a.birthCleanup.observedPidCount, 47); assert.deepEqual(a.birthCleanup.reused.map(p => p.pid), [11780, 30856]); assert.equal(a.birthCleanup.noProcessesKilled, true);
  assert.deepEqual(a.forbiddenRequests, []);
  for (const key of ["headed", "browserServicesDisabled", "productionFilesReplaced", "speedGainProven", "nativeConversionUsed", "publicAcceptance"]) assert.equal(r[key], false);
});
test("all1657 full native rows retained; every original job/aggregate peak and missing count rederived,47 owned births reconciled, failed report never turns green", async () => {
  const { r, a, samples } = await load(); assert.equal(samples.length, 1657);
  const derived = a.cases.map(c => deriveScalingRepeatWindow(samples, { ...c.conversionWindow, end: c.conversionWindow.end ?? a.memory.end }, a.blank.privateBytes));
  assert.deepEqual(derived.map(m => m.incrementalPrivateMiB), [194.4453125, 219.38671875, 405.11328125]);
  assert.deepEqual(derived.map(m => m.validSamples), [491, 399, 317]); assert.deepEqual(derived.map(m => m.unavailableSamples), [1, 0, 2]);
  assert.equal(a.memory.validSamples, 1207); assert.equal(a.memory.unavailableSamples, 3); assert.equal(a.memory.incrementalPrivateMiB, 405.11328125);
  const current = a.browserCleanup.observations.at(-1).current;
  assert.deepEqual(reconcileChromiumBirths({ identity: a.identity, observedPids: a.browserCleanup.observedPids, samples, current }), a.birthCleanup);
  // Preserve the original census-only HTML byte-for-byte, not rewrite history.
  const rendered = renderProductionStagedRepeatReport(r, [samples], { observerRoles: false });
  for (const [suffix, value] of Object.entries(rendered)) assert.equal(value, (await read(file.replace(/\.json$/, `.${suffix}`))).toString());
  assert.equal(rendered["native.csv"].trim().split("\n").length, 1658);
  assert.match(rendered.html, /405\.113/); assert.match(rendered.html, /snapshot 252\.699 MiB/);
  assert.match(rendered.html, /overall native peak 289\.313 MiB INCLUDED/); assert.match(rendered.html, /type unavailable, subtype unavailable/);
  assert.match(rendered.html, /terminal: cancelled/); assert.doesNotMatch(rendered.html, /OnDeviceModelService|<script|https?:\/\//);
  assert.match(rendered.html, /NOT a new decode/); assert.match(rendered.html, /earlier|Earlier/);
  const forged = structuredClone(r); forged.status = "passed-unmodified-production-staged-original-repeats-not-public-acceptance";
  assert.throws(() => renderProductionStagedRepeatReport(forged, [samples]));
});

test("current rendering reconciles the already-retained observer without rewriting the raw failure or missed census", async () => {
  const { r, a, samples } = await load(), before = JSON.stringify(r);
  const rendered = renderProductionStagedRepeatReport(r, [samples]);
  assert.match(rendered.html, /Role census: observed-birth-not-in-matching-census; type unavailable, subtype unavailable/);
  assert.match(rendered.html, /classified-from-retained-same-birth-observer; type utility, subtype on_device_model.mojom.OnDeviceModelService/);
  assert.match(rendered.html, /405\.113/); assert.match(rendered.html, /289\.313 MiB INCLUDED/);
  assert.equal(JSON.stringify(r), before); assert.equal(a.memory.incrementalPrivateMiB, 405.11328125);
  assert.equal(r.status, "failed-not-acceptance");
});
