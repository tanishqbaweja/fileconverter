// Post-terminal only. Partial prefix observations never certify full input or speed.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { loadArchivedJsCopyControl } from "./lib/archived-js-copy-control.mjs";
import { makeProgressCompositingProgressDriver, makeProgressCompositingTraceHelper } from "./lib/progress-compositing-progress-recipe.mjs";
import { splitRenderNativeFacts, splitRenderFirstFailureFacts } from "./lib/split-render-progress-evidence.mjs";
import { recordOutputWorkCheckpoint, compareOutputWorkWindows } from "./lib/split-copy-work-checkpoints.mjs";
import { verifyJsProbeIdentityAbsence } from "./lib/js-probe-identity-cleanup.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), receiptPath = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(receiptPath, /^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-progress-compositing-original\.json$/);
const receiptBytes = await read(receiptPath), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.status, "failed-or-incomplete");
assert.match(receipt.failure, /AssertionError.*scripts\/diagnose-split-render-progress\.mjs[\s\S]*- undefined/);
assert.equal(receipt.executions, 1); assert.equal(receipt.productionRestored, true); assert.equal(receipt.reusedBaseline.noBaselineRerun, true);
assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.equal(Object.keys(receipt.sourcePins).length, 145);
const decode = async (record, maximum = 32 * 1024 ** 2) => {
  const compressed = await read(record.path); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  return gunzipSync(compressed, { maxOutputLength: maximum });
};
const rawBytes = await decode(receipt.candidate.compressedReport), raw = JSON.parse(rawBytes), c = receipt.candidate;
assert.equal(rawBytes.length, c.rawReport.bytes); assert.equal(sha(rawBytes), c.rawReport.sha256); assert.equal(c.rawRemovedAfterLosslessArchive, true);
await assert.rejects(access(path.join(root, c.rawReport.path)), { code: "ENOENT" });
const sourceBytes = await decode(receipt.sourceArchive, 8 * 1024 ** 2); assert.equal(sourceBytes.length, receipt.sourceArchive.restoredBytes);
assert.equal(sha(sourceBytes), receipt.sourceArchive.restoredSha256); const source = JSON.parse(sourceBytes);
assert.equal(sha(source.generated), receipt.sourceArchive.driverSha256); assert.equal(sha(source.traceHelper), receipt.sourceArchive.traceHelperSha256);
assert.equal(Object.keys(source.sourcePreimages).length, 145);
for (const [file, record] of Object.entries(source.sourcePreimages)) {
  assert.equal(record.encoding, "base64"); assert.equal(sha(Buffer.from(record.data, "base64")), receipt.sourcePins[file], file);
}
// Preserve post-run controller failure: its ledger omitted three frozen source-list
// entries. Verify them against exact already-pushed EXECUTED Git blobs, not guesses.
const extraFiles = Object.keys(raw.sourceHashes).filter(file => receipt.sourcePins[file] === undefined);
assert.deepEqual(extraFiles, ["scripts/diagnose-split-render-progress.mjs", "scripts/lib/split-render-progress-recipe.mjs", "tests/split-render-progress.test.mjs"]);
const executedCommit = "9479876", supplementarySourcePreimages = {};
for (const file of extraFiles) {
  const { stdout: bytes } = await promisify(execFile)("git", ["show", `${executedCommit}:${file}`],
    { cwd: root, windowsHide: true, encoding: "buffer", timeout: 15000, maxBuffer: 2097152 });
  assert.equal(sha(bytes), raw.sourceHashes[file]); assert.deepEqual(bytes, await read(file));
  supplementarySourcePreimages[file] = { encoding: "base64", data: bytes.toString("base64"), sha256: sha(bytes) };
}
for (const [file, hash] of Object.entries(raw.sourceHashes)) assert.equal(hash, receipt.sourcePins[file] ?? supplementarySourcePreimages[file].sha256, file);
for (const file of ["scripts/lib/progress-compositing-progress-recipe.mjs", "scripts/lib/split-copy-progress-recipe.mjs", "scripts/lib/split-render-progress-recipe.mjs"])
  assert.equal(sha(await read(file)), receipt.sourcePins[file] ?? supplementarySourcePreimages[file].sha256, "Versioned recipe import must match executed preimage");
