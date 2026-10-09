// Independent post-terminal proof. No browser, build, converter or evidence repair.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { loadArchivedJsCopyControl } from "./lib/archived-js-copy-control.mjs";
import { makeProgressCompositingProgressDriver, makeProgressCompositingTraceHelper } from "./lib/progress-compositing-progress-recipe.mjs";
import { makeProgressCompositingFullDriver } from "./lib/progress-compositing-full-recipe.mjs";
import { deriveDriverSourcePinFiles } from "./lib/driver-source-pin-union.mjs";
import { progressFullTerminalFacts } from "./lib/progress-full-terminal-facts.mjs";
import { recordOutputWorkCheckpoint, compareOutputWorkWindows } from "./lib/split-copy-work-checkpoints.mjs";
import { verifyJsProbeIdentityAbsence } from "./lib/js-probe-identity-cleanup.mjs";
import { readWasmFunctionNames, symbolizeWasmStack } from "./lib/wasm-stack-symbols.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receiptPath = process.argv[2]; assert.equal(process.argv.length, 3);
assert.match(receiptPath, /^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-progress-compositing-original-full-completion\.json$/);
const receiptBytes = await read(receiptPath), receipt = JSON.parse(receiptBytes), c = receipt.candidate;
assert.equal(receipt.status, "candidate-diagnostic-returned-independent-analysis-pending");
assert.equal(receipt.executionMode, "full-completion"); assert.equal(receipt.failure, null);
assert.equal(receipt.executions, 1); assert.equal(c.actualExitCode, 1); assert.equal(receipt.productionRestored, true);
assert.equal(receipt.reusedBaseline.noBaselineRerun, true); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
assert.equal(Object.keys(receipt.sourcePins).length, 151);
const decode = async (record, maximum) => {
  const bytes = await read(record.path); assert.equal(bytes.length, record.bytes); assert.equal(sha(bytes), record.sha256);
  return gunzipSync(bytes, { maxOutputLength: maximum });
};
const rawBytes = await decode(c.compressedReport, 32 * 1048576), raw = JSON.parse(rawBytes);
assert.equal(rawBytes.length, c.rawReport.bytes); assert.equal(sha(rawBytes), c.rawReport.sha256);
assert.equal(c.rawRemovedAfterLosslessArchive, true); await assert.rejects(access(path.join(root, c.rawReport.path)), { code: "ENOENT" });
const sourceBytes = await decode(receipt.sourceArchive, 8 * 1048576), source = JSON.parse(sourceBytes);
assert.equal(sourceBytes.length, receipt.sourceArchive.restoredBytes); assert.equal(sha(sourceBytes), receipt.sourceArchive.restoredSha256);
assert.equal(sha(source.generated), receipt.sourceArchive.driverSha256); assert.equal(sha(source.traceHelper), receipt.sourceArchive.traceHelperSha256);
assert.equal(Object.keys(source.sourcePreimages).length, 151);
for (const [file, preimage] of Object.entries(source.sourcePreimages)) {
  assert.equal(preimage.encoding, "base64"); assert.equal(sha(Buffer.from(preimage.data, "base64")), receipt.sourcePins[file], file);
  assert.equal(sha(await read(file)), receipt.postSourcePins[file], file);
}
for (const [file, hash] of Object.entries(raw.sourceHashes)) assert.equal(hash, receipt.sourcePins[file], file);
const coverage = deriveDriverSourcePinFiles(source.generated,
  Object.keys(receipt.sourcePins).filter(file => !receipt.sourcePinCoverage.addedDriverFiles.includes(file)));
