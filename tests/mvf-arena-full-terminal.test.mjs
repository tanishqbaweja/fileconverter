import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/mvf-arena-full-sources.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const analysisPath = "evidence/2026-10-14T22-43-44-516Z-mvf-arena-full-terminal-analysis.json";
test("actual MVF full attempt fails in packet path, not old pool/realloc, without promoting wrapper bytes to internal allocation size", async () => {
  const p = JSON.parse(await read(analysisPath));
  assert.equal(p.actualDriverExitCode, 1); assert.equal(p.supervisor.exitCode, 0); assert.equal(p.supervisor.notConversionPass, true);
  assert.equal(p.completedValidatedRuns, 0); assert.equal(p.requestedRuns, 3);
  assert.equal(p.frames, 34338); assert.equal(p.completedPackets, 34337); assert.equal(p.partialOutputBytes, 625007256);
  assert.equal(p.wrapperRequestedBytes, 212670); assert.equal(p.failedIndividualAllocationBytes, null); assert.equal(p.internalMallocChunkBytes, null);
  assert.equal(p.capturedWrapperAttempt.phase, "upstream-alignment-pending");
  assert.ok(p.actualTypedStack.some(row => row.functionNameFromActualBinary === "mpeg2_packets"));
  assert.ok(!p.actualTypedStack.some(row => row.functionNameFromActualBinary === "av_refstruct_pool_get"));
  assert.equal(p.allocatorFreeInventory.totalFreeChunkBytes, 556208); assert.equal(p.allocatorFreeInventory.largestFreeChunkBytes, 78656);
  assert.equal(p.optimisticTopPlusTailBytes, 108336); assert.equal(p.allocatorFreeInventory.headerWordsRead, 372);
  assert.equal(p.actualPacketCacheIdleCapacity, null); assert.equal(p.actualPacketCacheLiveLeases, null);
  assert.equal(p.actualMvfArenaUseMeasured, false); assert.equal(p.underlyingFragmentationLifetimeOriginProven, false);
});
test("actual current/post source seal retains all588 preimages and failed-window memory is not acceptance", async () => {
  const p = JSON.parse(await read(analysisPath)), terminalBytes = await read(p.terminal.path), terminal = JSON.parse(terminalBytes);
  assert.equal(sha(terminalBytes), p.terminal.sha256); assert.deepEqual(terminal.sourcePins, terminal.postSourcePins);
  const archive = await materializeLayeredFullSourceArchive(root, p.sourceArchive);
  assert.equal(Object.keys(archive.sourcePins).length, 588);
  for (const [file, hash] of Object.entries(terminal.sourcePins)) {
    assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), hash); assert.equal(sha(await read(file)), hash);
  }
  assert.equal(p.failedWindowMemory.incrementalPrivateMiB, 217.67578125); assert.equal(p.failedWindowMemory.completeAcceptance, false);
  assert.equal(p.failedWindowMemory.activePhaseValidSamples, 11832); assert.equal(p.failedWindowMemory.runNativeSnapshotValidSamples, 11839);
  assert.equal(p.failedWindowMemory.nativeSequence, 14936); assert.equal(p.failedWindowMemory.phases.length, 6);
  assert.ok(p.failedWindowMemory.phases.every(row => row.unavailableSamples === 0));
  assert.equal(p.originalFullAcceptance, false); assert.equal(p.completeChromiumMemoryAcceptance, false); assert.equal(p.publicAcceptance, false);
});
test("all owned births gone, original unchanged, checkpoint duplicate removed only after lossless validation", async () => {
  const p = JSON.parse(await read(analysisPath)); assert.equal(p.birthChecks.length, 27); assert.ok(p.birthChecks.every(row => row.ownedBirthAbsent));
  assert.equal(p.originalWholePrePostCurrentSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(p.partialOutputRemoved, true); const duplicate = p.verifiedRemovedDuplicateCheckpoint;
  await assert.rejects(access(path.join(root, duplicate.path)), { code: "ENOENT" });
  const zip = await read(duplicate.archive.path); assert.equal(sha(zip), duplicate.archive.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: 2097152 }); assert.equal(sha(raw), duplicate.sha256); assert.equal(raw.length, 29564);
  assert.equal(sha(await read(p.ownSource.path)), p.ownSource.sha256);
});
test("analysis-only sample-cutoff correction retains exact failed preimage and every measured cutoff", async () => {
  const p = JSON.parse(await read("evidence/mvf-terminal-sample-cutoff-correction-2026-10-15.json"));
  const before = Buffer.from(p.sourceBeforePreimage, "base64").toString(); assert.equal(sha(before), p.sourceBeforeSha256);
  const after = (await read(p.target)).toString(); assert.equal(sha(after), p.proposedAfterSha256);
  assert.equal(before.replace(p.priorFailedAssertion, p.correctedAssertion), after);
  assert.deepEqual(p.measuredCutoffs, { activePhaseSamples: 11832, runNativeSnapshotSamples: 11839, budgetCaptureEvaluations: 11840 });
  assert.equal(p.converterOrRawEvidenceChanged, false); assert.equal(p.noConverterRetry, true);
});
test("packet ownership source audit preserves final-unref policy and leaves runtime cache occupancy unproven", async () => {
  const p = JSON.parse(await read("evidence/mvf-packet-ownership-source-audit-2026-10-15.json"));
  assert.equal(sha(await read(p.cache.path)), p.cache.sha256);
  assert.equal(p.sourcePolicy.releaseSelection, "largest-final-unreferenced"); assert.equal(p.sourcePolicy.maximumInterleaveDeltaUs, 1000000);
  assert.equal(p.sourcePolicy.liveReferencesNeverForceFreed, true);
  assert.equal(p.runtimeKnown.wrapperRequestedBytes, 212670); assert.equal(p.runtimeKnown.previousPeakEncodedPayloadBytes, 314024);
  assert.equal(p.runtimeUnknown.idleCapacityAtFailure, null); assert.equal(p.runtimeUnknown.liveLeaseCountAtFailure, null);
  assert.equal(p.interleaveDrainImplemented, false); assert.equal(p.noUnchangedRetry, true);
});
