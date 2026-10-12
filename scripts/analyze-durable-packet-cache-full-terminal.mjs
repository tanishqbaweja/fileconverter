// Read/verify the actual terminal. Never retry conversion or reinterpret failure.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/packet-cache-layered-source-archive.mjs";
import { validateCompositeAllocationFailureRecord } from "./lib/packet-cache-full-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = "2026-10-12T10-18-33-321Z", read = file => readFile(path.join(root, file));
const terminalPath = `evidence/${stamp}-packet-cache-original-full-terminal.json`, terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
assert.equal(terminal.status, "actual-full-attempt-terminal-independent-analysis-pending"); assert.equal(terminal.failure, null);
assert.equal(terminal.candidate.status, "failed"); assert.equal(terminal.candidate.completedConversions, 0); assert.equal(terminal.candidate.requestedRuns, 3);
assert.deepEqual(terminal.cleanupErrors, []); assert.equal(terminal.productionRestored, true);
assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter);
const record = terminal.candidate.compressedReport, zipped = await read(record.path);
assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
const bytes = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
const raw = JSON.parse(bytes), run = raw.runs[0]; assert.equal(raw.status, "failed"); assert.equal(raw.runs.length, 1);
assert.equal(raw.requestedRuns, 3); assert.equal(raw.limitMiB, 250); assert.equal(raw.publicAcceptance, false);
assert.equal(run.state.jobState, "error"); assert.equal(run.independentValidation, null);
assert.equal(raw.formula, "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory");
const failure = raw.abortDiagnostic.records[0]; assert.equal(raw.abortDiagnostic.records.length, 1);
validateCompositeAllocationFailureRecord(failure);
assert.equal(failure.qualifiedBinarySha256, "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
assert.ok(failure.stack.includes("Object.allocateData") && failure.stack.includes("__asyncjs__within_input_read"));
assert.equal(failure.failedIndividualAllocationBytes, null); assert.equal(failure.fragmentationCauseProven, false);
assert.equal(failure.originalFailureCauseProven, false); assert.equal(failure.noHeapCopy, true); assert.equal(failure.noPayloadRead, true);
assert.ok(failure.reason.includes("33624064 bytes (OOM)"));
assert.equal(raw.nativeMemory.error, null); assert.equal(raw.nativeMemory.sequence, 117939);
assert.equal(raw.nativeMemory.receiptClockFence.samplesDropped, 0); assert.equal(raw.nativeMemory.receiptClockFence.timestampsRewritten, 0);
assert.equal(raw.nativeMemory.receiptClockFence.monitorClosed, true);
assert.equal(run.peakPrivateBytes, 487940096); assert.equal(raw.blankBaseline.privateBytes, 240627712);
const incremental = (run.peakPrivateBytes - raw.blankBaseline.privateBytes) / 1048576;
assert.equal(incremental, run.incrementalPrivateMiB); assert.equal(incremental, 235.85546875);
const active = raw.nativeMemory.phases.find(row => row.phase === "conversion-1");
assert.equal(active.validSamples, 114915); assert.equal(active.unavailableSamples, 0);
assert.equal(run.state.metrics.outputBytes, 4776487861); assert.equal(run.state.metrics.peakWasmMemoryBytes, 50331648);
assert.equal(run.state.metrics.peakPendingOperations, 1); assert.equal(run.state.metrics.pendingOperations, 0); assert.equal(run.state.metrics.queuedBytes, 0);
assert.equal(raw.actualWasmMemoryLimits.decoderMux[0].initialPages, 512); assert.equal(raw.actualWasmMemoryLimits.decoderMux[0].maximumPages, 512);
assert.equal(raw.actualWasmMemoryLimits.encoder[0].initialPages, 256); assert.equal(raw.actualWasmMemoryLimits.encoder[0].maximumPages, 256);
const archive = await materializeLayeredFullSourceArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(archive.sourcePreimages).length, 346); assert.deepEqual(archive.sourcePins, terminal.sourcePins);
assert.deepEqual(raw.sourceHashes, terminal.sourcePins); assert.deepEqual(terminal.postSourcePins, terminal.sourcePins);
for (const file of [terminal.wrapper, terminal.candidateDirectory, terminal.candidate.runtimeDirectory]) await assert.rejects(access(file), { code: "ENOENT" });
const supervisorPath = "evidence/2026-10-12T10-18-32-756Z-packet-cache-supervisor-full.json", supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
assert.equal(supervisor.status, "command-completed-not-conversion-acceptance"); assert.equal(supervisor.childExit.code, 0);
assert.equal(supervisor.failure, null); assert.equal(supervisor.runtimeRemoved, true); await assert.rejects(access(supervisor.runtimeDirectory), { code: "ENOENT" });
const checkpointPath = raw.nativeMemory.durableCheckpoint.file; assert.equal(path.dirname(checkpointPath), path.join(root, "outputs/reports"));
const checkpointBytes = await readFile(checkpointPath), checkpoint = JSON.parse(checkpointBytes);
assert.ok(checkpointBytes.length <= 2097152); assert.equal(checkpoint.status, "observer-closed-not-conversion-acceptance");
assert.equal(checkpoint.coverageThroughSequence, 117939); assert.deepEqual(checkpoint.baseline, raw.blankBaseline);
const phaseComparisons = raw.nativeMemory.phases.map(phase => {
  const persisted = checkpoint.native.phases.find(row => row.phase === phase.phase); assert.ok(persisted);
  const peaksEqual = JSON.stringify(persisted.peak) === JSON.stringify(phase.peak) && JSON.stringify(persisted.rssPeak) === JSON.stringify(phase.rssPeak);
  return { phase: phase.phase, originalValidSamples: phase.validSamples, persistedValidSamples: persisted.validSamples,
    originalUnavailableSamples: phase.unavailableSamples, persistedUnavailableSamples: persisted.unavailableSamples, peaksEqual };
});
assert.ok(phaseComparisons.every(row => row.peaksEqual));
const identities = [...raw.nativeMemory.identities, ...raw.ownedLaunches.map(row => row.identity), terminal.driverIdentity,
  supervisor.supervisorIdentity, supervisor.childIdentity, checkpoint.identities.monitor];
