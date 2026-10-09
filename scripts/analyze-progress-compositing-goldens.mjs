// Independently verify the executed suite. Keep the original controller failure intact.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeProgressCompositingGoldens, compareProgressCompositingUi } from "./lib/progress-compositing-golden-recipe.mjs";
import { makeProgressCompositingCandidate } from "./lib/progress-compositing-recipe.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofPath = "evidence/2026-10-09T15-42-44-939Z-progress-compositing-goldens.json", proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
assert.equal(proof.status, "failed-or-incomplete");
assert.ok(proof.failure.startsWith("\nValidation: AssertionError [ERR_ASSERTION]: Inspect PID reuse; never kill unrelated processes"));
assert.equal(proof.analysis.maximumDeltaCssPixels, 0); assert.equal(proof.analysis.matchingHeadlessGeometryAccepted, true);
assert.deepEqual(proof.sourcePins, proof.postSourcePins);
const decode = async (record, rawHash, rawBytes, maximum = 8388608) => {
  const compressed = await read(record.path); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const bytes = gunzipSync(compressed, { maxOutputLength: maximum }); assert.equal(sha(bytes), rawHash); assert.equal(bytes.length, rawBytes);
  return bytes;
};
const generatedBytes = await decode(proof.generatedArchive, proof.generatedArchive.restoredSha256, proof.generatedArchive.restoredBytes);
const generated = JSON.parse(generatedBytes);
assert.deepEqual(Object.keys(generated.pinnedSources).sort(), Object.keys(proof.sourcePins).sort());
for (const [file, text] of Object.entries(generated.pinnedSources)) assert.equal(sha(text), proof.sourcePins[file], file);
// Research recipes remain versioned; public source evolution need not invalidate preimages.
for (const file of ["scripts/lib/progress-compositing-golden-recipe.mjs", "scripts/lib/stable-ui-headless-baseline-recipe.mjs", "scripts/lib/progress-compositing-recipe.mjs"])
  assert.equal(sha(await read(file)), proof.sourcePins[file] ?? sha(generated.pinnedSources[file]));
const baselineBytes = await read(proof.baseline.path); assert.equal(sha(baselineBytes), proof.baseline.sha256);
const baseline = JSON.parse(baselineBytes), baselineGzip = await read(baseline.compressedReport.path);
assert.equal(sha(baselineGzip), baseline.compressedReport.sha256);
const baselineRaw = gunzipSync(baselineGzip, { maxOutputLength: 2097152 }); assert.equal(sha(baselineRaw), baseline.rawReport.sha256);
const baselineReport = JSON.parse(baselineRaw);
const referenceBytes = await read(baseline.reference.path); assert.equal(sha(referenceBytes), baseline.reference.sha256);
const reference = JSON.parse(referenceBytes), executedGzip = await read(reference.generatedArchive.path);
assert.equal(sha(executedGzip), reference.generatedArchive.sha256);
const executed = JSON.parse(gunzipSync(executedGzip, { maxOutputLength: 262144 }));
const buildBytes = await read(proof.buildProofPath), build = JSON.parse(buildBytes);
assert.equal(build.candidateTypeDiagnostics, 0); assert.equal(build.candidateLintErrors, 0); assert.equal(build.candidateLintWarnings, 0);
assert.equal(build.engineChanged, false); assert.equal(build.codecOptionsChanged, false); assert.equal(build.limitsChanged, false);
const app = await decode(build.appArchive, build.appArchive.rawSha256, build.appArchive.rawBytes);
const css = await decode(build.cssArchive, build.cssArchive.rawSha256, build.cssArchive.rawBytes);
assert.equal(app.length, build.asset.bytes); assert.equal(sha(app), build.asset.sha256);
assert.equal(css.length, build.stylesheet.bytes); assert.equal(sha(css), build.stylesheet.sha256);
const recipe = makeProgressCompositingCandidate(generated.pinnedSources["app/converter/ConverterApp.tsx"], generated.pinnedSources["app/globals.css"]);
const savedRecipe = JSON.parse(await decode(build.sourceArchive, build.sourceArchive.rawSha256, build.sourceArchive.rawBytes));
assert.deepEqual(recipe, savedRecipe);
const stamp = "2026-10-09T15-42-44-939Z";
const rebuilt = makeProgressCompositingGoldens(executed, root, proof.cleanup.ownedWrapper, stamp, build.asset, build.stylesheet, css);
assert.deepEqual({ ...rebuilt, pinnedSources: generated.pinnedSources }, generated);
const reportRaw = await decode(proof.report.archive, proof.report.rawSha256, proof.report.rawBytes, 2097152);
const report = JSON.parse(reportRaw), rows = kind => report.rows.filter(row => row.kind === kind);
const conversions = report.rows.filter(row => !row.kind && row.status === "passed"), expected = baselineReport.rows.filter(row => !row.kind && row.status === "passed");
assert.equal(conversions.length, 3);
for (let i = 0; i < 3; i++) {
  for (const field of ["sourceBytes", "outputBytes", "outputCodec", "frames", "audioTracks", "ssim", "timestampAlignedSsim", "outputSha256", "destination",
    "sourceCodec", "audioPacketHashes", "sourceFrameTimes", "outputFrameTimes", "warnings"])
    assert.deepEqual(conversions[i][field], expected[i][field], field);
  const m = conversions[i].metrics; assert.equal(m.peakWasmMemoryBytes, 50331648); assert.equal(m.peakPendingOperations, 1);
  assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0);
  assert.ok(m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 524288 && m.peakQueuedBytes <= 524288);
}
for (const kind of ["actual-served-progress-compositing-candidate", "matrix-static-stylesheet"]) assert.equal(rows(kind).length, 5);
for (const row of rows("actual-served-progress-compositing-candidate")) assert.deepEqual({ url: row.url, bytes: row.bytes, sha256: row.sha256 }, build.asset);
for (const kind of ["independent-frame-diagnostic", "independent-decoded-audio", "copied-audio-timing-passed", "independent-presentation-timeline-passed", "attached-picture-preservation"])
  assert.equal(rows(kind).length, 3);
