// Post-terminal verification only: never replay the failed candidate or baseline.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { loadRetainedCopyProgress } from "./lib/retained-split-copy-progress.mjs";
import { correctSplitCopyStagedGuard, copyAdapterBinding } from "./lib/split-copy-staged-guard-recipe.mjs";
import { makeSplitCopyProgressDriver, makeSplitCopyProgressTraceHelper } from "./lib/split-copy-progress-recipe.mjs";
import { splitRenderNativeFacts, splitRenderFirstFailureFacts } from "./lib/split-render-progress-evidence.mjs";
import { recordOutputWorkCheckpoint, compareOutputWorkWindows } from "./lib/split-copy-work-checkpoints.mjs";
import { verifyJsProbeIdentityAbsence } from "./lib/js-probe-identity-cleanup.mjs";
const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576, receiptPath = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(receiptPath, /^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-split-copy-corrected-candidate\.json$/);
const bounded = async (file, maximum = 2 * MiB) => {
  const full = path.resolve(root, file); assert.ok(full.startsWith(root + path.sep));
  const item = await lstat(full); assert.ok(item.isFile() && !item.isSymbolicLink() && item.size <= maximum);
  assert.equal(await realpath(full), full); return readFile(full);
};
const assetHash = async file => {
  const full = path.resolve(root, file); assert.ok(full.startsWith(root + path.sep));
  const item = await lstat(full); assert.ok(item.isFile() && !item.isSymbolicLink() && item.size <= 128 * MiB);
  assert.equal(await realpath(full), full); const digest = createHash("sha256");
  for await (const chunk of createReadStream(full, { highWaterMark: MiB })) digest.update(chunk);
  return digest.digest("hex");
};
const retained = await loadRetainedCopyProgress(root), receiptBytes = await bounded(receiptPath), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.status, "candidate-diagnostic-returned-independent-analysis-pending");
assert.equal(receipt.failure, null); assert.equal(receipt.executions, 1); assert.equal(receipt.productionRestored, true);
assert.equal(receipt.reusedBaseline.noBaselineRerun, true); assert.equal(receipt.browserMode, "headless");
assert.equal(receipt.subprocessWindowsHidden, true); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
assert.equal(Object.keys(receipt.sourcePins).length, 141);
for (const [file, hash] of Object.entries(receipt.sourcePins)) assert.equal(sha(await bounded(file)), hash, file);
const c = receipt.candidate, compressed = await bounded(c.compressedReport.path, 32 * MiB);
assert.equal(compressed.length, c.compressedReport.bytes); assert.equal(sha(compressed), c.compressedReport.sha256);
const rawBytes = gunzipSync(compressed, { maxOutputLength: 32 * MiB });
assert.equal(rawBytes.length, c.rawReport.bytes); assert.equal(sha(rawBytes), c.rawReport.sha256);
assert.equal(c.rawRemovedAfterLosslessArchive, true);
await assert.rejects(access(path.join(root, c.rawReport.path)), { code: "ENOENT" });
const raw = JSON.parse(rawBytes), base = retained.baseline.raw;
assert.equal(raw.status, "failed"); assert.equal(c.actualExitCode, 1); assert.equal(raw.requestedRuns, 3);
assert.equal(raw.runs.length, 1); assert.equal(raw.runs[0].state.jobState, "cancelled");
assert.equal(raw.runs[0].independentValidation, null); assert.match(raw.failure.message, /exceeds 250MiB/);
assert.deepEqual(raw.source, base.source); assert.deepEqual(raw.manifest, base.manifest);
assert.deepEqual(raw.actualWasmMemoryLimits, base.actualWasmMemoryLimits);
assert.equal(raw.progressProbe.jsAllocationSamplingEnabled, false); assert.equal(raw.conversionJsReport, null);
assert.deepEqual(raw.progressProbe.actualServedAsset, baselineBinding);
assert.deepEqual(raw.abortDiagnostic.stagedAdapters.map(({ bytes, sha256 }) => ({ bytes, sha256 })), Array(3).fill(copyAdapterBinding));
for (const [file, hash] of Object.entries(raw.sourceHashes)) assert.equal(sha(await bounded(file)), hash, file);
const sourceArchive = await bounded(receipt.sourceArchive.path);
assert.equal(sourceArchive.length, receipt.sourceArchive.bytes); assert.equal(sha(sourceArchive), receipt.sourceArchive.sha256);
const sourceBytes = gunzipSync(sourceArchive, { maxOutputLength: 2 * MiB });
assert.equal(sha(sourceBytes), receipt.sourceArchive.restoredSha256); const source = JSON.parse(sourceBytes);
assert.equal(sha(source.generated), receipt.sourceArchive.driverSha256);
assert.equal(sha(source.traceHelper), receipt.sourceArchive.traceHelperSha256);
const helperUri = source.generated.match(/^import \{ startBoundedRendererAttribution \} from "([^"]+)";$/m)[1];
const previous = makeSplitCopyProgressDriver(retained.executed.generated, root, helperUri, baselineBinding, "candidate");
assert.deepEqual(source.previous, previous); const corrected = correctSplitCopyStagedGuard(previous.generated);
assert.deepEqual(source.corrected, corrected);
assert.equal(source.generated, corrected.generated.replace(...source.sourcePinPatch));
const helperPath = JSON.parse(source.traceHelper.match(/^const rawArchivePath=(.*);$/m)[1]);
assert.equal(source.traceHelper, makeSplitCopyProgressTraceHelper(retained.executed.traceHelper, helperPath));
const observed = { workCheckpoints: [], lastProgressObservation: null, unavailableProgressSamples: 0 };
for (const sample of raw.samples.filter(row => row.phase === "conversion-1"))
  recordOutputWorkCheckpoint(observed, { jobState: sample.jobState, metrics: sample.metrics });
