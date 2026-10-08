// Independent post-terminal analysis. Never rerun conversion or change its gates.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { summarizeJsAllocation } from "./lib/bounded-js-allocation.mjs";
import { verifyJsProbeIdentityAbsence } from "./lib/js-probe-identity-cleanup.mjs";
import { compareRealProgressDiagnostics } from "./lib/real-progress-comparison.mjs";
const root = path.resolve(import.meta.dirname, ".."), MiB = 1024 ** 2;
assert.equal(process.argv.length, 3); assert.match(process.argv[2], /^evidence\/[0-9TZ-]+-stable-ui-real-progress\.json$/);
async function bounded(file, maximumBytes) {
  const full = path.resolve(root, file); assert.ok(full.startsWith(root + path.sep));
  const identity = await lstat(full); assert.ok(identity.isFile() && !identity.isSymbolicLink() && identity.size <= maximumBytes);
  assert.equal(await realpath(full), full); return readFile(full);
}
const receiptBytes = await bounded(process.argv[2], 2 * MiB), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.status, "paired-real-progress-diagnostic-returned-independent-analysis-pending"); assert.equal(receipt.failure, null);
assert.equal(receipt.executions.length, 2); assert.equal(receipt.productionRestored, true);
assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
for (const [file, digest] of Object.entries(receipt.sourcePins)) assert.equal(sha(await bounded(file, 2 * MiB)), digest, file);
const reports = [], profileFacts = [], nativeFacts = [], identities = [];
for (const run of receipt.executions) {
  assert.equal(run.actualExitCode, 1); assert.equal(run.rawStatus, "failed"); assert.equal(run.rawRemovedAfterLosslessArchive, true);
  await assert.rejects(access(path.resolve(root, run.rawReport.path)), { code: "ENOENT" });
  const compressed = await bounded(run.compressedReport.path, 32 * MiB); assert.equal(sha(compressed), run.compressedReport.sha256);
  const rawBytes = gunzipSync(compressed, { maxOutputLength: 32 * MiB }); assert.equal(sha(rawBytes), run.rawReport.sha256); assert.equal(rawBytes.length, run.rawReport.bytes);
  const raw = JSON.parse(rawBytes); reports.push(raw);
  assert.equal(raw.status, "failed"); assert.equal(raw.runs.length, 1); assert.equal(raw.runs[0].independentValidation, null);
  assert.match(raw.failure.message, /cancelled[\s\S]*complete/); assert.equal(raw.runs[0].state.jobState, "cancelled");
  assert.equal(raw.source.bytes, 2958573265); assert.equal(raw.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(raw.source.probe.streams[0].width, 1920); assert.equal(raw.source.probe.streams[0].height, 804);
  assert.equal(raw.limitMiB, 250); assert.equal(raw.requestedRuns, 3);
  assert.equal(raw.startupSettlement.minimumMs, 300000); assert.ok(raw.startupSettlement.actualMs >= 300000);
  assert.ok(raw.blankBaseline.privateBytes <= raw.startupSettlement.earlyWindow.privateBytes);
  const m = raw.runs[0].state.metrics; assert.equal(m.wasmMemoryBytes, 50331648); assert.equal(m.peakWasmMemoryBytes, 50331648);
  assert.ok(m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 65536 && m.peakQueuedBytes <= 65536);
  assert.equal(m.peakPendingOperations, 1); assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0);
  assert.equal(raw.nativeMemory.error, null);
  const phases = raw.nativeMemory.phases.filter(row => /^pre-conversion-|^conversion-/.test(row.phase));
  const peak = phases.map(row => row.peak).filter(Boolean).sort((a, b) => b[3] - a[3])[0]; assert.ok(peak);
  assert.equal(peak[7].reduce((sum, process) => sum + process[1], 0), peak[3]);
  const actualPeakBytes = Math.max(peak[3], raw.runs[0].cimPeakPrivateBytes ?? -Infinity);
  const actualIncrementalMiB = (actualPeakBytes - raw.blankBaseline.privateBytes) / MiB;
  nativeFacts.push({ mode: run.mode, blankPrivateBytes: raw.blankBaseline.privateBytes, actualPeakPrivateBytes: actualPeakBytes,
    observedIncrementalPrivateMiB: actualIncrementalMiB, lastLoopReportedIncrementalMiB: raw.runs[0].incrementalPrivateMiB,
    latePhasePeaksIncluded: true, phaseCoverage: phases.map(p => ({ phase: p.phase, validSamples: p.validSamples, unavailableSamples: p.unavailableSamples })),
    primaryMemoryAcceptance: false });
  identities.push(...raw.nativeMemory.identities);
  assert.deepEqual(raw.forbiddenRequests, []); assert.deepEqual(raw.conversionJsReport.errors, []);
  const archive = await bounded(run.sourceArchive.path, MiB); assert.equal(sha(archive), run.sourceArchive.sha256);
  const generated = JSON.parse(gunzipSync(archive, { maxOutputLength: MiB }));
  assert.equal(sha(generated.generated), run.sourceArchive.driverSha256); assert.equal(sha(generated.traceHelper), run.sourceArchive.traceHelperSha256);
  for (const anchor of ['"--headless=new"', "minimumMs: 300000", "run.incrementalPrivateMiB <= 250", 'assert.equal(run.state.jobState, "complete"', "conversion-js-allocation-duration-bound.mjs", "Performance.getMetrics"])
    assert.ok(generated.generated.includes(anchor), anchor);
  const records = raw.conversionJsReport.records; assert.equal(records.length, 4);
  for (const record of records) {
    const compressedProfile = await bounded(record.archive.path, MiB); assert.equal(sha(compressedProfile), record.archive.sha256);
    const bytes = gunzipSync(compressedProfile, { maxOutputLength: MiB }); assert.equal(sha(bytes), record.archive.restoredSha256);
    const value = JSON.parse(bytes), summary = summarizeJsAllocation({ profile: value.profile }); assert.deepEqual(summary, value.summary);
    delete summary.topCallsites; assert.deepEqual(summary, record.summary); assert.deepEqual(value.state, record.state);
    assert.deepEqual(value.bundleBindings, record.bundleBindings);
    for (const binding of record.bundleBindings) if (binding.servedSha256 !== null)
      assert.ok(raw.conversionJsReport.servedScripts.some(script => script.sha256 === binding.servedSha256 && script.actualServedBytesCaptured));
  }
  profileFacts.push({ mode: run.mode, records: records.length, maximumSamplingMs: raw.conversionJsReport.maximumSamplingMs,
    durationStop: raw.conversionJsReport.durationStop, stoppedSummary: raw.conversionJsReport.stoppedSummary, servedScripts: raw.conversionJsReport.servedScripts });
  for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(raw.cleanup[field], true);
  await assert.rejects(access(raw.runtimeDirectory), { code: "ENOENT" });
}
const comparison = compareRealProgressDiagnostics(reports[0], reports[1]);
const ids = [...new Set(identities.map(row => row.pid))]; assert.ok(ids.length > 0 && ids.length <= 128);
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; $progressPairIds=@(${ids.join(",")}); ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$progressPairIds -contains [int]$_.ProcessId} | ForEach-Object {[pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=([datetime]$_.CreationDate).ToUniversalTime().ToString('o')}}) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 262144 });
const cleanupIdentities = verifyJsProbeIdentityAbsence(identities, JSON.parse(stdout));
const protectedFile = path.join(root, "test.mkv"); assert.equal((await stat(protectedFile)).size, 2958573265);
const hash = createHash("sha256"); for await (const chunk of createReadStream(protectedFile, { highWaterMark: MiB })) hash.update(chunk);
assert.equal(hash.digest("hex"), "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const proof = { recordedAt: new Date().toISOString(), status: "verified-paired-real-progress-instrumented-diagnostic-not-acceptance",
  executionReceipt: { path: process.argv[2], bytes: receiptBytes.length, sha256: sha(receiptBytes) },
  verifier: { path: "scripts/analyze-stable-ui-real-progress.mjs", sha256: sha(await bounded("scripts/analyze-stable-ui-real-progress.mjs", MiB)) },
  comparisonHelper: { path: "scripts/lib/real-progress-comparison.mjs", sha256: sha(await bounded("scripts/lib/real-progress-comparison.mjs", MiB)) },
  comparison, nativeFacts, profileFacts, cleanupIdentities, protectedFullPostHashVerified: true,
  conversionsCompleted: 0, nativeAllocationCauseProven: false, repeatabilityAccepted: false,
  conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false, publicAcceptance: false };
const proofPath = process.argv[2].replace(/\.json$/, "-analysis.json"), bytes = JSON.stringify(proof, null, 2) + "\n";
assert.ok(Buffer.byteLength(bytes) < MiB); await writeFile(path.join(root, proofPath), bytes, { flag: "wx" });
console.log(JSON.stringify({ proofPath, status: proof.status, allocations: comparison.allocations, pageCpu: comparison.pageThreadCpuSeconds, nativeFacts }));
