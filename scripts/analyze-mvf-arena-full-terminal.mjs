// One terminal audit, no conversion/retry. Preserve measured API distinctions.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/mvf-arena-full-sources.mjs";
import { validateCompositeAllocationFailureRecord } from "./lib/mvf-arena-full-failure.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
import { readWasmFunctionNames, symbolizeWasmStack } from "./lib/wasm-stack-symbols.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), stamp = "2026-10-14T22-43-44-516Z";
const terminalPath = `evidence/${stamp}-mvf-arena-original-full-terminal.json`, terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const supervisorPath = "evidence/2026-10-14T22-43-40-203Z-mvf-arena-supervisor-full.json", supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
assert.equal(supervisor.status, "command-completed-not-conversion-acceptance"); assert.equal(supervisor.childExit.code, 0);
assert.equal(terminal.candidate.actualExitCode, 1); assert.equal(terminal.candidate.status, "failed"); assert.equal(terminal.candidate.completedConversions, 0);
assert.equal(terminal.executions, 1); assert.equal(terminal.requestedRuns, 3); assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
const record = terminal.candidate.compressedReport, zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
const raw = gunzipSync(zip, { maxOutputLength: 33554432 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
const report = JSON.parse(raw); assert.equal(report.status, "failed"); assert.equal(report.runs.length, 1); assert.equal(report.limitMiB, 250);
assert.equal(report.runs[0].state.jobState, "error"); assert.equal(report.runs[0].independentValidation, null);
const archive = await materializeLayeredFullSourceArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(archive.sourcePins).length, 588); assert.deepEqual(archive.sourcePins, terminal.sourcePins);
assert.deepEqual(terminal.sourcePins, terminal.postSourcePins); assert.deepEqual(report.sourceHashes, terminal.sourcePins);
for (const [file, expected] of Object.entries(terminal.sourcePins)) {
  assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), expected); assert.equal(sha(await read(file)), expected, file);
}
const decoderSha = "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576";
assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"], decoderSha);
assert.equal(report.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
assert.deepEqual(report.manifest, terminal.composition.manifest);
assert.equal(report.abortDiagnostic.records.length, 1); const captured = report.abortDiagnostic.records[0]; validateCompositeAllocationFailureRecord(captured);
assert.equal(captured.qualifiedPacketCallPath, true); assert.equal(captured.qualifiedPoolCallPath, false); assert.equal(captured.qualifiedReallocCallPath, false);
assert.equal(captured.latePoolRequest, null); assert.equal(captured.reallocAttempt, null);
assert.equal(captured.allocationAttempt.phase, "upstream-alignment-pending"); assert.equal(captured.wrapperRequestedBytes, 212670);
assert.equal(captured.failedIndividualAllocationBytes, null); assert.equal(captured.allocationAttempt.allocatorInternalChunkBytes, null);
const free = captured.allocatorFreeBlocks; assert.equal(free.complete, true);
assert.equal(free.totalFreeChunkBytes, 556208); assert.equal(free.largestFreeChunkBytes, 78656);
assert.equal(free.topChunkBytes, 1840); assert.equal(free.unclaimedMemoryAboveSegmentBytes, 106496);
assert.equal(free.freeChunks, 65); assert.equal(free.headerWordsRead, 372);
assert.ok(free.largestFreeChunkBytes < captured.wrapperRequestedBytes);
assert.ok(free.topChunkBytes + free.unclaimedMemoryAboveSegmentBytes < captured.wrapperRequestedBytes);
const binary = await read("work/mpeg2-mvf-arena-38643550000/within-mpeg2-split.wasm"); assert.equal(sha(binary), decoderSha);
const stack = symbolizeWasmStack(captured.stack, readWasmFunctionNames(binary));
for (const name of ["mpeg2_packets", "av_malloc", "__wrap_posix_memalign", "emscripten_builtin_malloc", "sbrk"])
  assert.ok(stack.some(row => row.functionNameFromActualBinary === name));
assert.deepEqual(report.forbiddenRequests, []); assert.deepEqual(report.inputReadFailureSamples, []);
const frame = report.splitFinalSamples[0], metrics = report.runs[0].state.metrics;
assert.equal(frame.frames, 34338); assert.equal(frame.completedPackets, 34337); assert.equal(frame.aggregateWasmMemoryBytes, 50331648);
assert.equal(frame.activePackets, 0); assert.equal(frame.queuedPackets, 0); assert.equal(frame.queuedFrames, 0);
assert.equal(metrics.outputBytes, 625007256); assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
const phase = report.nativeMemory.phases.find(row => row.phase === "conversion-1"); assert.equal(phase.validSamples, 11832);
assert.equal(report.runs[0].nativePeaks.validSamples, 11839); assert.equal(report.nativeMemory.sequence, 14936);
assert.equal(report.nativeMemory.phases.length, 6); assert.ok(report.nativeMemory.phases.every(row => row.unavailableSamples === 0));
assert.equal(report.blankBaseline.stable, true); assert.equal(report.blankBaseline.privateBytes, 238411776);
const incremental = (phase.peak[3] - report.blankBaseline.privateBytes) / 1048576;
assert.equal(incremental, 217.67578125); assert.equal(report.runs[0].incrementalPrivateMiB, incremental);
assert.equal(report.nativeMemory.receiptClockFence.samplesDropped, 0); assert.equal(report.nativeMemory.receiptClockFence.timestampsRewritten, 0);
assert.equal(report.nativeMemory.receiptClockFence.monitorClosed, true);
for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(report.cleanup[field], true);
for (const directory of [terminal.wrapper, terminal.candidateDirectory, report.runtimeDirectory, supervisor.runtimeDirectory])
  await assert.rejects(access(directory), { code: "ENOENT" });
const identities = [...report.nativeMemory.identities, ...report.ownedLaunches.map(row => row.identity), terminal.driverIdentity, supervisor.supervisorIdentity, supervisor.childIdentity];
const unique = [...new Map(identities.map(row => [`${row.pid}/${row.parentPid}/${microsecondBirth(row.createdAt)}`, row])).values()];
const pids = [...new Set(unique.map(row => row.pid))]; assert.ok(pids.length > 5 && pids.length <= 64);
const command = "$ErrorActionPreference='Stop'; $mvfAuditPids=" + pids.join(",") + "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$mvfAuditPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")],
  { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout), birthChecks = unique.map(identity => {
  const now = current.find(row => row.pid === identity.pid) ?? null;
  assert.ok(!now || now.parentPid !== identity.parentPid || microsecondBirth(now.createdAt) !== microsecondBirth(identity.createdAt));
  return { identity, current: now, ownedBirthAbsent: true };
});
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265); const digest = createHash("sha256");
for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) digest.update(chunk);
const originalSha = digest.digest("hex"); assert.equal(originalSha, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter); assert.equal(terminal.protectedAfter.sha256, originalSha);
assertInstalledChromePinsEqual(terminal.browserPinBefore, terminal.browserPinAfter); assertInstalledChromePinsEqual(terminal.browserPinAfter, await inspectInstalledChromePin());
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"])
  assert.equal(sha(await read("dist/client/engines/remux/" + file)), sha(await read("public/engines/remux/" + file)));
