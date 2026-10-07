// Read-only analysis of ONE terminal attempt. Never launches/retries a converter.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const input = "evidence/mpeg2-flex-original-2026-10-07.json";
assert.ok((await stat(path.join(root, input))).size < 4 * MiB);
const bytes = await readFile(path.join(root, input)), proof = JSON.parse(bytes);
assert.equal(proof.rawStatus, "failed"); assert.equal(proof.completeOriginalConversions, 0);
assert.equal(proof.threeRepeatPrivateSessionPassed, false); assert.equal(proof.publicAcceptance, false);
assert.equal(proof.nativeObserverError, null); assert.deepEqual(proof.forbiddenRequests, []);
assert.match(proof.failure.message, /Cannot enlarge memory arrays to size 33587200 bytes \(OOM\)/);
assert.equal(sha(proof.generatedSource), proof.generatedSourceSha256);
for (const [file, hash] of Object.entries(proof.sourcePins))
  assert.equal(sha(await readFile(path.join(root, file))), hash, file);
const rawPath = path.resolve(root, proof.rawReport.path);
assert.ok(rawPath.startsWith(path.join(root, "outputs/reports") + path.sep));
assert.ok((await stat(rawPath)).size <= 32 * MiB);
const raw = await readFile(rawPath);
assert.equal(raw.length, proof.rawReport.bytes); assert.equal(sha(raw), proof.rawReport.sha256);
const original = JSON.parse(raw), peak = proof.nativePeak;
assert.equal(peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), peak.privateBytes);
assert.equal((peak.privateBytes - proof.blankBaseline.privateBytes) / MiB, proof.nativePeakIncrementalMiB);
assert.equal(proof.nativePeakIncrementalMiB, 249.4453125);
assert.equal(proof.nativeFailureCapture.firstFailure, null);
assert.equal(proof.nativeFailureCapture.callback, null);
assert.equal(proof.nativeFailureCapture.additionalOverBudgetSamples, 0);
assert.equal(proof.nativeFailureCapture.unavailableSamples, 0);
assert.equal(proof.requestedRuns, 3); assert.equal(proof.runs.length, 1);
assert.equal(proof.runs[0].state.jobState, "error"); assert.equal(proof.runs[0].independentValidation, null);
const final = proof.splitFinalSamples[0], metrics = proof.boundedDomRows.at(-1).metrics;
assert.equal(final.decoderMemoryBytes, 32 * MiB); assert.equal(final.encoderMemoryBytes, 16 * MiB);
assert.equal(final.frames, 106112); assert.equal(final.packets, 106112); assert.equal(final.completedPackets, 106112);
for (const key of ["activePackets", "queuedPackets", "queuedFrames", "additionalPixelBufferBytes", "additionalJsPacketBufferBytes"])
  assert.equal(final[key], 0);
assert.equal(final.closed, true);
for (const key of ["queuedBytes", "pendingOperations"]) assert.equal(metrics[key], 0);
for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.equal(metrics[key], 65536);
assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.wasmMemoryBytes, 48 * MiB);
assert.ok(proof.boundedDomRows.length <= 1024);
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(proof.cleanup[key], true);
assert.equal(proof.cleanup.conversionQuiescence.terminalState, "error");
assert.equal(proof.cleanup.chromeRootExitObservation.status, "owned-identity-absent");
for (const dir of [proof.runtimeDirectory, proof.generatedRuntimeDirectory]) {
  const absolute = path.resolve(root, dir);
  assert.ok(absolute.startsWith(path.join(root, "work") + path.sep));
  await assert.rejects(access(absolute), { code: "ENOENT" });
}
const identities = proof.sampledNativeIdentities;
assert.ok(identities.length > 0 && identities.length <= 512);
const helpers = [
  { pid: 43704, parentPid: 27076, createdAt: "2026-10-07T12:12:37.8984200Z" },
  { pid: 27076, createdAt: "2026-10-07T12:12:37.8560970Z" },
  { pid: 9512, parentPid: 43704, createdAt: "2026-10-07T12:12:47.7879370Z" },
  { pid: 41000, parentPid: 43704, createdAt: "2026-10-07T12:12:45.3093630Z" },
];
const pids = [...new Set([...identities.map(p => p.pid), ...helpers.map(p => p.pid), ...Object.values(proof.ownedPids)])];
for (const pid of pids) assert.ok(Number.isSafeInteger(pid) && pid > 0);
const query = pids.map(pid => `ProcessId = ${pid}`).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{ pid = $_.ProcessId; parentPid = $_.ParentProcessId; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout), oldIdentities = [...identities, ...helpers];
assert.deepEqual(current.filter(p => oldIdentities.some(old => old.pid === p.pid &&
  (old.parentPid === undefined || old.parentPid === p.parentPid) &&
  microsecondBirth(old.createdAt) === microsecondBirth(p.createdAt))), [], "Original owned births must be absent; reused PIDs are not old processes");
