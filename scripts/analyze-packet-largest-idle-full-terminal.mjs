// Actual changed full attempt only. No conversion relaunch or success inference.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/packet-largest-idle-full-sources.mjs";
import { loadQualifiedLargestIdleMedia } from "./lib/packet-largest-idle-full-recipe.mjs";
import { validateCompositeAllocationFailureRecord } from "./lib/packet-largest-idle-full-failure.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = "2026-10-13T01-28-09-516Z", read = file => readFile(path.join(root, file));
const terminalPath = `evidence/${stamp}-packet-largest-idle-original-full-terminal.json`, terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
assert.equal(terminal.candidate.actualExitCode, 1); assert.equal(terminal.candidate.status, "failed"); assert.equal(terminal.candidate.completedConversions, 0);
assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter); assert.equal(terminal.productionRestored, true);
assert.equal(terminal.protectedAfter.bytes, 2958573265); assert.equal(terminal.protectedAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const record = terminal.candidate.compressedReport, zipped = await read(record.path);
assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
const rawBytes = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(rawBytes.length, record.restoredBytes); assert.equal(sha(rawBytes), record.restoredSha256);
const raw = JSON.parse(rawBytes), run = raw.runs[0]; assert.equal(raw.runs.length, 1); assert.equal(run.state.jobState, "error");
assert.equal(run.independentValidation, null); assert.equal(raw.requestedRuns, 3); assert.equal(raw.limitMiB, 250);
assert.ok(run.state.error.includes("Cannot enlarge memory arrays to size 33759232")); assert.deepEqual(raw.inputReadFailureSamples, []);
assert.equal(raw.abortDiagnostic.records.length, 1); assert.equal(raw.abortDiagnostic.captureError, null); assert.deepEqual(raw.forbiddenRequests, []);
const abort = raw.abortDiagnostic.records[0]; validateCompositeAllocationFailureRecord(abort);
for (const token of ["emscripten_builtin_realloc", "av_realloc", "av_buffer_realloc", "ebml_parse", "matroska_parse_cluster"]) assert.ok(abort.stack.includes(token), token);
assert.ok(!abort.stack.includes("mpeg2_packets"));
assert.equal(abort.failedIndividualAllocationBytes, null); assert.equal(abort.wrapperRequestedBytes, null); assert.equal(abort.allocatorFreeBlocks, null);
for (const flag of ["qualifiedDirectBufferCallPath", "qualifiedPoolCallPath", "qualifiedPacketCallPath", "originalFailureCauseProven"]) assert.equal(abort[flag], false);
assert.equal(abort.validatedScalarWords, 0);
assert.equal(run.state.metrics.elapsedMs, 1446197.2850000039); assert.equal(run.state.metrics.outputBytes, 626767162);
assert.equal(raw.splitFinalSamples[0].frames, 34348); assert.equal(raw.splitFinalSamples[0].completedPackets, 34348);
assert.equal(raw.splitFinalSamples[0].activePackets, 0);
assert.equal(run.state.metrics.peakWasmMemoryBytes, 50331648); assert.equal(run.state.metrics.queuedBytes, 0); assert.equal(run.state.metrics.pendingOperations, 0);
assert.equal(raw.asyncifyStorageFinalSamples.length, 1); const suspension = raw.asyncifyStorageFinalSamples[0];
assert.equal(suspension.allocations, 1); assert.equal(suspension.frees, 0); assert.equal(suspension.acquisitions, 4746);
assert.equal(suspension.activeLeases, 0); assert.equal(suspension.retainedBytes, 262156); assert.equal(suspension.abortedReleaseDeferredUntilWorkerTermination, true);
assert.equal(raw.formula, "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory");
assert.equal(raw.blankBaseline.privateBytes, 243499008); assert.equal(run.peakPrivateBytes, 485535744);
const incremental = (run.peakPrivateBytes - raw.blankBaseline.privateBytes) / 1048576; assert.equal(incremental, 230.82421875); assert.equal(run.incrementalPrivateMiB, incremental);
const active = raw.nativeMemory.phases.find(row => row.phase === "conversion-1"); assert.equal(active.validSamples, 13249); assert.equal(active.unavailableSamples, 0);
assert.equal(run.nativePeaks.validSamples, 13254); // Distinct snapshot cutoff; never silently rewrite it to match.
assert.equal(raw.nativeMemory.sequence, 16314); assert.equal(raw.nativeMemory.error, null);
assert.equal(raw.nativeMemory.receiptClockFence.samplesDropped, 0); assert.equal(raw.nativeMemory.receiptClockFence.timestampsRewritten, 0); assert.equal(raw.nativeMemory.receiptClockFence.monitorClosed, true);
const archive = await materializeLayeredFullSourceArchive(root, terminal.sourceArchive), qualified = await loadQualifiedLargestIdleMedia(root);
assert.equal(Object.keys(archive.sourcePreimages).length, 439); assert.deepEqual(archive.sourcePins, terminal.sourcePins);
assert.deepEqual(raw.sourceHashes, terminal.sourcePins); assert.deepEqual(terminal.postSourcePins, terminal.sourcePins); assert.deepEqual(raw.manifest, qualified.report.manifest);
for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(raw.cleanup[field], true);
for (const directory of [terminal.wrapper, terminal.candidateDirectory, raw.runtimeDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
const supervisorPath = "evidence/2026-10-13T01-28-08-146Z-packet-largest-idle-supervisor-full.json", supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
assert.equal(supervisor.childExit.code, 0); assert.equal(supervisor.status, "command-completed-not-conversion-acceptance"); assert.equal(supervisor.runtimeRemoved, true);
await assert.rejects(access(supervisor.runtimeDirectory), { code: "ENOENT" });
const checkpointPath = raw.nativeMemory.durableCheckpoint.file; assert.equal(path.dirname(checkpointPath), path.join(root, "outputs/reports"));
const checkpointBytes = await readFile(checkpointPath), checkpoint = JSON.parse(checkpointBytes); assert.ok(checkpointBytes.length <= 2097152);
assert.equal(checkpoint.status, "observer-closed-not-conversion-acceptance"); assert.equal(checkpoint.coverageThroughSequence, 16314); assert.deepEqual(checkpoint.baseline, raw.blankBaseline);
const phases = raw.nativeMemory.phases.map(row => {
  const saved = checkpoint.native.phases.find(value => value.phase === row.phase);
  const { unavailableExamples, ...persistedFields } = row; assert.deepEqual(saved, persistedFields);
  return { phase: row.phase, validSamples: row.validSamples, unavailableSamples: row.unavailableSamples,
    allCheckpointFieldsEqual: true, rawUnavailableExamples: unavailableExamples, unavailableExamplesStoredInCheckpoint: false };
});
const identities = [...raw.nativeMemory.identities, ...raw.ownedLaunches.map(row => row.identity), terminal.driverIdentity,
  supervisor.supervisorIdentity, supervisor.childIdentity, checkpoint.identities.monitor];
const unique = [...new Map(identities.map(row => [`${row.pid}:${Date.parse(row.createdAt)}`, row])).values()];
const script = "$ErrorActionPreference='Stop'; $ownedPids=" + [...new Set(unique.map(row => row.pid))].join(",") +
  "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$ownedPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
  { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout), checks = unique.map(identity => {
  const process = current.find(row => row.pid === identity.pid) ?? null;
  assert.ok(process === null || Math.abs(Date.parse(process.createdAt) - Date.parse(identity.createdAt)) >= 1);
  return { identity: { pid: identity.pid, parentPid: identity.parentPid, createdAt: identity.createdAt }, current: process, ownedBirthAbsent: true };
});
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal((await stat(path.join(root, "test.mkv"))).size, 2958573265);
const hash = createHash("sha256"); for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: 1048576 })) hash.update(chunk);
assert.equal(hash.digest("hex"), terminal.protectedAfter.sha256);
const checkpointArchive = `outputs/reports/${stamp}-packet-largest-idle-final-native-checkpoint.json.gz`, compressed = gzipSync(checkpointBytes, { level: 9 });
assert.deepEqual(gunzipSync(compressed), checkpointBytes); await writeFile(path.join(root, checkpointArchive), compressed, { flag: "wx" });
assert.equal(sha(await read(checkpointArchive)), sha(compressed));
const info = await lstat(checkpointPath, { bigint: true }); assert.ok(info.isFile() && !info.isSymbolicLink());
assert.equal(sha(await readFile(checkpointPath)), sha(checkpointBytes)); await unlink(checkpointPath); await assert.rejects(access(checkpointPath), { code: "ENOENT" });
const own = "scripts/analyze-packet-largest-idle-full-terminal.mjs", ownBytes = await read(own);
const proof = { recordedAt: new Date().toISOString(), status: "actual-changed-full-original-failed-matroska-realloc-not-acceptance",
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, supervisor: { path: supervisorPath, sha256: sha(supervisorBytes) },
  rawArchive: record, sourceArchive: terminal.sourceArchive, sourceCount: 439, allExecutedPrePostCurrentSourcesJoined: true,
  requestedRuns: 3, completedValidatedConversions: 0, independentFullFidelityValidation: null,
  elapsedMs: run.state.metrics.elapsedMs, partialOutputBytesDeleted: run.state.metrics.outputBytes, lastBridge: raw.splitFinalSamples[0], suspensionLifecycle: suspension,
  nativeFailure: { abortRecord: abort, requestedHeapExtentBytes: 33759232, failedIndividualAllocationBytes: null,
    demuxBufferReallocationPathObserved: true, packetPathFailureObserved: false, allocationLifetimeOrFragmentationCause: null,
    inputReadFailureRecords: [], suspensionStorageFreedByNativeCall: false,
    limits: "Actual stack proves av_buffer_realloc via av_realloc in Matroska cluster/EBML parsing.33759232 is requested heap extent, not an individual request. Guard correctly refused unrelated pending slots; exact request size/lifetime/fragmentation cause remains unproven." },
  failedWindowMemory: { formula: raw.formula, baselinePrivateBytes: raw.blankBaseline.privateBytes, peakPrivateBytes: run.peakPrivateBytes,
    incrementalPrivateMiB: incremental, validConversionPhaseSamples: active.validSamples, runNativePeakSnapshotSamples: run.nativePeaks.validSamples,
    snapshotCutoffCountsKeptDistinct: true, unavailableConversionSamples: active.unavailableSamples, unavailableStartupSamples: 2,
    nativeSequence: raw.nativeMemory.sequence, acceptance: false },
  durableCheckpoint: { path: checkpointArchive, bytes: compressed.length, sha256: sha(compressed), restoredBytes: checkpointBytes.length,
    restoredSha256: sha(checkpointBytes), rawRemovedAfterLosslessArchive: true, baselineAndAllPhasePeaksAndCountsPreserved: true,
    unavailableExamplesRetainedInRawArchive: true, phases },
  ownedBirthExitChecks: checks, cleanup: raw.cleanup, protectedOriginal: terminal.protectedAfter,
  noConversionRelaunched: true, noProcessesKilled: true, fullOriginalAcceptance: false, completeChromiumMemoryAcceptance: false, speedGainProven: false, publicAcceptance: false,
  nextAction: "Investigate the actual pinned Matroska av_buffer_realloc path and bounded allocator lifetime/fragmentation before another changed full run. Largest-idle native churn improvement did not establish full reliability; no unchanged replay, raised heaps, growth or reduced fidelity.",
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
const output = `evidence/${stamp}-packet-largest-idle-full-terminal-analysis.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, elapsedMs: proof.elapsedMs, partialOutputBytesDeleted: proof.partialOutputBytesDeleted,
  failedWindowMiB: incremental, ownedBirthsAbsent: checks.length, redundantCheckpointBytesRemoved: checkpointBytes.length }));