assert.equal(coverage.driverUniqueSourceFiles, 132); assert.deepEqual(coverage, receipt.sourcePinCoverage);
const retained = await loadArchivedJsCopyControl(root), base = retained.baseline.raw;
const helperUri = source.generated.match(/^import \{ startBoundedRendererAttribution \} from "([^"]+)";$/m)?.[1]; assert.ok(helperUri);
const partial = makeProgressCompositingProgressDriver(retained.executed.generated, root, helperUri, receipt.expectedApp, receipt.expectedStylesheet);
const recipe = makeProgressCompositingFullDriver(partial);
const helperPath = JSON.parse(source.traceHelper.match(/^const rawArchivePath=(.*);$/m)[1]);
const traceHelper = makeProgressCompositingTraceHelper(retained.executed.traceHelper, helperPath);
assert.deepEqual({ ...recipe, traceHelper, sourcePreimages: source.sourcePreimages }, source);
for (const key of ["source", "manifest", "actualWasmMemoryLimits", "browserVersion"]) assert.deepEqual(raw[key], base[key], key);
for (const key of ["chromeLauncherSha256", "chromeLibrarySha256", "viewport"]) assert.deepEqual(raw.progressProbe[key], base.progressProbe[key], key);
assert.deepEqual(raw.progressProbe.actualServedAsset, receipt.expectedApp); assert.equal(raw.progressProbe.originalJsCopyTransport, true);
assert.equal(raw.cssCandidate.css, base.cssCandidate.css); assert.equal(raw.cssCandidate.interceptionError, null);
assert.equal(raw.cssCandidate.staticAssets.length, 1); const style = raw.cssCandidate.staticAssets[0], expected = receipt.expectedStylesheet;
assert.deepEqual({ url: new URL(style.url).pathname, bytes: style.beforeBytes, sha256: style.beforeSha256,
  afterBytes: style.afterBytes, afterSha256: style.afterSha256 },
{ url: expected.url, bytes: expected.bytes, sha256: expected.sha256, afterBytes: expected.afterBytes, afterSha256: expected.afterSha256 });
assert.equal(sha(raw.cssCandidate.css), expected.matrixCssSha256); assert.equal(Buffer.byteLength(raw.cssCandidate.css), expected.matrixCssBytes);
assert.deepEqual(raw.abortDiagnostic.stagedAdapters.map(({ bytes, sha256 }) => ({ bytes, sha256 })),
  Array(3).fill({ bytes: 18330, sha256: "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837" }));
