// Read the actual failed run. Never relaunch or treat supervisor exit0 as pass.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/asyncify-storage-layered-source-archive.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = "2026-10-12T14-43-54-627Z", read = file => readFile(path.join(root, file));
const terminalPath = `evidence/${stamp}-asyncify-storage-original-full-terminal.json`, terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
assert.equal(terminal.candidate.actualExitCode, 1); assert.equal(terminal.candidate.status, "failed"); assert.equal(terminal.candidate.completedConversions, 0);
assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter); assert.equal(terminal.productionRestored, true);
const record = terminal.candidate.compressedReport, zipped = await read(record.path);
assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
const rawBytes = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(rawBytes.length, record.restoredBytes); assert.equal(sha(rawBytes), record.restoredSha256);
const raw = JSON.parse(rawBytes), run = raw.runs[0]; assert.equal(raw.runs.length, 1); assert.equal(run.state.jobState, "error");
assert.equal(run.independentValidation, null); assert.equal(raw.requestedRuns, 3); assert.equal(raw.limitMiB, 250);
assert.ok(run.state.error.includes("network error") && run.state.error.includes("Read error") && run.state.error.includes("I/O error"));
assert.deepEqual(raw.abortDiagnostic.records, []); assert.equal(raw.abortDiagnostic.captureError, null); assert.deepEqual(raw.forbiddenRequests, []);
const lifecycle = raw.asyncifyStorageFinalSamples; assert.equal(lifecycle.length, 1);
assert.equal(lifecycle[0].allocations, 1); assert.equal(lifecycle[0].frees, 1); assert.equal(lifecycle[0].acquisitions, 30199);
assert.equal(lifecycle[0].activeLeases, 0); assert.equal(lifecycle[0].retainedBytes, 0); assert.equal(lifecycle[0].abortedReleaseDeferredUntilWorkerTermination, false);
assert.equal(run.state.metrics.outputBytes, 4106849675); assert.equal(run.state.metrics.elapsedMs, 10609542.385000002);
assert.equal(raw.splitFinalSamples[0].frames, 218892); assert.equal(raw.splitFinalSamples[0].completedPackets, 218892);
assert.equal(run.state.metrics.peakWasmMemoryBytes, 50331648); assert.equal(run.state.metrics.queuedBytes, 0); assert.equal(run.state.metrics.pendingOperations, 0);
assert.equal(raw.formula, "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory");
assert.equal(raw.blankBaseline.privateBytes, 242892800); assert.equal(run.peakPrivateBytes, 485113856);
const incremental = (run.peakPrivateBytes - raw.blankBaseline.privateBytes) / 1048576;
assert.equal(incremental, 231); assert.equal(incremental, run.incrementalPrivateMiB);
const active = raw.nativeMemory.phases.find(row => row.phase === "conversion-1"); assert.equal(active.validSamples, 95714); assert.equal(active.unavailableSamples, 22);
assert.equal(raw.nativeMemory.sequence, 98703); assert.equal(raw.nativeMemory.error, null);
assert.equal(raw.nativeMemory.receiptClockFence.samplesDropped, 0); assert.equal(raw.nativeMemory.receiptClockFence.timestampsRewritten, 0);
assert.equal(raw.nativeMemory.receiptClockFence.monitorClosed, true);
const archive = await materializeLayeredFullSourceArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(archive.sourcePreimages).length, 365); assert.deepEqual(archive.sourcePins, terminal.sourcePins);
assert.deepEqual(raw.sourceHashes, terminal.sourcePins); assert.deepEqual(terminal.postSourcePins, terminal.sourcePins);
for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(raw.cleanup[field], true);
for (const directory of [terminal.wrapper, terminal.candidateDirectory, raw.runtimeDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
const supervisorPath = "evidence/2026-10-12T14-43-53-794Z-asyncify-storage-supervisor-full.json", supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
assert.equal(supervisor.childExit.code, 0); assert.equal(supervisor.status, "command-completed-not-conversion-acceptance"); assert.equal(supervisor.runtimeRemoved, true);
await assert.rejects(access(supervisor.runtimeDirectory), { code: "ENOENT" });
const checkpointPath = raw.nativeMemory.durableCheckpoint.file; assert.equal(path.dirname(checkpointPath), path.join(root, "outputs/reports"));
const checkpointBytes = await readFile(checkpointPath), checkpoint = JSON.parse(checkpointBytes);
assert.ok(checkpointBytes.length <= 2097152); assert.equal(checkpoint.status, "observer-closed-not-conversion-acceptance");
assert.equal(checkpoint.coverageThroughSequence, 98703); assert.deepEqual(checkpoint.baseline, raw.blankBaseline);
const phases = raw.nativeMemory.phases.map(row => {
  const persisted = checkpoint.native.phases.find(value => value.phase === row.phase); assert.ok(persisted);
  assert.deepEqual(persisted.peak, row.peak); assert.deepEqual(persisted.rssPeak, row.rssPeak);
  assert.equal(persisted.validSamples, row.validSamples); assert.equal(persisted.unavailableSamples, row.unavailableSamples);
  return { phase: row.phase, validSamples: row.validSamples, unavailableSamples: row.unavailableSamples, peaksEqual: true };
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
const checkpointArchive = `outputs/reports/${stamp}-asyncify-storage-final-native-checkpoint.json.gz`, compressed = gzipSync(checkpointBytes, { level: 9 });
assert.deepEqual(gunzipSync(compressed), checkpointBytes); await writeFile(path.join(root, checkpointArchive), compressed, { flag: "wx" });
assert.equal(sha(await read(checkpointArchive)), sha(compressed));
const info = await lstat(checkpointPath, { bigint: true }); assert.ok(info.isFile() && !info.isSymbolicLink());
assert.equal(sha(await readFile(checkpointPath)), sha(checkpointBytes)); await unlink(checkpointPath);
await assert.rejects(access(checkpointPath), { code: "ENOENT" });
const own = "scripts/analyze-asyncify-storage-full-terminal.mjs", ownBytes = await read(own);
const proof = { recordedAt: new Date().toISOString(), status: "actual-full-original-failed-input-io-storage-reuse-cleanly-closed-not-acceptance",
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, supervisor: { path: supervisorPath, sha256: sha(supervisorBytes) },
  rawArchive: record, sourceArchive: terminal.sourceArchive, sourceCount: 365, allExecutedPrePostCurrentSourcesJoined: true,
  requestedRuns: 3, completedValidatedConversions: 0, independentFullFidelityValidation: null,
  elapsedMs: run.state.metrics.elapsedMs, partialOutputBytesDeleted: run.state.metrics.outputBytes, lastBridge: raw.splitFinalSamples[0], suspensionLifecycle: lifecycle[0],
  inputFailure: { retainedMessage: run.state.error, nativeAbortRecords: 0, exceptionName: null, exceptionCode: null, exceptionStack: null,
    exactFailedReadOffset: null, underlyingChromiumOrFilesystemCause: null, originalAsyncifyFailureBoundaryReached: false,
    limits: "Generic message only: cannot identify filesystem lock, stale snapshot, renderer pressure or actual network activity.30199 reusable leases are real, but this earlier failure does not prove survival at the previous244859-frame OOM boundary." },
  failedWindowMemory: { formula: raw.formula, baselinePrivateBytes: raw.blankBaseline.privateBytes, peakPrivateBytes: run.peakPrivateBytes,
    incrementalPrivateMiB: incremental, validConversionSamples: active.validSamples, unavailableConversionSamples: active.unavailableSamples,
    nativeSequence: raw.nativeMemory.sequence, acceptance: false },
  durableCheckpoint: { path: checkpointArchive, bytes: compressed.length, sha256: sha(compressed), restoredBytes: checkpointBytes.length,
    restoredSha256: sha(checkpointBytes), rawRemovedAfterLosslessArchive: true, baselineAndAllPhasePeaksPreserved: true, phases },
  ownedBirthExitChecks: checks, cleanup: raw.cleanup, protectedOriginal: terminal.protectedAfter,
  noConversionRelaunched: true, noProcessesKilled: true, fullOriginalAcceptance: false, completeChromiumMemoryAcceptance: false, speedGainProven: false, publicAcceptance: false,
  nextAction: "Qualify bounded input-read error attribution (type/code/stack/exact requested offset/count; no payload or filename) and investigate long-lived BYOB stream lifecycle before another full run. Do not blindly retry generic network errors, alter fidelity/heaps, or infer the prior OOM fixed.",
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
const output = `evidence/${stamp}-asyncify-storage-full-terminal-analysis.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, elapsedMs: proof.elapsedMs, partialOutputBytesDeleted: proof.partialOutputBytesDeleted,
  failedWindowMiB: incremental, actualReuseCount: lifecycle[0].acquisitions, ownedBirthsAbsent: checks.length }));