for (const row of rows("independent-frame-diagnostic")) assert.equal(row.nativeFullDecodePassed, true);
for (const row of rows("independent-decoded-audio")) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
for (const row of rows("attached-picture-preservation")) assert.equal(row.status, "passed");
for (const kind of ["direct-write-failure", "cancel-after-direct-output"]) {
  assert.equal(rows(kind).length, 1); assert.equal(rows(kind)[0].status, "passed"); assert.deepEqual(rows(kind)[0].partialBytes, []);
}
const inventories = report.rows.filter(row => "cleanupRemovedEntries" in row); assert.equal(inventories.length, 5);
for (const row of inventories) assert.deepEqual(row.cleanupRemovedEntries, []);
assert.equal(rows("actual-split-native-ownership").length, 5);
for (const row of rows("actual-split-native-ownership")) {
  assert.ok(row.samples.length > 0);
  for (const sample of row.samples) {
    assert.equal(sample.aggregateWasmMemoryBytes, 50331648); assert.equal(sample.activePackets, 0);
    assert.equal(sample.queuedPackets, 0); assert.equal(sample.queuedFrames, 0); assert.equal(sample.closed, true);
    assert.equal(sample.additionalPixelBufferBytes, 0); assert.equal(sample.additionalJsPacketBufferBytes, 0);
    assert.equal(sample.copyKernel, undefined, "Original JS transport, not rejected copy-kernel candidate");
  }
}
const normalCss = await read("dist/client/assets/index-CIzbeB0A.css");
const analysis = compareProgressCompositingUi(report, baselineReport, generated.stylesheetBinding, normalCss, generated.historicMatrixCss);
assert.deepEqual(analysis, proof.analysis);
const screenshots = [];
for (const row of rows("matrix-ui-observation")) {
  const bytes = await read(row.screenshot.path); assert.equal(bytes.length, row.screenshot.bytes); assert.equal(sha(bytes), row.screenshot.sha256);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a"); screenshots.push(row.screenshot);
}
assert.equal(screenshots.length, 6);
const helper = proof.cleanup.helpersBirthIdentities, helperBytes = await read(helper.path); assert.equal(sha(helperBytes), helper.sha256);
const savedHelper = JSON.parse(helperBytes); assert.deepEqual(savedHelper.launchRecords, helper.launchRecords); assert.equal(savedHelper.runtimeAbsent, true);
const helperAudit = [];
for (const row of savedHelper.launchRecords) {
  const result = await observeOwnedProcessExit(row.identity); assert.equal(result.status, "owned-identity-absent"); helperAudit.push({ role: row.role, ...result });
}
for (const directory of [proof.cleanup.ownedWrapper, savedHelper.runtime]) {
  assert.ok(path.relative(root, directory).startsWith("work" + path.sep)); await assert.rejects(access(directory), { code: "ENOENT" });
}
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
const prior = JSON.parse(await read(baseline.candidateValidation.path));
for (const [file, hash] of Object.entries(prior.cleanup.restoredAssetHashes)) assert.equal(sha(await read("dist/client/engines/remux/" + file)), hash);
for (const file of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs",
  "mpeg2-split-copy-kernel.mjs", "mpeg2-split-copy.wasm"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
const sampled = report.rows.flatMap(row => row.samples ?? []), pids = [...new Set(sampled.flatMap(row => row.processes ?? []).map(row => row.pid))];
assert.ok(pids.length > 0 && pids.length <= 128);
const query = pids.map(pid => { assert.ok(Number.isSafeInteger(pid) && pid > 0); return `ProcessId = ${pid}`; }).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{ pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o'); name=$_.Name } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const nativeFollowUp = { recordedAt: new Date().toISOString(), queriedPids: pids, current: JSON.parse(stdout), noProcessesKilled: true,
  nativeBrowserBirthsUnavailable: true, fullIdentityCleanupCertified: false };
assert.ok(Array.isArray(nativeFollowUp.current));
nativeFollowUp.reusedPidObservations = [];
for (const current of nativeFollowUp.current) {
  const old = sampled.filter(row => (row.processes ?? []).some(entry => entry.pid === current.pid));
  const parents = [...new Set(old.flatMap(row => row.processes.filter(entry => entry.pid === current.pid)).map(row => row.parentPid))];
  const lastSeen = Math.max(...old.map(row => Date.parse(row.timestamp)));
  assert.ok(old.length > 0 && Number.isFinite(lastSeen) && Date.parse(current.createdAt) > lastSeen && !parents.includes(current.parentPid),
    "Never infer old process exit from a query failure, matching parent or unknown creation time");
  nativeFollowUp.reusedPidObservations.push({ ...current, sampledParents: parents, sampledLastAt: new Date(lastSeen).toISOString(),
    laterBirthAndDifferentParent: true, noProcessesKilled: true });
}
nativeFollowUp.originalSampledProcessesNotPresentAtFollowUp = true;
// Captured post-check PID has another parent, not the original sampled renderer.
const transient = proof.cleanup.numericBrowserPidsAbsent.current; assert.equal(transient.length, 1);
assert.deepEqual(transient[0], { ParentProcessId: 38072, ProcessId: 38860 });
const old38860 = sampled.flatMap(row => row.processes ?? []).filter(row => row.pid === 38860);
assert.ok(old38860.length > 0 && old38860.every(row => row.type === "renderer" && row.parentPid === 26052));
const protectedPath = path.join(root, "test.mkv"), protectedBytes = (await stat(protectedPath)).size; assert.equal(protectedBytes, 2958573265);
const protectedHash = createHash("sha256"); for await (const chunk of createReadStream(protectedPath)) protectedHash.update(chunk);
const protectedSha256 = protectedHash.digest("hex"); assert.equal(protectedSha256, proof.protectedPre.sha256); assert.deepEqual(proof.protectedPre, proof.protectedPost);
const baselineCssArchivePath = `outputs/reports/${stamp}-progress-compositing-normal-client.css.gz`, compressedCss = gzipSync(normalCss, { level: 9 });
await writeFile(path.join(root, baselineCssArchivePath), compressedCss, { flag: "wx" });
assert.deepEqual(gunzipSync(await read(baselineCssArchivePath)), normalCss);
const result = { recordedAt: new Date().toISOString(), status: "independently-verified-five-goldens-with-follow-up-numeric-cleanup", originalControllerFailurePreserved: true,
  proof: { path: proofPath, sha256: sha(proofBytes) }, build: { path: proof.buildProofPath, sha256: sha(buildBytes) },
  executedSourcePreimages: Object.keys(generated.pinnedSources).length, exactGeneratedSourcesReconstructed: true,
  conversions: conversions.map(row => ({ sourceCodec: row.sourceCodec, destination: row.destination, frames: row.frames, audioTracks: row.audioTracks,
    outputBytes: row.outputBytes, outputSha256: row.outputSha256, ssim: row.ssim, timestampAlignedSsim: row.timestampAlignedSsim })),
  actualServedApp: build.asset, actualServedStylesheet: generated.stylesheetBinding, geometry: analysis,
  independentFullDecode: 3, decodedPcmPreserved: 3, copiedAudioTiming: 3, presentationTimeline: 3, artworkPreserved: 3,
  recoveryPassed: ["direct-write-failure", "cancel-after-direct-output"], emptyStorageInventories: inventories.length,
  protectedFixture: { bytes: protectedBytes, sha256: protectedSha256 }, cleanup: { helperAudit, nativeFollowUp, normalProductionRestored: true,
    namedRuntimePathsAbsent: true, privateAssetsAbsent: 11, transientPid: { pid: 38860, sampledParentPid: 26052, postCheckParentPid: 38072,
      parentMismatchObserved: true, currentlyAbsent: true, browserBirthIdentityUnavailable: true, noProcessesKilled: true } },
  normalStylesheetArchive: { path: baselineCssArchivePath, bytes: compressedCss.length, sha256: sha(compressedCss), rawBytes: normalCss.length, rawSha256: sha(normalCss) },
  screenshots, visualReview: { reviewedByMainAgent: true, observations: "All six actual screenshots reviewed: three saved, write failure, real running output and cancelled state. Bar/layout visually preserved.",
    limitation: "Historical private staged adapter retains published route labels/settings disclosures; screenshots are not acceptance of that UI for the private MPEG2 route." },
  browserMode: "headless", subprocessWindowsHidden: true, headedManualValidation: false, originalFullSourceAcceptance: false,
  completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false, publicAcceptance: false };
const output = `evidence/${stamp}-progress-compositing-golden-analysis.json`;
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: result.status, sourcePreimages: result.executedSourcePreimages, geometryDelta: analysis.maximumDeltaCssPixels,
  fullIdentityCleanupCertified: false, normalProductionRestored: true }));