assert.deepEqual(observed.workCheckpoints, raw.progressProbe.workCheckpoints);
assert.deepEqual(observed.lastProgressObservation, raw.progressProbe.lastProgressObservation);
assert.equal(observed.unavailableProgressSamples, raw.progressProbe.unavailableProgressSamples);
const workWindows = compareOutputWorkWindows(base.progressProbe.workCheckpoints, raw.progressProbe.workCheckpoints);
assert.deepEqual(workWindows, receipt.workWindows);
assert.ok(workWindows.slice(0, 3).every(row => row.status === "candidate-later-window"));
assert.ok(workWindows.slice(3).every(row => row.status === "unavailable"));
const native = splitRenderNativeFacts(raw, "candidate"); assert.deepEqual(native, c.native);
assert.equal(native.observedIncrementalPrivateMiB, 271.88671875);
const firstFailure = splitRenderFirstFailureFacts(raw); assert.equal(firstFailure.causeProven, false);
const final = raw.splitFinalSamples; assert.equal(final.length, 1); const metrics = final[0];
assert.equal(metrics.frames, 1464); assert.equal(metrics.packets, metrics.frames); assert.equal(metrics.completedPackets, metrics.frames);
assert.equal(metrics.copiedPixelBytes, 3389921280); assert.equal(metrics.activePackets, 0);
assert.equal(metrics.queuedPackets, 0); assert.equal(metrics.queuedFrames, 0); assert.equal(metrics.closed, true);
assert.equal(metrics.aggregateWasmMemoryBytes, 50331648); assert.equal(metrics.maximumMediaAvioWriteBytes, 65536);
assert.equal(metrics.copyKernel.nativePlaneCalls, metrics.frames * 3);
assert.equal(metrics.copyKernel.copiedBytes, metrics.copiedPixelBytes); assert.equal(metrics.copyKernel.closed, true);
const layout = metrics.firstFrameCopyLayout;
assert.equal(layout.width, 1920); assert.equal(layout.height, 804); assert.equal(layout.pixelFormat, "yuv420p");
assert.deepEqual(layout.sourceStrides, [1920, 960, 960]); assert.deepEqual(layout.targetStrides, [1920, 960, 960]);
const frameBridge = await bounded("scripts/lib/mpeg2-split-frame-bridge.mjs");
assert.ok(frameBridge.toString().includes("if (from.stride === from.rowBytes && to.stride === to.rowBytes)"));
const m = raw.runs[0].state.metrics;
assert.equal(m.outputBytes, 20141205); assert.equal(m.inputBytes, 30369345);
assert.equal(m.maxReadChunkBytes, 65536); assert.equal(m.maxWriteChunkBytes, 65536);
assert.equal(m.peakQueuedBytes, 65536); assert.equal(m.peakPendingOperations, 1);
assert.equal(m.queuedBytes, 0); assert.equal(m.pendingOperations, 0);
assert.deepEqual(raw.forbiddenRequests, []);
for (const key of ["chromeLauncherSha256", "chromeLibrarySha256", "viewport", "checkpointOutputBytes", "maximumConversionMs"])
  assert.deepEqual(raw.progressProbe[key], base.progressProbe[key]);