const facts = progressFullTerminalFacts(raw); assert.deepEqual(facts.native, c.native);
const observation = { workCheckpoints: [], lastProgressObservation: null, unavailableProgressSamples: 0 };
for (const sample of raw.samples.filter(row => row.phase === "conversion-1")) recordOutputWorkCheckpoint(observation, { jobState: sample.jobState, metrics: sample.metrics });
// The bounded long-run sample ring has evicted early samples. Do NOT claim
// independent reconstruction of early timing from missing samples or replay.
assert.deepEqual(observation.lastProgressObservation, raw.progressProbe.lastProgressObservation);
assert.equal(observation.unavailableProgressSamples, raw.progressProbe.unavailableProgressSamples);
for (const checkpoint of raw.progressProbe.workCheckpoints) {
  assert.equal(checkpoint.crossingTimeIsExact, false); assert.ok(checkpoint.before && checkpoint.after);
  assert.ok(checkpoint.before.outputBytes < checkpoint.thresholdBytes && checkpoint.after.outputBytes >= checkpoint.thresholdBytes);
  assert.equal(checkpoint.lowerElapsedMs, checkpoint.before.elapsedMs); assert.equal(checkpoint.upperElapsedMs, checkpoint.after.elapsedMs);
  assert.ok(checkpoint.lowerElapsedMs <= checkpoint.upperElapsedMs);
}
const workWindows = compareOutputWorkWindows(base.progressProbe.workCheckpoints, raw.progressProbe.workCheckpoints);
assert.deepEqual(workWindows, receipt.workWindows);
const binaryPath = "work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.wasm", binary = await read(binaryPath);
assert.equal(sha(binary), "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
const actualStackSymbols = symbolizeWasmStack(raw.abortDiagnostic.records[0].stack, readWasmFunctionNames(binary));
assert.ok(actualStackSymbols.every(frame => frame.functionNameFromActualBinary));
assert.ok(actualStackSymbols.some(frame => frame.functionNameFromActualBinary === "alloc_frame" && frame.functionIndex === 2060));
const identities = [...raw.nativeMemory.identities, ...raw.ownedLaunches.map(row => row.identity), receipt.ownedDriver];
const ids = [...new Set(identities.map(row => row.pid))]; assert.ok(ids.length > 0 && ids.length <= 128);
const filter = ids.map(pid => { assert.ok(Number.isSafeInteger(pid) && pid > 0); return `ProcessId = ${pid}`; }).join(" OR ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{ pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 65536 });
const current = JSON.parse(stdout); assert.ok(Array.isArray(current));
assert.ok(!current.some(now => identities.some(prior => prior.pid === now.pid && prior.parentPid === now.parentPid &&
  Math.abs(Date.parse(prior.createdAt) - Date.parse(now.createdAt)) <= 1)), "Recorded owned identity still present");
const cleanupIdentities = { ...verifyJsProbeIdentityAbsence(identities, current), conservativeBirthToleranceMs: 1 };
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(raw.cleanup[key], true, key);
assert.ok(!raw.cleanup.errors?.length); assert.equal(receipt.driverAbsent.status, "owned-identity-absent");
for (const directory of [raw.runtimeDirectory, receipt.wrapperPath]) {
  assert.ok(path.relative(root, directory).startsWith("work" + path.sep)); await assert.rejects(access(directory), { code: "ENOENT" });
}
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const digest = createHash("sha256"); for await (const chunk of createReadStream(original)) digest.update(chunk);
assert.equal(digest.digest("hex"), raw.source.sha256);
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const restoration = JSON.parse(await read("evidence/2026-10-08T13-49-53-644Z-stable-progress-ui-headless-golden-validation.json"));
for (const [file, hash] of Object.entries(restoration.cleanup.restoredAssetHashes)) assert.equal(sha(await read("dist/client/engines/remux/" + file)), hash);
for (const file of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs",
  "mpeg2-split-copy-kernel.mjs", "mpeg2-split-copy.wasm"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
const buildBytes = await read(receipt.buildProof.path); assert.equal(sha(buildBytes), receipt.buildProof.sha256);
const build = JSON.parse(buildBytes); assert.deepEqual(build.asset, receipt.expectedApp); assert.equal(build.stylesheet.sha256, expected.sha256);
const artifacts = [];
for (const suffix of ["-trace.zip", ".csv", ".html"]) {
  const file = c.rawReport.path.replace(/\.json$/, suffix), bytes = await read(file);
  assert.ok(bytes.length > 0 && bytes.length <= 1048576); artifacts.push({ path: file, bytes: bytes.length, sha256: sha(bytes) });
}
const result = { recordedAt: new Date().toISOString(), status: "full-attempt-decoder-oom-below-observed250-not-acceptance",
  receipt: { path: receiptPath, sha256: sha(receiptBytes) }, completeExecutedSourcePreimagesVerified: 151,
  completeDriverSourceListNowVerified: true, driverUniqueSourceFiles: 132, exactDriverAndHelperReconstructed: true,
  reusedBaselineNoRerun: true, sameFullProtectedSource: true, sameChromeBinaryHashes: true, sameNativeModulesAndLimits: true,
  actualServedApp: receipt.expectedApp, actualServedStylesheet: expected, identicalHistoricalPrivateCssSuffix: true,
  ...facts, actualStackSymbols, actualDecoderBinary: { path: binaryPath, bytes: binary.length, sha256: sha(binary) },
  workWindows, earlyWorkCheckpointSamplesEvictedFromBoundedRing: true, earlyTimingIndependentlyReconstructed: false,
  cleanupIdentities, normalProductionAndEngineAssetsRestored: true, allElevenPrivateAssetsAbsent: true,
  fullProtectedPostSha256Verified: true, terminalArtifacts: artifacts, rawLosslesslyArchivedAndRedundantJsonRemoved: true,
  browserMode: "headless", windowsHidden: true, headedManualValidation: false,
  analysisSourcePins: Object.fromEntries(await Promise.all(["scripts/analyze-progress-compositing-full-terminal.mjs", "scripts/lib/progress-full-terminal-facts.mjs"].map(async file => [file, sha(await read(file))]))),
  decision: "Keep private; failed at late HEVC pool allocation despite observed whole-tree increase below250. No unchanged full replay. Inspect actual aligned-allocation path before choosing a bounded fix." };
const output = receiptPath.replace(/\.json$/, "-analysis.json");
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: result.status, incrementalMiB: facts.native.observedIncrementalPrivateMiB,
  frames: facts.finalOwnership.frames, identities: cleanupIdentities.originalIdentityCount, protectedShaVerified: true }));
