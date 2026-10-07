// Read-only terminal failure/cleanup verification. Never rerun the converter.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const input = "evidence/mpeg2-failure-only-attribution-2026-10-07.json";
const bytes = await readFile(path.join(root, input)), proof = JSON.parse(bytes);
assert.equal(proof.completeOriginalConversion, false); assert.equal(proof.nativeObserverError, null);
assert.deepEqual(proof.forbiddenRequests, []);
for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
for (const [name, source] of Object.entries(proof.generatedSources)) assert.equal(sha(source), proof.generatedSourceHashes[name]);
const raw = await readFile(path.join(root, proof.rawReport.path));
assert.equal(raw.length, proof.rawReport.bytes); assert.equal(sha(raw), proof.rawReport.sha256);
const originalReport = JSON.parse(raw), capture = proof.nativeFailureCapture, event = capture.firstFailure;
assert.equal(event.incrementalPrivateMiB, 252.9921875); assert.ok(event.incrementalPrivateMiB > 250);
assert.equal(event.after.processes.reduce((sum, p) => sum + p.privateBytes, 0), event.after.privateBytes);
assert.deepEqual(event.baseline, proof.blankBaseline);
const sessions = proof.attribution.sessions; assert.equal(sessions.length, 1);
const session = sessions[0], trace = session.trace, dump = trace.dumps[0];
assert.ok(Date.parse(session.startedAt) > Date.parse(event.after.timestamp));
assert.equal(dump.memoryDump.success, false); assert.equal(dump.memoryDump.dumpGuid, "0x16");
assert.equal(trace.status, "failed-diagnostic"); assert.equal(trace.trace.dataLossOccurred, false);
assert.equal(trace.trace.overflow, false); assert.match(trace.trace.parseError, /phases.length > 0/);
assert.equal(session.sessionDetached, true); assert.equal(capture.callback.result.success, false);
assert.ok(capture.sequence > event.after.sequence, "Native observation continued during failed dump");
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(proof.cleanup[key], true);
assert.equal(proof.cleanup.conversionQuiescence.terminalState, "cancelled");
assert.equal(proof.cleanup.errors.length, 1); // Failed attribution assertion remains recorded, not erased.
for (const dir of [proof.runtimeDirectory, "work/mpeg2-failure-only-driver-lqg6Zb"]) {
  const absolute = path.resolve(root, dir); assert.ok(absolute.startsWith(path.join(root, "work") + path.sep));
  await assert.rejects(access(absolute), { code: "ENOENT" });
}
const identities = proof.sampledNativeIdentities;
assert.ok(identities.length > 0 && identities.length <= 512);
const pids = [...new Set([...identities.map(p => p.pid), ...Object.values(proof.ownedPids), 40948, 41164, 33440, 23672, 43756])];
for (const pid of pids) assert.ok(Number.isSafeInteger(pid) && pid > 0);
const query = pids.map(pid => `ProcessId = ${pid}`).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{ pid = $_.ProcessId; parentPid = $_.ParentProcessId; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout);
assert.deepEqual(current.filter(p => identities.some(old => old.pid === p.pid && old.parentPid === p.parentPid &&
  microsecondBirth(old.createdAt) === microsecondBirth(p.createdAt))), [], "Old native births must be absent, not just PID numbers");
for (const p of current.filter(p => !identities.some(old => old.pid === p.pid)))
  assert.ok(Date.parse(p.createdAt) > Date.parse(proof.recordedAt), "Unsampled helper must be absent or definitively newer");