const retained = await loadArchivedJsCopyControl(root), base = retained.baseline.raw;
const helperUri = source.generated.match(/^import \{ startBoundedRendererAttribution \} from "([^"]+)";$/m)?.[1]; assert.ok(helperUri);
const recipe = makeProgressCompositingProgressDriver(retained.executed.generated, root, helperUri, receipt.expectedApp, receipt.expectedStylesheet);
const helperPath = JSON.parse(source.traceHelper.match(/^const rawArchivePath=(.*);$/m)[1]);
const traceHelper = makeProgressCompositingTraceHelper(retained.executed.traceHelper, helperPath);
assert.deepEqual({ ...recipe, traceHelper, sourcePreimages: source.sourcePreimages }, source);
assert.equal(raw.status, "failed"); assert.equal(c.actualExitCode, 1); assert.equal(raw.requestedRuns, 3); assert.equal(raw.runs.length, 1);
assert.deepEqual(raw.source, base.source); assert.deepEqual(raw.manifest, base.manifest); assert.deepEqual(raw.actualWasmMemoryLimits, base.actualWasmMemoryLimits);
assert.deepEqual(raw.progressProbe.actualServedAsset, receipt.expectedApp); assert.equal(raw.progressProbe.originalJsCopyTransport, true);
assert.equal(raw.progressProbe.jsAllocationSamplingEnabled, false); assert.equal(raw.conversionJsReport, null);
assert.deepEqual(raw.cssCandidate.css, base.cssCandidate.css); assert.equal(raw.cssCandidate.interceptionError, null);
const styles = raw.cssCandidate.staticAssets; assert.equal(styles.length, 1); const style = styles[0], expectedCss = receipt.expectedStylesheet;
assert.deepEqual({ url: new URL(style.url).pathname, bytes: style.beforeBytes, sha256: style.beforeSha256, afterBytes: style.afterBytes, afterSha256: style.afterSha256 },
  { url: expectedCss.url, bytes: expectedCss.bytes, sha256: expectedCss.sha256, afterBytes: expectedCss.afterBytes, afterSha256: expectedCss.afterSha256 });
assert.equal(sha(raw.cssCandidate.css), expectedCss.matrixCssSha256); assert.equal(Buffer.byteLength(raw.cssCandidate.css), expectedCss.matrixCssBytes);
assert.equal(raw.browserVersion, base.browserVersion);
for (const key of ["chromeLauncherSha256", "chromeLibrarySha256", "viewport", "checkpointOutputBytes", "maximumConversionMs"])
  assert.deepEqual(raw.progressProbe[key], base.progressProbe[key]);
assert.deepEqual(raw.abortDiagnostic.stagedAdapters.map(({ bytes, sha256 }) => ({ bytes, sha256 })),
  Array(3).fill({ bytes: 18330, sha256: "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837" }));
