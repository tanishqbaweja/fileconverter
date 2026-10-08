// Verify this terminal diagnostic without repeating conversion or claiming a fix.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { summarizeJsAllocation } from "./lib/bounded-js-allocation.mjs";
import { verifyJsProbeIdentityAbsence } from "./lib/js-probe-identity-cleanup.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.argv.length, 3); assert.equal(process.argv[2], "evidence/2026-10-08T12-49-20-004Z-mpeg2-js-progress-receipt.json");
async function bounded(file, cap) {
  const full = path.resolve(root, file); assert.ok(full.startsWith(root + path.sep));
  const identity = await lstat(full, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink() && identity.size <= BigInt(cap));
  assert.equal(await realpath(full), full); const bytes = await readFile(full); assert.equal(bytes.length, Number(identity.size));
  return { full, bytes, identity };
}
const receiptInput = await bounded(process.argv[2], 262144), receipt = JSON.parse(receiptInput.bytes);
assert.equal(receipt.rawStatus, "failed"); assert.equal(receipt.completeOriginalConversions, 0);
assert.equal(receipt.driverRuntimeRemoved, true); assert.equal(receipt.sourcePinsUnchanged, true);
for (const [file, digest] of Object.entries(receipt.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
const input = await bounded(receipt.rawReport.path, 32 * 1024 ** 2), raw = JSON.parse(input.bytes);
assert.equal(input.bytes.length, receipt.rawReport.bytes); assert.equal(sha(input.bytes), receipt.rawReport.sha256);
for (const [file, digest] of Object.entries(raw.sourceHashes)) assert.equal(receipt.sourcePins[file], digest, file);
assert.equal(raw.status, "failed"); assert.equal(raw.runs.length, 1); assert.equal(raw.runs[0].state.jobState, "cancelled");
assert.match(raw.failure.message, /cancelled[\s\S]*complete/); assert.deepEqual(raw.forbiddenRequests, []);
assert.equal(raw.limitMiB, 250); assert.equal(raw.requestedRuns, 3); assert.equal(raw.nativeMemory.error, null);
assert.equal(raw.startupSettlement.minimumMs, 300000); assert.ok(raw.startupSettlement.actualMs >= 300000);
assert.ok(raw.blankBaseline.privateBytes <= raw.startupSettlement.earlyWindow.privateBytes);
assert.deepEqual(raw.conversionJsReport, receipt.conversionJsReport); assert.deepEqual(raw.conversionJsReport.errors, []);
assert.equal(raw.conversionJsReport.stopped, true); assert.equal(raw.nativeFailureCapture.firstFailure, null);
const phases = raw.nativeMemory.phases.filter(row => /^pre-conversion-|^conversion-/.test(row.phase));
const peak = phases.map(row => row.peak).filter(Boolean).sort((a, b) => b[3] - a[3])[0];
assert.ok(peak && phases.every(row => row.validSamples > 0 && row.unavailableSamples === 0));
assert.equal(peak[7].reduce((sum, row) => sum + row[1], 0), peak[3]);
const incrementalPrivateMiB = (peak[3] - raw.blankBaseline.privateBytes) / 1048576;
assert.equal(incrementalPrivateMiB, raw.runs[0].incrementalPrivateMiB); assert.equal(incrementalPrivateMiB, 211.859375);
assert.equal(raw.runs[0].state.metrics.outputBytes, 75014957); assert.equal(raw.runs[0].state.metrics.inputBytes, 66771171);
assert.equal(raw.runs[0].state.metrics.wasmMemoryBytes, 50331648);
assert.equal(raw.runs[0].state.metrics.maxReadChunkBytes, 65536); assert.equal(raw.runs[0].state.metrics.maxWriteChunkBytes, 65536);
assert.equal(raw.runs[0].state.metrics.peakPendingOperations, 1); assert.equal(raw.runs[0].state.metrics.pendingOperations, 0);
assert.equal(raw.runs[0].state.metrics.queuedBytes, 0);
const generatedInput = await bounded(receipt.generatedSourcesArchive.path, 1048576);
assert.equal(sha(generatedInput.bytes), receipt.generatedSourcesArchive.sha256);
const generatedBytes = gunzipSync(generatedInput.bytes, { maxOutputLength: 1048576 });
assert.equal(sha(generatedBytes), receipt.generatedSourcesArchive.restoredSha256);
const generated = JSON.parse(generatedBytes);
assert.equal(sha(generated.generated), receipt.generatedSourceSha256); assert.equal(sha(generated.traceHelper), receipt.generatedTraceHelperSha256);
for (const text of ["minimumMs: 300000", "run.incrementalPrivateMiB <= 250", "failureBeforeCancellation", "for (let number = 1; number <= 3; number++)"])
  assert.ok(generated.generated.includes(text), text);
const records = raw.conversionJsReport.records;
assert.deepEqual(records.map(row => row.phase), ["before-real-conversion", "output-1048576", "output-8388608", "output-16777216"]);
for (const record of records) {
  assert.equal(record.status, "captured"); const archive = await bounded(record.archive.path, 1048576);
  assert.equal(sha(archive.bytes), record.archive.sha256);
  const bytes = gunzipSync(archive.bytes, { maxOutputLength: 1048576 }); assert.equal(sha(bytes), record.archive.restoredSha256);
  const value = JSON.parse(bytes), summary = summarizeJsAllocation({ profile: value.profile });
  assert.deepEqual(value.summary, summary); delete summary.topCallsites; assert.deepEqual(record.summary, summary);
  assert.deepEqual(record.state, value.state); assert.deepEqual(record.bundleBindings, value.bundleBindings);
  if (record.phase !== "before-real-conversion") assert.equal(record.state.jobState, "running");
  for (const binding of record.bundleBindings) if (binding.servedSha256 !== null)
    assert.ok(raw.conversionJsReport.servedScripts.some(script => script.sha256 === binding.servedSha256 && script.actualServedBytesCaptured));
}
assert.equal(raw.conversionJsReport.servedScripts.length, 2);
const originalIdentities = raw.nativeMemory.identities;
const helpers = [{ pid: 34252, parentPid: 46364, createdAt: "2026-10-08T12:49:19.9064780Z" },
  { pid: 39260, parentPid: 34252, createdAt: "2026-10-08T12:49:19.9484980Z" },
  { pid: 45996, parentPid: 39260, createdAt: "2026-10-08T12:49:24.5021030Z" },
  { pid: 46816, parentPid: 39260, createdAt: "2026-10-08T12:49:26.7744920Z" }];
const identities = [...originalIdentities, ...helpers], ids = [...new Set(identities.map(row => row.pid))];
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; $progressTerminalIds=@(${ids.join(",")}); @(Get-CimInstance Win32_Process | Where-Object {$progressTerminalIds -contains [int]$_.ProcessId} | ForEach-Object {[pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=([datetime]$_.CreationDate).ToUniversalTime().ToString('o')}}) | ConvertTo-Json -Compress`],
{ timeout: 15000, maxBuffer: 262144, windowsHide: true });
const current = stdout.trim() ? JSON.parse(stdout) : [], cleanupIdentities = verifyJsProbeIdentityAbsence(identities, Array.isArray(current) ? current : [current]);
const directories = [raw.runtimeDirectory, receipt.driverRuntimeDirectory, path.join(root, "work/mpeg2-js-launch-wrapper-Ga71bv")];
for (const directory of directories) { assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" }); }
for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(raw.cleanup[field], true);
const fixture = path.join(root, "test.mkv"); assert.equal((await stat(fixture)).size, 2958573265);
const hash = createHash("sha256"); for await (const chunk of createReadStream(fixture, { highWaterMark: 1048576 })) hash.update(chunk);
assert.equal(hash.digest("hex"), "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const compressed = gzipSync(input.bytes, { level: 9 }), compressedPath = `${receipt.rawReport.path}.gz`;
await writeFile(path.join(root, compressedPath), compressed, { flag: "wx" });
const checked = await bounded(compressedPath, 32 * 1024 ** 2);
assert.deepEqual(gunzipSync(checked.bytes, { maxOutputLength: 32 * 1024 ** 2 }), input.bytes);
const currentIdentity = await lstat(input.full, { bigint: true });
for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(currentIdentity[key], input.identity[key]);
assert.equal(await realpath(input.full), input.full); assert.equal(sha(await readFile(input.full)), receipt.rawReport.sha256);
const proof = { recordedAt: new Date().toISOString(), status: "verified-safety-cancelled-real-progress-diagnostic-not-acceptance",
  verifier: { path: "scripts/analyze-mpeg2-js-progress-terminal.mjs", sha256: sha(await readFile(path.join(root, "scripts/analyze-mpeg2-js-progress-terminal.mjs"))) },
  receipt: { path: process.argv[2], sha256: sha(receiptInput.bytes) }, sourcePins: receipt.sourcePins,
  originalReport: receipt.rawReport, compressedReport: { path: compressedPath, bytes: compressed.length, sha256: sha(compressed),
    restoredBytes: input.bytes.length, restoredSha256: sha(input.bytes) },
  generatedSourcesArchive: receipt.generatedSourcesArchive, generatedSourceSha256: receipt.generatedSourceSha256,
  generatedTraceHelperSha256: receipt.generatedTraceHelperSha256, browserVersion: raw.browserVersion, host: receipt.host,
  sourceBytes: 2958573265, sourceSha256: raw.source.sha256, independentFullPostHashVerified: true,
  formula: raw.formula, limitMiB: 250, requestedRuns: 3, blankBaseline: raw.blankBaseline, loadedIdle: raw.loadedIdle,
  observedPeakPrivateBytes: peak[3], observedIncrementalPrivateMiB: incrementalPrivateMiB, nativePhaseCoverage: phases.map(row =>
    ({ phase: row.phase, validSamples: row.validSamples, unavailableSamples: row.unavailableSamples })),
  partialMetrics: raw.runs[0].state.metrics, terminalJobState: "cancelled", ordinaryProductionCancellationConfirmed: true,
  cancellationReason: "Manual diagnostic safety stop: fixed saved-profile count did not bound lifetime of collected JS allocation history; no native budget failure occurred",
  records, servedScripts: raw.conversionJsReport.servedScripts, stoppedProfileSummary: raw.conversionJsReport.stoppedSummary,
  nativeFailureOccurred: false, preCancellationFailureProfileCaptured: false, profilerLifetimeAcceptance: false,
  samplerLifetimeFix: "scripts/lib/conversion-js-allocation-duration-bound.mjs", durationFixedAtMs: 90000,
  durationFixBrowserExecuted: false, cleanup: raw.cleanup, cleanupIdentities, runtimeDirectoriesAbsent: directories,
  partialMediaRemoved: true, rawRemovedAfterVerifiedLosslessCompression: true, bytesSaved: input.bytes.length - compressed.length,
  conversionsCompleted: 0, completeOutputIndependentlyValidated: false, repeatabilityAccepted: false,
  nativeAllocationCauseProven: false, forcedGcUsed: false, primaryMemoryAcceptance: false, speedAcceptance: false, publicAcceptance: false,
  next: "No unchanged original/idle profiler replay. Reduce actually sampled repeated unchanged source/capability/selector/stream-plan UI allocation with exact markup/interaction/fidelity tests; use the duration-bounded profiler if a changed diagnostic is needed." };
const target = path.join(root, "evidence/mpeg2-js-progress-terminal-2026-10-08.json"), bytes = JSON.stringify(proof, null, 2) + "\n";
assert.ok(Buffer.byteLength(bytes) < 131072); await assert.rejects(access(target), { code: "ENOENT" });
await unlink(input.full); await assert.rejects(access(input.full), { code: "ENOENT" });
await writeFile(target, bytes, { flag: "wx" });
console.log(JSON.stringify({ target, status: proof.status, incrementalPrivateMiB, partialOutputBytes: proof.partialMetrics.outputBytes,
  compressedBytes: compressed.length, bytesSaved: proof.bytesSaved, originalIdentitiesAbsent: cleanupIdentities.originalIdentityCount, records: records.length }));