const restoredAssets = {};
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  const hash = sha(await readFile(path.join(root, "public/engines/remux", file)));
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux", file))), hash); restoredAssets[file] = hash;
}
const privateAssetsAbsent = ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"];
for (const file of privateAssetsAbsent) await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
assert.equal((await stat(path.join(root, "test.mkv"))).size, proof.source.bytes);
const hash = createHash("sha256");
for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: 1048576 })) hash.update(chunk);
assert.equal(hash.digest("hex"), proof.source.sha256);
const failure = { recordedAt: new Date().toISOString(), status: "terminal-readonly-failure-only-original-analysis-not-acceptance",
  input: { path: input, bytes: bytes.length, sha256: sha(bytes) }, rawReportVerified: true, allExecutedSourcesVerified: true,
  originalGateFailure: proof.failure, blankBaseline: proof.blankBaseline, loadedIdle: proof.loadedIdle,
  nativeFailure: event, finalNativePeakIncludingFailedTrace: proof.nativePeakIncludingTraceFinalization,
  nativeObservationFinalSequence: capture.sequence, additionalOverBudgetSamples: capture.additionalOverBudgetSamples,
  nativePhaseCoverage: proof.nativePhaseCoverage,
  failedAttribution: { requestResult: dump.memoryDump, requestedAt: dump.timestamp, finishedAt: dump.finishedAt,
    nativeToRequestMs: proof.acquisitionToDumpRequestMs, nativeToCompletionMs: proof.acquisitionToDumpCompletionMs,
    sessionStartedAt: session.startedAt, sessionFinishedAt: session.finishedAt, sessionDetached: session.sessionDetached,
    trace: trace.trace, callback: capture.callback, summarizedAllocatorRows: trace.allocatorSummary,
    originalCleanupErrorsPreserved: proof.cleanup.errors,
    rawFailedTraceRetained: false, recoveredMissingDump: false,
    explanation: "Chromium request returned success=false after18.485s. Summary then rejected zero successful dump phases. Trace JSON was parsed (306events) but no allocator summary retained; do not infer missing values=zero, recovered type data or success. No unchanged retry." },
  partialFreshFrames: proof.splitFinalSamples[0].frames, partialFreshPackets: proof.splitFinalSamples[0].packets,
  metrics: proof.lastPreCancellationMetrics, splitFinalSamples: proof.splitFinalSamples,
  cleanup: { allSampledNativeIdentitiesAbsent: true, sampledIdentities: identities.length, checkedPids: pids.length,
    allObservedPidsAbsent: current.length === 0, observedProcesses: current,
    ownedHelpersAbsentOrDefinitivelyNewer: true, innerAndGeneratedRuntimeAbsent: true,
    sixPublishedAssetsRestored: true, restoredAssets, ninePrivateAssetsAbsent: true, privateAssetsAbsent,
    protectedFullPostHashMatches: true, noProcessesKilled: true },
  sourcePins: Object.fromEntries(await Promise.all(["scripts/analyze-mpeg2-failure-only.mjs", "scripts/lib/microsecond-native-type-join.mjs"]
    .map(async file => [file, sha(await readFile(path.join(root, file)))]))),
  rawStatus: originalReport.status, completeOriginalConversion: false, noNewConversion: true,
  publicAcceptance: false, fidelityAcceptance: false, conversionSpeedAcceptance: false,
  originalUninstrumentedFailureCause: null, allocationObjectOrCallsite: null,
  caveat: "First actual native failure preceded ANY detailed trace. Same source, fixed heaps, lower five-minute blank, settings and complete250MiB gate. Still partial2440freshframes only, not full source/large-output/fidelity/speed/scaling acceptance. Renderer-only adjacent57,827,328byte rise does not identify its allocation. Failed detailed dump is unavailable, not zero or attribution. All owned storage removed; no user process killed." };
const json = JSON.stringify(failure, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 262144);
const file = path.join(root, "evidence/mpeg2-failure-only-analysis-2026-10-07.json"); await writeFile(file, json, { flag: "wx" });
console.log(JSON.stringify({ file, partialFrames: failure.partialFreshFrames, nativeFailureMiB: event.incrementalPrivateMiB,
  failedDump: failure.failedAttribution.requestResult, cleanup: failure.cleanup }));