assert.deepEqual(raw.forbiddenRequests, []); assert.equal(raw.runs[0].independentValidation, null, "Cancelled diagnostic is not a valid completed file");
const observation = { workCheckpoints: [], lastProgressObservation: null, unavailableProgressSamples: 0 };
for (const sample of raw.samples.filter(row => row.phase === "conversion-1")) recordOutputWorkCheckpoint(observation, { jobState: sample.jobState, metrics: sample.metrics });
assert.deepEqual(observation.workCheckpoints, raw.progressProbe.workCheckpoints); assert.deepEqual(observation.lastProgressObservation, raw.progressProbe.lastProgressObservation);
assert.equal(observation.unavailableProgressSamples, raw.progressProbe.unavailableProgressSamples);
const workWindows = compareOutputWorkWindows(base.progressProbe.workCheckpoints, raw.progressProbe.workCheckpoints);
assert.equal(receipt.workWindows, null, "Original controller stopped at source ledger check; do not overwrite it");
const native = splitRenderNativeFacts(raw, "candidate"); assert.deepEqual(native, c.native); const firstFailure = splitRenderFirstFailureFacts(raw);
const metrics = raw.runs[0].state.metrics, final = raw.splitFinalSamples;
assert.equal(final.length, 1); const owned = final[0]; assert.ok(owned.frames > 0); assert.equal(owned.frames, owned.packets);
assert.equal(owned.completedPackets, owned.frames); assert.equal(owned.aggregateWasmMemoryBytes, 50331648);
assert.equal(owned.closed, true); assert.equal(owned.activePackets, 0); assert.equal(owned.queuedPackets, 0); assert.equal(owned.queuedFrames, 0);
assert.equal(owned.additionalPixelBufferBytes, 0); assert.equal(owned.additionalJsPacketBufferBytes, 0); assert.equal(owned.copyKernel, undefined);
assert.equal(metrics.wasmMemoryBytes, 50331648); assert.equal(metrics.peakWasmMemoryBytes, 50331648);
assert.ok(metrics.maxReadChunkBytes <= 65536 && metrics.maxWriteChunkBytes <= 65536 && metrics.peakQueuedBytes <= 65536);
assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
if (native.primaryLimitExceededInObservedWindow) assert.ok(firstFailure.firstFailure || /exceeds 250MiB/.test(raw.failure.message));
else { assert.equal(raw.progressProbe.checkpointReached, true); assert.equal(raw.runs[0].state.jobState, "cancelled"); assert.equal(firstFailure.firstFailure, null); }
const identities = [...raw.nativeMemory.identities, ...raw.ownedLaunches.map(row => row.identity), receipt.ownedDriver];
const ids = [...new Set(identities.map(row => row.pid))]; assert.ok(ids.length > 0 && ids.length <= 128);
const filter = ids.map(pid => { assert.ok(Number.isSafeInteger(pid) && pid > 0); return `ProcessId = ${pid}`; }).join(" OR ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{ pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 65536 });
const current = JSON.parse(stdout); assert.ok(Array.isArray(current));
assert.ok(!current.some(now => identities.some(prior => prior.pid === now.pid && prior.parentPid === now.parentPid &&
  Math.abs(Date.parse(prior.createdAt) - Date.parse(now.createdAt)) <= 1)), "A recorded owned identity is still present");
const cleanupIdentities = { ...verifyJsProbeIdentityAbsence(identities, current), conservativeBirthToleranceMs: 1 };
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(raw.cleanup[key], true);
assert.ok(!raw.cleanup.errors?.length); assert.equal(receipt.driverAbsent.status, "owned-identity-absent");
for (const directory of [raw.runtimeDirectory, receipt.wrapperPath]) {
  assert.ok(path.relative(root, directory).startsWith("work" + path.sep)); await assert.rejects(access(directory), { code: "ENOENT" });
}
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const digest = createHash("sha256"); for await (const chunk of createReadStream(original)) digest.update(chunk); assert.equal(digest.digest("hex"), raw.source.sha256);
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const restoration = JSON.parse(await read("evidence/2026-10-08T13-49-53-644Z-stable-progress-ui-headless-golden-validation.json"));
for (const [file, hash] of Object.entries(restoration.cleanup.restoredAssetHashes)) assert.equal(sha(await read("dist/client/engines/remux/" + file)), hash);
for (const file of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs",
  "mpeg2-split-copy-kernel.mjs", "mpeg2-split-copy.wasm"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
const buildBytes = await read(receipt.buildProof.path); assert.equal(sha(buildBytes), receipt.buildProof.sha256); const build = JSON.parse(buildBytes);
assert.deepEqual(build.asset, receipt.expectedApp); assert.equal(build.stylesheet.sha256, expectedCss.sha256);
const supplementaryBytes = Buffer.from(JSON.stringify({ executedCommit, supplementarySourcePreimages })), supplementaryGzip = gzipSync(supplementaryBytes, { level: 9 });
const supplementaryPath = receiptPath.replace(/^evidence\//, "outputs/reports/").replace(/\.json$/, "-supplementary-source-preimages.json.gz");
await writeFile(path.join(root, supplementaryPath), supplementaryGzip, { flag: "wx" }); assert.deepEqual(gunzipSync(await read(supplementaryPath)), supplementaryBytes);
const status = native.primaryLimitExceededInObservedWindow ? "progress-ui-candidate-rejected-by-observed-native-budget" : "partial-progress-ui-window-below250-not-full-acceptance";
const result = { recordedAt: new Date().toISOString(), status, receipt: { path: receiptPath, sha256: sha(receiptBytes) },
  originalControllerFailurePreserved: true, exactExecutedSourcePreimages: 145, supplementaryExecutedSourcePreimages: 3,
  supplementarySourceArchive: { path: supplementaryPath, bytes: supplementaryGzip.length, sha256: sha(supplementaryGzip),
    restoredBytes: supplementaryBytes.length, restoredSha256: sha(supplementaryBytes), executedCommit },
  completeDriverSourceListNowVerified: true, exactDriverAndHelperReconstructed: true, reusedBaselineNoRerun: true,
  sameFullProtectedSource: true, sameChromeBinaryHashes: true, sameNativeModulesAndLimits: true, originalJsCopyTransport: true,
  actualServedApp: receipt.expectedApp, actualServedStylesheet: expectedCss, identicalHistoricalPrivateCssSuffix: true,
  native, firstFailure, workWindows, finalSplitMetrics: owned, lastReportedMetrics: metrics, cleanupIdentities,
  normalProductionAndEngineAssetsRestored: true, allElevenPrivateAssetsAbsent: true, fullProtectedPostSha256Verified: true,
  completedConversions: 0, completeOutputsIndependentlyValidated: 0, partialCheckpointReached: raw.progressProbe.checkpointReached,
  decision: native.primaryLimitExceededInObservedWindow ? "Reject for this original profile; do not replay unchanged." :
    "Observed prefix only; keep private. Separate previously proven late HEVC-pool OOM remains unresolved before any full conversion acceptance.",
  browserMode: "headless", windowsHidden: true, headedManualValidation: false, causalSpeedImprovementProven: false,
  nativeAllocationCauseProven: false, delayedDumpIsPeakAllocationEvidence: false, lateHevcPoolOomResolved: false,
  conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false, publicAcceptance: false };
const output = receiptPath.replace(/\.json$/, "-analysis.json");
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status, incrementalMiB: native.observedIncrementalPrivateMiB, workWindows, identityCount: cleanupIdentities.originalIdentityCount }));
// This verifier never starts a browser, remuxes, encodes or repairs test evidence.
