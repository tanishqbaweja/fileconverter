// Terminal read-only post-processing. No browser/native conversion or restart.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { joinMicrosecondNativeTypes, microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const input = "evidence/mpeg2-largest-burst-attribution-2026-10-07.json";
const bytes = await readFile(path.join(root, input)), proof = JSON.parse(bytes);
assert.equal(proof.completeOriginalConversion, false); assert.equal(proof.ownedPids.chrome, 38132);
assert.equal(proof.failure.message, "Diagnostic callback unavailable or busy; record failure rather than queue requests");
assert.equal(proof.nativeObserverError, null); assert.deepEqual(proof.forbiddenRequests, []);
for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
const raw = await readFile(path.join(root, proof.rawReport.path)); assert.equal(raw.length, proof.rawReport.bytes); assert.equal(sha(raw), proof.rawReport.sha256);
const originalReport = JSON.parse(raw);
for (const name of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(proof.cleanup[name], true);
assert.equal(proof.cleanup.chromeRootExitObservation.status, "owned-identity-absent");
for (const directory of [proof.runtimeDirectory, "work/mpeg2-largest-burst-driver-n3ATPV"]) {
  const absolute = path.resolve(root, directory); assert.ok(absolute.startsWith(path.join(root, "work") + path.sep));
  await assert.rejects(access(absolute), { code: "ENOENT" });
}
const identities = proof.sampledNativeIdentities, pids = [...new Set([...identities.map(p => p.pid), ...Object.values(proof.ownedPids), 39988, 45204, 35480])];
assert.ok(identities.length <= 512 && identities.length > 0);
for (const pid of pids) assert.ok(Number.isSafeInteger(pid) && pid > 0);
const query = pids.map(pid => `ProcessId = ${pid}`).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{ pid = $_.ProcessId; parentPid = $_.ParentProcessId; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout);
const survivors = current.filter(p => identities.some(old => old.pid === p.pid && old.parentPid === p.parentPid &&
  microsecondBirth(old.createdAt) === microsecondBirth(p.createdAt)));
assert.deepEqual(survivors, [], "Sampled native PID/birth identities must actually be absent");
for (const p of current.filter(p => !identities.some(old => old.pid === p.pid)))
  assert.ok(Date.parse(p.createdAt) > Date.parse(proof.recordedAt), "Unsampled helper PID needs a definitively newer birth or actual absence");
const previousFailure = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-largest-burst-analysis-pid-only-failure-2026-10-07.json")));
assert.equal(sha(previousFailure.executedSource), previousFailure.executedSourceSha256);
const restoredAssets = {};
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  const hash = sha(await readFile(path.join(root, "public/engines/remux", file)));
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux", file))), hash); restoredAssets[file] = hash;
}
const privateAssetsAbsent = ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"];
for (const file of privateAssetsAbsent) await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
const source = path.join(root, "test.mkv"), hash = createHash("sha256"); assert.equal((await stat(source)).size, proof.source.bytes);
for await (const chunk of createReadStream(source, { highWaterMark: 1048576 })) hash.update(chunk);
assert.equal(hash.digest("hex"), proof.source.sha256);
const traces = proof.attribution.sessions.map(s => s.trace);
assert.ok(traces.length === 2 && traces.every(t => t.status === "completed-diagnostic" && t.trace.dataLossOccurred === false && !t.trace.overflow && !t.trace.parseError));
const joined = joinMicrosecondNativeTypes(traces);
const analysis = { recordedAt: new Date().toISOString(), status: "terminal-readonly-largest-type-analysis-not-acceptance",
  input: { path: input, bytes: bytes.length, sha256: sha(bytes) }, rawReportVerified: true,
  historicalExecutedProofUnchanged: true, historicalEmptyExactStringJoinPreserved: proof.largestTypeChanges,
  joinCorrection: "CIM before dump gives seven-digit timestamps ending0; native after trigger preserves 100ns final digit. Exact string join rejected same PID/parent/microsecond birth. Post-processing ONLY joins at observed CIM microsecond precision, preserves both exact birth strings, refuses different microsecond or parent; submicrosecond reuse cannot be resolved. No new browser run.",
  joined, nativeBursts: proof.nativeBursts.events.filter(e => e.phase === "conversion-1").map(e => ({ sequence: e.after.sequence,
    nativeAcquiredAt: e.after.timestamp, treeDeltaPrivateBytes: e.delta.treeDeltaPrivateBytes,
    changedProcesses: e.delta.processDeltas.filter(p => p.deltaPrivateBytes !== 0),
    callback: proof.nativeBursts.callbacks.find(c => c.sequence === e.after.sequence) })),
  finalNativePeak: proof.finalNativePeak, finalNativeIncrementalPrivateMiB: proof.finalNativeIncrementalPrivateMiB,
  blankBaseline: proof.blankBaseline, loadedIdle: proof.loadedIdle,
  gateFailurePreserved: proof.failure.message, completeOriginalConversion: false,
  partialFreshFrames: proof.splitFinalSamples[0].frames, partialFreshEncoderPackets: proof.splitFinalSamples[0].packets,
  lastPreCancellationMetrics: proof.lastPreCancellationMetrics,
  cleanup: { allSampledNativeIdentitiesAbsent: true, ownedHelpersAbsentOrDefinitivelyNewerBirth: true,
    allObservedProcessPidsAbsent: current.length === 0, sampledIdentities: identities.length, checkedPids: pids.length,
    originalFullPostHashMatches: true, innerAndGeneratedRuntimeAbsent: true, sixPublishedAssetsRestored: true,
    ninePrivateAssetsAbsent: true, observedProcesses: current, restoredAssets, privateAssetsAbsent },
  sourcePins: Object.fromEntries(await Promise.all(["scripts/analyze-mpeg2-largest-burst.mjs", "scripts/lib/microsecond-native-type-join.mjs", "scripts/lib/ui-largest-blink-join.mjs"]
    .map(async file => [file, sha(await readFile(path.join(root, file)))]))),
  rawStatus: originalReport.status, noNewConversion: true, generatedMediaCopies: 0, noDocker: true, noForcedGc: true,
  publicAcceptance: false, completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false,
  originalUninstrumentedFailureCause: null, allocationObjectOrCallsite: null,
  failedReadOnlyPidAssumptionPreserved: { path: "evidence/mpeg2-largest-burst-analysis-pid-only-failure-2026-10-07.json",
    executedSourceSha256: previousFailure.executedSourceSha256, noProcessesKilled: true },
  caveat: "Startup/trace instrumentation failed within about one second of conversion; only37fresh frames, zero output bytes at last metric snapshot. Not a long-source memory/fidelity/scaling/speed acceptance or reproduction of the late uninstrumented spike. Later detailed types overlap and may include garbage, are a partial inventory and do not name the peak's allocation callsite. Keep busy failure and ALL ten peak processes." };
const json = JSON.stringify(analysis, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 1048576);
const file = path.join(root, "evidence/mpeg2-largest-burst-analysis-2026-10-07.json"); await writeFile(file, json, { flag: "wx" });
console.log(JSON.stringify({ file, joined: joined.map(p => ({ pid: p.pid, birth:p.birthComparison,
  heaps: p.afterHeaps, largestIncreases: p.types.filter(t => t.deltaAllocatedObjectsBytes > 0).slice(0, 8) })), cleanup: analysis.cleanup,
  peakMiB: analysis.finalNativeIncrementalPrivateMiB, partialFrames: analysis.partialFreshFrames }));