const checkpointPath = path.relative(root, report.nativeMemory.durableCheckpoint.file).replaceAll("\\", "/");
assert.equal(path.dirname(path.resolve(root, checkpointPath)), path.join(root, "outputs/reports"));
const checkpointBytes = await read(checkpointPath), checkpoint = JSON.parse(checkpointBytes); assert.equal(checkpoint.coverageThroughSequence, 14936);
assert.equal(checkpoint.conversionAcceptance, false); assert.equal(checkpoint.completeRunCoverageProven, false);
const compactPhases = rows => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "unavailableExamples")));
assert.deepEqual(compactPhases(checkpoint.native.phases), compactPhases(report.nativeMemory.phases));
const checkpointZip = gzipSync(checkpointBytes, { level: 9 }); assert.deepEqual(gunzipSync(checkpointZip), checkpointBytes);
const compressedCheckpoint = checkpointPath + ".gz"; await writeFile(path.join(root, compressedCheckpoint), checkpointZip, { flag: "wx" });
assert.equal(sha(await read(compressedCheckpoint)), sha(checkpointZip));
const target = path.resolve(root, checkpointPath), identity = await lstat(target, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
const recheck = await lstat(target, { bigint: true }); assert.equal(recheck.dev, identity.dev); assert.equal(recheck.ino, identity.ino);
assert.equal(sha(await read(checkpointPath)), sha(checkpointBytes)); await unlink(target); await assert.rejects(access(target), { code: "ENOENT" });
const own = "scripts/analyze-mvf-arena-full-terminal.mjs", ownBytes = await read(own), output = `evidence/${stamp}-mvf-arena-full-terminal-analysis.json`;
const value = { recordedAt: new Date().toISOString(), status: "failed-full-original-packet-allocation-not-acceptance",
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, supervisor: { path: supervisorPath, sha256: sha(supervisorBytes), exitCode: 0, notConversionPass: true },
  actualDriverExitCode: 1, requestedRuns: 3, completedValidatedRuns: 0, sourceCount: 588, allExecutedCurrentPostPreimagesVerified: true, sourceArchive: terminal.sourceArchive, rawArchive: record,
  frames: frame.frames, completedPackets: frame.completedPackets, activeElapsedMs: metrics.elapsedMs, partialOutputBytes: metrics.outputBytes, partialOutputRemoved: true,
  capturedWrapperAttempt: captured.allocationAttempt, wrapperRequestedBytes: captured.wrapperRequestedBytes, failedIndividualAllocationBytes: null,
  allocatorFreeInventory: free, actualNativeStack: captured.stack, actualTypedStack: stack,
  contiguousSpaceShortageForWrapperRequestSupported: true, underlyingFragmentationLifetimeOriginProven: false, internalMallocChunkBytes: null,
  actualPacketCacheIdleCapacity: null, actualPacketCacheLiveLeases: null, actualMvfArenaUseMeasured: false,
  optimisticTopPlusTailBytes: free.topChunkBytes + free.unclaimedMemoryAboveSegmentBytes,
  failedWindowMemory: { formula: `(${phase.peak[3]} - ${report.blankBaseline.privateBytes}) / 1048576`, incrementalPrivateMiB: incremental, completeAcceptance: false,
    stableBlank: report.blankBaseline, activePhaseValidSamples: phase.validSamples, runNativeSnapshotValidSamples: report.runs[0].nativePeaks.validSamples,
    nativeSequence: report.nativeMemory.sequence, phases: report.nativeMemory.phases, finallyCleanupNativePhasePresent: false },
  splitFinal: frame, asyncifyFinal: report.asyncifyStorageFinalSamples, birthChecks, originalWholePrePostCurrentSha256: originalSha,
  browserPin: terminal.browserPinBefore, browserPinsBeforeAfterCurrentEqual: true,
  verifiedRemovedDuplicateCheckpoint: { path: checkpointPath, bytes: checkpointBytes.length, sha256: sha(checkpointBytes),
    archive: { path: compressedCheckpoint, bytes: checkpointZip.length, sha256: sha(checkpointZip), restoredBytes: checkpointBytes.length, restoredSha256: sha(checkpointBytes) } },
  originalFullAcceptance: false, completeChromiumMemoryAcceptance: false, speedGainProven: false, publicAcceptance: false, noDocker: true,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
await writeFile(path.join(root, output), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, frames: value.frames, completedPackets: value.completedPackets, wrapperRequestedBytes: value.wrapperRequestedBytes,
  failedWindowIncrementalMiB: incremental, ownedBirthsAbsent: birthChecks.length, removedCheckpointBytes: checkpointBytes.length }));