const unique = [...new Map(identities.map(identity => [`${identity.pid}:${Date.parse(identity.createdAt)}`, identity])).values()];
const script = "$ErrorActionPreference='Stop'; $ownedPids=" + [...new Set(unique.map(row => row.pid))].join(",") +
  "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$ownedPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
  { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout), ownedExitChecks = unique.map(identity => {
  const process = current.find(row => row.pid === identity.pid) ?? null;
  assert.ok(process === null || Math.abs(Date.parse(process.createdAt) - Date.parse(identity.createdAt)) >= 1, "Never clean under a birth-qualified owned process");
  return { identity: { pid: identity.pid, parentPid: identity.parentPid, createdAt: identity.createdAt }, current: process, ownedBirthAbsent: true };
});
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const originalHash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) originalHash.update(chunk);
assert.equal(originalHash.digest("hex"), terminal.protectedAfter.sha256);
const checkpointArchive = `outputs/reports/${stamp}-durable-full-final-native-checkpoint.json.gz`, compressed = gzipSync(checkpointBytes, { level: 9 });
assert.deepEqual(gunzipSync(compressed), checkpointBytes); await writeFile(path.join(root, checkpointArchive), compressed, { flag: "wx" });
assert.equal(sha(await read(checkpointArchive)), sha(compressed));
const checkpointIdentity = await lstat(checkpointPath, { bigint: true }); assert.ok(checkpointIdentity.isFile() && !checkpointIdentity.isSymbolicLink());
assert.equal(sha(await readFile(checkpointPath)), sha(checkpointBytes)); await unlink(checkpointPath);
await assert.rejects(access(checkpointPath), { code: "ENOENT" });
const proof = { recordedAt: new Date().toISOString(), status: "actual-full-original-failed-asyncify-input-allocation-independently-verified",
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, supervisor: { path: supervisorPath, sha256: sha(supervisorBytes) }, rawArchive: record,
  sourceArchive: terminal.sourceArchive, sourceCount: 346, allCurrentPrePostExecutedSourcesJoined: true,
  requestedRuns: 3, completedValidatedConversions: 0, independentFullFidelityValidation: null,
  elapsedMs: run.state.metrics.elapsedMs, outputBytesBeforeOwnedDeletion: run.state.metrics.outputBytes,
  lastRecordedBridge: raw.splitFinalSamples.at(-1), failedHeapExtentBytes: 33624064,
  failedIndividualAllocationBytes: null, liveHeapBytes: null, fragmentationCauseProven: false,
  allocationPath: "actual Asyncify.allocateData -> builtin malloc during __asyncjs__within_input_read, not a qualified AVBuffer/pool slot",
  failureRecord: failure, failedWindowMemory: { formula: raw.formula, baselinePrivateBytes: raw.blankBaseline.privateBytes,
    peakPrivateBytes: run.peakPrivateBytes, incrementalPrivateMiB: incremental, conversionValidSamples: active.validSamples,
    conversionUnavailableSamples: active.unavailableSamples, nativeSequence: raw.nativeMemory.sequence,
    startupUnavailableSamples: raw.nativeMemory.phases.find(row => row.phase === "blank-startup-settle").unavailableSamples, acceptance: false },
  durableCheckpoint: { path: checkpointArchive, bytes: compressed.length, sha256: sha(compressed), restoredBytes: checkpointBytes.length, restoredSha256: sha(checkpointBytes),
    rawRemovedAfterLosslessArchive: true, exactBaselinePreserved: true, allPhasePeaksMatchOriginal: true, phaseComparisons },
  ownedExitChecks, cleanup: raw.cleanup, supervisorRuntimeRemoved: true, protectedOriginal: terminal.protectedAfter,
  publicAcceptance: false, originalFullSourceAcceptance: false, completeChromiumMemoryAcceptance: false, speedupProven: false,
  noConversionRelaunched: true, noProcessesKilled: true, nextAction: "Inspect actual generated Asyncify allocation size/lifetime and qualify bounded reusable suspension storage before any full-original rerun" };
const own = "scripts/analyze-durable-packet-cache-full-terminal.mjs", ownBytes = await read(own);
proof.ownSource = { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") };
const output = `evidence/${stamp}-durable-full-terminal-analysis.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, failedWindowIncrementalMiB: incremental, completedValidatedConversions: 0,
  partialOutputBytesDeleted: run.state.metrics.outputBytes, allPhasePeaksMatchOriginal: true, ownedBirthsAbsent: unique.length }));