assert.equal(raw.browserVersion, base.browserVersion);
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(raw.cleanup[key], true);
await assert.rejects(access(raw.runtimeDirectory), { code: "ENOENT" });
await assert.rejects(access(path.dirname(fileURLToPath(helperUri))), { code: "ENOENT" });
const identities = raw.nativeMemory.identities, filter = identities.map(row => `ProcessId = ${row.pid}`).join(" OR ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{ pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 65536 });
const current = JSON.parse(stdout);
assert.ok(!current.some(now => identities.some(prior => prior.pid === now.pid && prior.parentPid === now.parentPid &&
  Math.abs(Date.parse(prior.createdAt) - Date.parse(now.createdAt)) <= 1)));
const cleanupIdentities = { ...verifyJsProbeIdentityAbsence(identities, current), conservativeBirthToleranceMs: 1 };
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const digest = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: MiB })) digest.update(chunk);
assert.equal(digest.digest("hex"), raw.source.sha256);
const app = await bounded("dist/client" + baselineBinding.url); assert.equal(app.length, baselineBinding.bytes); assert.equal(sha(app), baselineBinding.sha256);
const restoration = JSON.parse(await bounded("evidence/2026-10-08T13-49-53-644Z-stable-progress-ui-headless-golden-validation.json"));
for (const [file, hash] of Object.entries(restoration.cleanup.restoredAssetHashes)) assert.equal(await assetHash("dist/client/engines/remux/" + file), hash);
for (const file of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs",
  "mpeg2-split-copy-kernel.mjs", "mpeg2-split-copy.wasm"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
const proof = { recordedAt: new Date().toISOString(), status: "independently-verified-copy-candidate-rejected-for-original-profile",
  receipt: { path: receiptPath, bytes: receiptBytes.length, sha256: sha(receiptBytes) },
  verifierSha256: sha(await bounded("scripts/analyze-split-copy-candidate-only.mjs")), sourcePinCount: 141,
  reusedBaselineNoRerun: true, matchedBrowserBinaryHashes: true, baselineNative: retained.native, candidateNative: native,
  workWindows, firstFailure, firstFrameLayout: layout, firstFrameAlreadyContiguousInOriginalBridge: true,
  originalPerRowLoopEliminatedForObservedFrame: false, allFramesLayoutObserved: false,
  finalSplitMetrics: metrics, lastReportedMetrics: m, cleanupIdentities, fullProtectedPostSha256Verified: true,
  normalProductionAndEngineAssetsRestored: true, allElevenPrivateAssetsAbsent: true,
  decision: "Reject this copy-kernel candidate for the original profile; no row loop for the observed frame, later partial timing windows, whole-tree budget failure. Do not replay unchanged.",
  causalSpeedRegressionProven: false, nativeAllocationCauseProven: false,
  delayedPostCancelDumpIsPeakAllocationEvidence: false, conversionsCompleted: 0, completeOutputsIndependentlyValidated: 0,
  conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false, publicAcceptance: false };
const output = receiptPath.replace(/\.json$/, "-analysis.json"), bytes = JSON.stringify(proof, null, 2) + "\n";
assert.ok(Buffer.byteLength(bytes) < MiB); await writeFile(path.join(root, output), bytes, { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, incrementalMiB: native.observedIncrementalPrivateMiB, workWindows, cleanupIdentities }));
