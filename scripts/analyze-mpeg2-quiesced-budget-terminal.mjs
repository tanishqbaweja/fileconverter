// Independently verify one TERMINAL attempt. Never starts/retries a conversion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
import { readWasmFunctionNames, symbolizeWasmStack } from "./lib/wasm-stack-symbols.mjs";

const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const input = "evidence/mpeg2-quiesced-budget-original-2026-10-08.json";
assert.ok((await stat(path.join(root, input))).size <= 4 * MiB);
const bytes = await readFile(path.join(root, input)), proof = JSON.parse(bytes);
assert.equal(proof.rawStatus, "failed"); assert.equal(proof.completeOriginalConversions, 0);
assert.match(proof.failure.message, /33587200 bytes \(OOM\)/);
assert.equal(sha(proof.generatedSource), proof.generatedSourceSha256);
assert.equal(sha(proof.generatedTraceHelper), proof.generatedTraceHelperSha256);
for (const [file, hash] of Object.entries(proof.sourcePins))
  assert.equal(sha(await readFile(path.join(root, file))), hash, file);
const rawPath = path.resolve(root, proof.rawReport.path);
assert.equal(rawPath, path.join(root, "outputs/reports/2026-10-07T20-14-20-373Z-private-mpeg2-quiesced-budget-native-100ms.json"));
assert.ok((await stat(rawPath)).size <= 32 * MiB);
const raw = await readFile(rawPath); assert.equal(raw.length, proof.rawReport.bytes);
assert.equal(sha(raw), proof.rawReport.sha256);
const original = JSON.parse(raw), peak = proof.nativePeak;
assert.equal(original.status, "failed"); assert.equal(proof.blankBaseline.stable, true);
assert.equal(proof.blankBaseline.privateBytes, 244510720); assert.equal(peak.privateBytes, 498024448);
assert.equal(peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), peak.privateBytes);
assert.equal((peak.privateBytes - proof.blankBaseline.privateBytes) / MiB, 241.76953125);
assert.equal(proof.nativePeakIncrementalMiB, 241.76953125); assert.equal(proof.limitMiB, 250);
assert.equal(proof.nativeObserverError, null); assert.equal(proof.requestedRuns, 3);
assert.equal(proof.runs.length, 1); assert.equal(proof.runs[0].state.jobState, "error");
assert.equal(proof.runs[0].independentValidation, null); assert.equal(proof.runs[0].recovery, null);
assert.deepEqual(proof.forbiddenRequests, []);
// This attempt never hit the whole-tree budget, so no cancellation/dump ran.
assert.equal(proof.nativeFailureCapture.firstFailure, null);
assert.equal(proof.nativeFailureCapture.callback, null);
assert.equal(proof.nativeFailureCapture.unavailableSamples, 2);
for (const key of ["startedAt", "workerClosedAt", "cancellation", "stateAfter"])
  assert.equal(proof.quiescedBudgetCapture[key], null);
assert.equal(proof.rendererAttributionResult, null);
assert.deepEqual(original.allocatorSamples, []);
assert.equal(proof.abortDiagnostic.records.length, 1);
assert.equal(proof.abortDiagnostic.captureError, null);
const abort = proof.abortDiagnostic.records[0], symbols = proof.actualStackSymbols[0];
assert.equal(abort.role, "decoder"); assert.equal(abort.unavailable, null);
assert.equal(abort.stackTruncated, false); assert.equal(abort.stackLimitRestored, true);
assert.equal(abort.failedIndividualAllocationBytes, null); assert.equal(abort.heapLiveBytes, null);
const binaryPath = "work/mpeg2-split-pipeline-37479749443/within-mpeg2-split.wasm";
const binary = await readFile(path.join(root, binaryPath));
assert.equal(sha(binary), symbols.binarySha256);
const names = readWasmFunctionNames(binary), frames = symbolizeWasmStack(abort.stack, names);
assert.equal(names.size, symbols.actualBinaryNames); assert.equal(frames.length, 12);
assert.deepEqual(frames, symbols.frames); assert.equal(symbols.omittedWasmFrames, 0);
assert.deepEqual(frames.slice(3, 7).map(f => f.functionNameFromActualBinary),
  ["av_malloc", "av_refstruct_pool_get", "alloc_frame", "hevc_receive_frame"]);
assert.equal(symbols.causalOriginalAllocationSizeClaim, null);
const final = proof.splitFinalSamples[0], metrics = proof.runs[0].state.metrics;
assert.equal(final.frames, 106112); assert.equal(final.packets, 106112);
assert.equal(final.completedPackets, 106112); assert.equal(final.closed, true);
assert.equal(final.decoderMemoryBytes, 32 * MiB); assert.equal(final.encoderMemoryBytes, 16 * MiB);
for (const key of ["activePackets", "queuedPackets", "queuedFrames", "additionalPixelBufferBytes", "additionalJsPacketBufferBytes"])
  assert.equal(final[key], 0);
for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"])
  assert.equal(metrics[key], 65536);
assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.wasmMemoryBytes, 48 * MiB);
assert.equal(metrics.inputBytes, 1060017306); assert.equal(metrics.outputBytes, 1206298852);
assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
const typedPeak = peak.processes.map(p => {
  const matches = original.samples.flatMap(s => s.processes ?? []).filter(other =>
    other.pid === p.pid && other.parentPid === p.parentPid &&
    microsecondBirth(other.createdAt) === microsecondBirth(p.createdAt));
  const types = [...new Set(matches.map(p => p.type).filter(type => type && type !== "unknown"))];
  assert.ok(types.length <= 1);
  return { ...p, observedCimType: types[0] ?? null, observedCimBirthMatched: matches.length > 0 };
});
// These helpers were independently observed and recorded in the live launch audit.
const helpers = [
  { pid: 43740, parentPid: 37540, createdAt: "2026-10-07T20:14:19.3922720Z" },
  { pid: 35724, parentPid: 43740, createdAt: "2026-10-07T20:14:19.4443250Z" },
  { pid: 14212, parentPid: 35724, createdAt: "2026-10-07T20:14:26.4796080Z" },
  { pid: 23360, parentPid: 35724, createdAt: "2026-10-07T20:14:28.7467340Z" },
];
const identities = [...proof.sampledNativeIdentities, ...helpers], ids = [...new Set(identities.map(p => p.pid))];
assert.ok(ids.every(pid => Number.isSafeInteger(pid) && pid > 0));
assert.ok(identities.every(p => microsecondBirth(p.createdAt)));
const filter = ids.map(pid => `ProcessId = ${pid}`).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout);
assert.deepEqual(current.filter(p => identities.some(old => old.pid === p.pid && old.parentPid === p.parentPid &&
  microsecondBirth(old.createdAt) === microsecondBirth(p.createdAt))), []);
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(proof.cleanup[key], true);
assert.equal(proof.cleanup.conversionQuiescence.terminalState, "error");
assert.equal(proof.outerGeneratedRuntimeRemoved, true);
for (const directory of [proof.runtimeDirectory, proof.generatedRuntimeDirectory]) {
  assert.ok(directory.startsWith(path.join(root, "work") + path.sep));
  await assert.rejects(access(directory), { code: "ENOENT" });
}
const restoredAssets = {};
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  const hash = sha(await readFile(path.join(root, "public/engines/remux", file)));
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux", file))), hash);
  restoredAssets[file] = hash;
}
for (const file of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
assert.equal((await stat(path.join(root, "test.mkv"))).size, 2958573265);
const protectedHash = createHash("sha256");
for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: MiB })) protectedHash.update(chunk);
assert.equal(protectedHash.digest("hex"), "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const sourcePath = "scripts/analyze-mpeg2-quiesced-budget-terminal.mjs";
const analysis = {
  recordedAt: new Date().toISOString(), status: "verified-terminal-decoder-heap-abort-with-actual-native-callpath-not-acceptance",
  input: { path: input, bytes: bytes.length, sha256: sha(bytes) }, rawReportVerified: true,
  allExecutedSourcesVerified: true, failure: proof.failure, blankBaseline: proof.blankBaseline,
  nativePeak: { ...peak, processes: typedPeak }, nativePeakIncrementalMiB: 241.76953125,
  nativePhaseCoverage: proof.nativePhaseCoverage, failureCollectorUnavailableSamples: 2, unavailableIsNotZero: true,
  actualAbort: abort, actualStackSymbols: symbols, actualBinarySymbolJoinReverified: true,
  allocationPath: "HEVC alloc_frame -> av_refstruct_pool_get -> av_malloc -> aligned allocation -> malloc -> sbrk",
  failedIndividualAllocationBytes: null, heapLiveBytes: null, fragmentationProven: false,
  requestedHeapExtentBytes: 33587200, fixedDecoderHeapBytes: 33554432,
  heapExtentIsNotAllocationSize: true, actualFailedPool: null,
  noBudgetFailureOccurred: true, quiescedCancellationOrDumpExecuted: false,
  partialFreshFrames: final.frames, partialMetrics: metrics, splitFinalSamples: proof.splitFinalSamples,
  cleanup: { allSampledNativeBirthsAbsent: true, nativeIdentities: proof.sampledNativeIdentities.length,
    helperBirthsAbsent: true, historicalHelperIdentities: helpers, checkedPids: ids.length,
    observedCurrentProcesses: current, reusedPidsAreNotOldProcesses: true, bothRuntimeDirectoriesAbsent: true,
    restoredAssets, ninePrivateAssetsAbsent: true, protectedFullPostHashVerified: true, noProcessesKilled: true },
  sourcePins: { [sourcePath]: sha(await readFile(path.join(root, sourcePath))) },
  browserConversionsStarted: 1, completeOriginalConversions: 0, fullIndependentValidationPerformed: false,
  publicAcceptance: false, originalFullSourceAcceptance: false, conversionSpeedAcceptance: false, noNewConversion: true,
  next: "Inspect exact pinned FFmpeg8.1.2 HEVC refs.c alloc_frame and refstruct.c. Capture the actual late pool/request and allocator state before any fix; earlier capped early-frame observations do not establish this allocation size or heap fragmentation. Do not rerun unchanged, enlarge heaps, drop live references, or weaken fidelity."
};
const json = JSON.stringify(analysis, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 65536);
await writeFile(path.join(root, "evidence/mpeg2-quiesced-budget-terminal-analysis-2026-10-08.json"), json, { flag: "wx" });
console.log(JSON.stringify({ status: analysis.status, peakMiB: analysis.nativePeakIncrementalMiB,
  frames: final.frames, actualFrames: frames, cleanup: analysis.cleanup }));
