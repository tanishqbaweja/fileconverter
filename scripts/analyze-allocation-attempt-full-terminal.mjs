// Failure-only independent audit. Never promote partial output or substitute
// heap extent/free totals for the internal allocation that actually failed.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { fullProgressNativeFacts } from "./lib/progress-compositing-full-recipe.mjs";
import { validateFullBitrateAudit } from "./lib/encoder-plane-bitrate-full-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/layered-full-source-archive.mjs";
import { validateCompositeAllocationFailureRecord } from "./lib/composite-allocation-failure-record.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
export function inspectFailedAllocationAttemptFull(raw) {
  assert.equal(raw.status, "failed"); assert.equal(raw.diagnosticOnly, false); assert.equal(raw.requestedRuns, 3); assert.equal(raw.limitMiB, 250);
  assert.equal(raw.source.path, "test.mkv"); assert.equal(raw.source.bytes, 2958573265);
  assert.equal(raw.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(raw.manifest.artifacts["within-mpeg2-split.wasm"], "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039");
  assert.equal(raw.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(raw.manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(raw.manifest.allowMemoryGrowth, false);
  assert.deepEqual(raw.actualWasmMemoryLimits, { decoderMux: [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }], encoder: [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }] });
  assert.equal(raw.progressProbe.partialOutputStopEnabled, false); assert.equal(raw.progressProbe.maximumConversionMs, 21600000);
  assert.equal(raw.progressProbe.jsAllocationSamplingEnabled, false); assert.equal(raw.conversionJsReport, null);
  assert.equal(raw.blankBaseline.stable, true); assert.equal(raw.startupSettlement.pageStayedBlank, true);
  assert.equal(raw.startupSettlement.processesExcluded, 0); assert.equal(raw.startupSettlement.baselineInflated, false);
  assert.deepEqual(raw.forbiddenRequests, []); assert.equal(raw.runs.length, 1); assert.equal(raw.runs[0].state.jobState, "error");
  assert.equal(raw.runs[0].independentValidation, null); assert.equal(raw.bitrateAuditSamples.length, 1); validateFullBitrateAudit(raw.bitrateAuditSamples[0]);
  const native = fullProgressNativeFacts(raw), history = raw.nativeMemory, tracker = raw.nativeFailureCapture, fence = history.receiptClockFence;
  assert.equal(history.error, null); assert.equal(history.sequence, tracker.sequence); assert.deepEqual(tracker.denominator, raw.blankBaseline);
  const rows = history.phases.reduce((n, p) => n + p.validSamples + p.unavailableSamples, 0);
  assert.equal(rows, history.sequence); assert.equal(tracker.callbackQueueLength, 0); assert.equal(tracker.rawNativePeaksRemainComplete, true);
  assert.deepEqual(tracker.receiptClockFence, fence); assert.equal(fence.monitorClosed, true); assert.equal(fence.fenceFailure, null);
  assert.equal(fence.samplesDropped, 0); assert.equal(fence.timestampsRewritten, 0); assert.equal(fence.originalTimestampAssertionsUnchanged, true);
  assert.equal(raw.abortDiagnostic.records.length, 1); assert.equal(raw.abortDiagnostic.captureError, null);
  assert.equal(raw.abortDiagnostic.syntheticMallocInvoked, false); assert.equal(raw.abortDiagnostic.noForcedGc, true);
  const failure = validateCompositeAllocationFailureRecord(raw.abortDiagnostic.records[0]), metrics = raw.runs[0].state.metrics;
  assert.equal(failure.role, "decoder"); assert.equal(failure.stackTruncated, false); assert.equal(failure.stackLimitRestored, true);
  for (const symbol of ["sbrk", "emscripten_builtin_malloc", "__wrap_posix_memalign", "av_malloc", "av_buffer_allocz", "avcodec_default_get_buffer2", "alloc_frame", "hevc_receive_frame"])
    assert.ok(failure.stack.includes("within-mpeg2-split.wasm." + symbol), symbol);
  assert.equal(failure.qualifiedDirectBufferCallPath, true); assert.equal(failure.qualifiedPoolCallPath, false);
  assert.equal(metrics.wasmMemoryBytes, 50331648); assert.equal(metrics.peakWasmMemoryBytes, 50331648);
  assert.ok(metrics.maxReadChunkBytes <= 262144 && metrics.maxWriteChunkBytes <= 524288 && metrics.peakQueuedBytes <= 1048576 && metrics.peakPendingOperations <= 1);
  for (const field of ["queuedBytes", "pendingOperations", "scratchBytes"]) assert.equal(metrics[field], 0);
  const final = raw.splitFinalSamples[0]; assert.equal(final.closed, true); assert.equal(final.frames, final.packets); assert.equal(final.frames, final.completedPackets);
  for (const field of ["activePackets", "queuedPackets", "queuedFrames", "additionalPixelBufferBytes", "additionalJsPacketBufferBytes"]) assert.equal(final[field], 0);
  return { status: "actual-original-alignment-fallback-failure-not-acceptance", requestedRuns: 3, attemptedRuns: 1, completedConversions: 0,
    native, rowsCountedWithoutDropping: rows, actualNativeBitRate: 4000000, actualNativeConfiguration: raw.bitrateAuditSamples[0],
    processedInputBytes: metrics.inputBytes, generatedPartialOutputBytes: metrics.outputBytes, elapsedMs: metrics.elapsedMs,
    frames: final.frames, completedPackets: final.completedPackets, acceptedOutputBytes: 0, numericSsim: null, qualityValidationReached: false,
    failedAllocation: { observedAt: failure.observedAt, wrapperRequestedBytes: failure.wrapperRequestedBytes, phase: failure.allocationAttempt?.phase ?? null,
      sequence: failure.allocationAttempt?.sequence ?? null, freshUnexposedPointer: failure.allocationAttempt?.words[7] ?? null,
      freshUnexposedPointerFreed: failure.allocationAttempt?.freshUnexposedPointerFreed ?? null, failedIndividualAllocationBytes: failure.failedIndividualAllocationBytes,
      attemptedHeapExtentBytes: Number(failure.reason.match(/to size (\d+) bytes/)?.[1]) || null, requestedHeapExtentIsIndividualAllocation: false,
      heapLiveBytes: null, allocatorFreeBlocks: failure.allocatorFreeBlocks, poolSlotRead: false, fragmentationCauseProven: false, originalFailureCauseProven: false },
    fullOriginalAcceptance: false, completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false, publicAcceptance: false,
    sameFailedConfigurationShouldBeRepeated: false, nextAction: "Audit exact compiled upstream alignment allocator/request arithmetic before any changed allocation fix or expensive original retry" };
}
async function main(file) {
  assert.match(file, /^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-allocation-attempt-original-full-terminal\.json$/);
  const root = path.resolve(import.meta.dirname, ".."), read = name => readFile(path.join(root, name));
  const ownFiles = ["scripts/analyze-allocation-attempt-full-terminal.mjs", "tests/allocation-attempt-full-terminal.test.mjs"], sourcePins = {}, sourcePreimages = {};
  for (const name of ownFiles) { const bytes = await read(name); sourcePins[name] = sha(bytes); sourcePreimages[name] = { encoding: "base64", data: bytes.toString("base64") }; }
  const terminalBytes = await read(file), terminal = JSON.parse(terminalBytes); assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
  assert.equal(terminal.status, "actual-full-attempt-terminal-independent-analysis-pending"); assert.equal(terminal.executions, 1);
  const archive = terminal.candidate.compressedReport, zipped = await read(archive.path); assert.equal(zipped.length, archive.bytes); assert.equal(sha(zipped), archive.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(bytes.length, archive.restoredBytes); assert.equal(sha(bytes), archive.restoredSha256);
  const raw = JSON.parse(bytes), sources = await materializeLayeredFullSourceArchive(root, terminal.sourceArchive);
  assert.deepEqual(sources.sourcePins, terminal.sourcePins); assert.deepEqual(raw.sourceHashes, terminal.sourcePins); assert.deepEqual(terminal.postSourcePins, terminal.sourcePins);
  assert.deepEqual(raw.manifest, terminal.composition.manifest); assert.equal(terminal.candidate.actualExitCode, 1);
  assert.equal(sha(sources.generatedCaller), terminal.sourceArchive.generatedCallerSha256);
  const result = inspectFailedAllocationAttemptFull(raw);
  const absence = [];
  const identities = [terminal.driverIdentity, ...raw.ownedLaunches.map(row => row.identity), ...raw.nativeMemory.identities];
  for (const identity of identities) { const observed = await observeOwnedProcessExit(identity); assert.equal(observed.status, "owned-identity-absent"); absence.push(observed); }
  for (const directory of [terminal.wrapper, terminal.candidateDirectory, raw.runtimeDirectory]) { assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" }); }
  assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter); assert.equal(terminal.protectedAfter.bytes, 2958573265);
  assert.equal(terminal.protectedAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
  for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(raw.cleanup[field], true);
  const postSourcePins = {}; for (const name of ownFiles) postSourcePins[name] = sha(await read(name)); assert.deepEqual(postSourcePins, sourcePins);
  const proof = { recordedAt: new Date().toISOString(), terminal: { path: file, sha256: sha(terminalBytes) }, rawArchive: archive,
    sourceArchive: terminal.sourceArchive, all312CurrentPrePostPreimageJoins: true, sourcePins, postSourcePins, sourcePreimages,
    result, independentlyObservedOwnedAbsence: absence, protectedBefore: terminal.protectedBefore, protectedAfter: terminal.protectedAfter,
    ownedScratchAbsent: true, stockUiRestored: true, redundantRawDeletedAfterByteExactArchive: terminal.candidate.rawRemovedAfterLosslessArchive, failure: null };
  const output = file.replace("-terminal.json", "-terminal-analysis.json"); await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, status: result.status, wrapperRequestedBytes: result.failedAllocation.wrapperRequestedBytes, phase: result.failedAllocation.phase, observedIncrementalPrivateMiB: result.native.observedIncrementalPrivateMiB, identitiesAbsent: absence.length }));
}
if (path.resolve(process.argv[1] ?? "") === import.meta.filename) { assert.equal(process.argv.length, 3); await main(process.argv[2]); }