const restoredAssets = {};
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  const hash = sha(await readFile(path.join(root, "public/engines/remux", file)));
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux", file))), hash);
  restoredAssets[file] = hash;
}
const privateAssetsAbsent = ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"];
for (const file of privateAssetsAbsent) await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
assert.equal((await stat(path.join(root, "test.mkv"))).size, proof.source.bytes);
const sourceHash = createHash("sha256");
for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: MiB })) sourceHash.update(chunk);
assert.equal(sourceHash.digest("hex"), proof.source.sha256);
const retainedCounters = proof.boundedDomRows.filter(row => row.dom.unavailable === null);
const counterRange = key => {
  const values = retainedCounters.map(row => row.dom[key]).filter(Number.isSafeInteger);
  return { count: values.length, minimum: values.length ? Math.min(...values) : null, maximum: values.length ? Math.max(...values) : null };
};
const analysis = { recordedAt: new Date().toISOString(), status: "terminal-readonly-flex-original-heap-oom-analysis-not-acceptance",
  input: { path: input, bytes: bytes.length, sha256: sha(bytes) }, rawReportVerified: true, allExecutedSourcesVerified: true,
  rawStatus: proof.rawStatus, failure: proof.failure, source: proof.source, browserVersion: proof.browserVersion,
  blankBaseline: proof.blankBaseline, loadedIdle: proof.loadedIdle, nativePeak: peak,
  nativePeakIncrementalMiB: proof.nativePeakIncrementalMiB, nativePhaseCoverage: proof.nativePhaseCoverage,
  firstNativeBudgetFailure: null, nativeBudgetCallbackInvoked: false, nativeUnavailableSamples: 0,
  heapFailure: { currentDecoderCapacityBytes: 33554432, requestedCapacityBytes: 33587200, requestedCapacityDifferenceBytes: 32768,
    failedIndividualAllocationBytes: null, allocationObjectOrCallsite: null,
    caveat: "Requested capacity minus fixed capacity is NOT the malloc size, live heap use, fragmentation size or allocation callsite. No heap-limit increase/GC/quality reduction accepted." },
  partialFreshFrames: final.frames, partialMetrics: metrics, splitFinalSamples: proof.splitFinalSamples,
  nativeStackSamples: proof.nativeStackSamples, allocatorSamples: original.allocatorSamples,
  boundedFailureLogs: original.logs,
  dom: { report: proof.domSamplerReport, retainedRows: proof.boundedDomRows.length, evictedRawRows: proof.rawSamplesEvicted,
    firstRetainedAt: proof.boundedDomRows[0]?.timestamp ?? null, lastRetainedAt: proof.boundedDomRows.at(-1)?.timestamp ?? null,
    documents: counterRange("documents"), nodes: counterRange("nodes"), jsEventListeners: counterRange("jsEventListeners"),
    originalBlankOrInitialConversionCountersRetained: false, nativeProcessIdentity: null,
    allocationObjectOrCallsite: null, caveat: "Late retained-window counters only; initial rows evicted. Garbage may be counted. No whole-run growth, bytes, leak, old spike cause or native PID attribution." },
  cleanup: { original: proof.cleanup, allSampledNativeIdentitiesAbsent: true, sampledIdentities: identities.length,
    checkedPids: pids.length, originalDriverWrapperObserverServerBirthsAbsent: true,
    allObservedPidsAbsent: current.length === 0, observedProcesses: current,
    bothRuntimeDirectoriesAbsent: true, sixPublishedAssetsRestored: true, restoredAssets,
    ninePrivateAssetsAbsent: true, privateAssetsAbsent, protectedFullPostHashMatches: true, noProcessesKilled: true },
  sourcePins: Object.fromEntries(await Promise.all(["scripts/analyze-mpeg2-flex-original.mjs", "scripts/lib/microsecond-native-type-join.mjs"]
    .map(async file => [file, sha(await readFile(path.join(root, file)))]))),
  completeOriginalConversions: 0, requestedRuns: 3, executedRuns: 1, threeRepeatPrivateSessionPassed: false,
  fullIndependentValidationPerformed: false, noNewConversion: true, noDetailedHeapDump: true, noForcedGc: true,
  publicAcceptance: false, fidelityAcceptance: false, conversionSpeedAcceptance: false,
  originalUninstrumentedFailureCause: null, allocationObjectOrCallsite: null,
  next: "Find/fix the exhausted fixed decoder heap with allocation evidence before a changed full-source attempt. Do not rerun unchanged, enlarge heaps, weaken gates or promote private CSS from this partial result." };
const json = JSON.stringify(analysis, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 262144);
const output = path.join(root, "evidence/mpeg2-flex-original-analysis-2026-10-07.json");
await writeFile(output, json, { flag: "wx" });
console.log(JSON.stringify({ output, frames: final.frames, peakMiB: proof.nativePeakIncrementalMiB, cleanup: analysis.cleanup, dom: analysis.dom }));
