// Independent terminal verifier: exact outputs, actual served candidate, cleanup.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { makeStableProgressUiSource, recoverStableProgressUiBaseline } from "./lib/stable-progress-ui-recipe.mjs";

const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.argv.length, 3);
const envelopePath = process.argv[2];
assert.match(envelopePath, /^evidence\/\d{4}-\d{2}-\d{2}T[0-9TZ-]+-stable-progress-ui-headless-goldens\.json$/);
const envelopeBytes = await readFile(path.join(root, envelopePath)), e = JSON.parse(envelopeBytes);
assert.equal(e.status, "headless-suite-returned-success-independent-freeze-pending");
assert.equal(e.browserMode, "headless"); assert.equal(e.failure, null); assert.equal(e.reports.length, 1);
assert.deepEqual(e.sourcePins, e.postSourcePins);
for (const [file, hash] of Object.entries(e.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
for (const host of [e.hostPreflight, e.launchHostPreflight]) {
  assert.equal(host.safeToStart, true); assert.ok(host.freePhysicalBytes >= 2 * 1024 ** 3 && host.freeVirtualBytes >= 2 * 1024 ** 3);
  assert.equal(host.primaryConversionLimitMiB, 250); assert.equal(host.primaryMemoryFormulaChanged, false);
}
assert.deepEqual(e.protectedPre, e.protectedPost); assert.equal(e.protectedPre.bytes, 2958573265);
assert.equal(e.protectedPre.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(e.cleanup.restoredProductionBuild, true);
await assert.rejects(access(e.cleanup.ownedWrapper), { code: "ENOENT" });
const generatedArchive = await readFile(path.join(root, e.generatedArchive.path));
assert.equal(sha(generatedArchive), e.generatedArchive.sha256); assert.equal(generatedArchive.length, e.generatedArchive.bytes);
const generated = JSON.parse(gunzipSync(generatedArchive, { maxOutputLength: 262144 }));
for (const [name, code] of Object.entries(generated)) assert.equal(sha(code), e.generatedHashes[name]);
assert.ok(generated.spec.includes("headless: true")); assert.ok(!generated.spec.includes("headless: false"));
assert.ok(generated.spec.includes('viewport: { width: 1280, height: 900 }'));
const buildBytes = await readFile(path.join(root, e.buildProof)), build = JSON.parse(buildBytes);
const candidateArchive = await readFile(path.join(root, build.archive.path)); assert.equal(sha(candidateArchive), build.archive.sha256);
const candidate = gunzipSync(candidateArchive, { maxOutputLength: 262144 }).toString();
assert.equal(sha(candidate), build.candidateSha256);
const baseline = await readFile(path.join(root, "app/converter/ConverterApp.tsx"), "utf8");
assert.equal(recoverStableProgressUiBaseline(candidate), baseline); assert.equal(makeStableProgressUiSource(baseline), candidate);
assert.equal(build.candidateLintErrors, 0); assert.equal(build.candidateLintWarnings, 0); assert.equal(build.candidateTypeDiagnostics, 0);

const record = e.reports[0]; assert.match(record.path, /^output\/playwright\/[0-9TZ.:-]+-mpeg2-split-pipeline-37739125738-direct-artwork\.json$/);
const rawPath = path.resolve(root, record.path); assert.equal(path.dirname(rawPath), path.join(root, "output", "playwright"));
const rawIdentity = await lstat(rawPath, { bigint: true }); assert.ok(rawIdentity.isFile() && !rawIdentity.isSymbolicLink());
assert.equal(await realpath(rawPath), rawPath);
const raw = await readFile(rawPath); assert.ok(raw.length < 2 * 1048576); assert.equal(raw.length, record.bytes); assert.equal(sha(raw), record.sha256);
const report = JSON.parse(raw); assert.equal(report.candidateName, "mpeg2-split-pipeline-37739125738");
assert.equal(report.manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(report.manifest.allowMemoryGrowth, false);
const conversions = report.rows.filter(row => !row.kind && row.status === "passed"); assert.equal(conversions.length, 3);
for (const row of conversions) {
  const hevc = row.sourceCodec === "hevc";
  assert.equal(row.outputCodec, "mpeg2video"); assert.equal(row.outputBytes, hevc ? 652521 : 321692);
  assert.equal(row.frames, hevc ? "96" : "48"); assert.equal(row.ssim, hevc ? 0.985963 : 0.992146);
  assert.equal(row.outputSha256, hevc ? "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32" : "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94");
  assert.equal(row.metrics.peakPendingOperations, 1); assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
  assert.equal(row.metrics.peakWasmMemoryBytes, 50331648);
  assert.ok(row.metrics.maxReadChunkBytes <= 65536 && row.metrics.maxWriteChunkBytes <= 524288 && row.metrics.peakQueuedBytes <= 524288);
}
const selected = kind => report.rows.filter(row => row.kind === kind);
const nativeOwnership = selected("actual-split-native-ownership"); assert.equal(nativeOwnership.length, 5);
for (const row of nativeOwnership) {
  assert.ok(row.samples.length > 0 && row.samples.length <= 16);
  for (const sample of row.samples) {
    assert.equal(sample.closed, true); assert.equal(sample.activePackets, 0);
    assert.equal(sample.queuedFrames, 0); assert.equal(sample.queuedPackets, 0);
    assert.equal(sample.aggregateWasmMemoryBytes, 50331648);
    assert.equal(sample.additionalPixelBufferBytes, 0); assert.equal(sample.additionalJsPacketBufferBytes, 0);
    assert.ok(sample.maximumMediaAvioWriteBytes <= 262144);
  }
}
const frameChecks = selected("independent-frame-diagnostic"); assert.equal(frameChecks.length, 3); assert.ok(frameChecks.every(row => row.nativeFullDecodePassed));
const audioChecks = selected("independent-decoded-audio"); assert.equal(audioChecks.length, 3);
for (const row of audioChecks) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
const artworkChecks = selected("attached-picture-preservation"); assert.equal(artworkChecks.length, 3); assert.ok(artworkChecks.every(row => row.status === "passed"));
const timelines = selected("independent-presentation-timeline-passed"); assert.equal(timelines.length, 3);
const recovery = report.rows.filter(row => ["direct-write-failure", "cancel-after-direct-output"].includes(row.kind)); assert.equal(recovery.length, 2);
for (const row of recovery) { assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []); }
const inventories = report.rows.filter(row => "cleanupRemovedEntries" in row); assert.equal(inventories.length, 5);
for (const row of inventories) assert.deepEqual(row.cleanupRemovedEntries, []);
const served = selected("actual-served-stable-ui-candidate"); assert.equal(served.length, 5);
for (const row of served) assert.deepEqual({ url: row.url, bytes: row.bytes, sha256: row.sha256 }, build.assets[0]);
const ui = selected("matrix-ui-observation"); assert.equal(ui.length, 6);
assert.deepEqual(ui.map(row => row.jobState), ["complete", "complete", "complete", "error", "running", "cancelled"]);
for (const row of ui) {
  assert.equal(row.matrixCards, 405); assert.equal(row.overflow, false);
  assert.equal(row.matrixSha256, "4d2f0c1da04db1bbd47e2bee964503f510cc31c001b619bc454fe6780df8f7c1");
  assert.ok(row.rows.length > 0 && row.rows.length < 32 && row.rows.every(geometry => geometry.width > 0 && geometry.height > 0));
  const imagePath = path.resolve(root, row.screenshot.path); assert.equal(path.dirname(imagePath), path.join(root, "output", "playwright"));
  const image = await readFile(imagePath); assert.equal(image.length, row.screenshot.bytes); assert.equal(sha(image), row.screenshot.sha256);
}
assert.ok(ui[4].metrics.outputBytes > 32768);
const styles = selected("matrix-static-stylesheet"); assert.equal(styles.length, 5); assert.ok(styles.every(row => row.records.length === 1));
assert.equal(new Set(styles.map(row => row.records[0].afterSha256)).size, 1);
const pids = [...new Set(report.rows.flatMap(row => row.samples ?? []).flatMap(sample => sample.processes ?? []).map(row => row.pid))];
assert.ok(pids.length > 0 && pids.length <= 128);
const query = pids.map(pid => { assert.ok(Number.isSafeInteger(pid) && pid > 0); return `ProcessId = ${pid}`; }).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{pid=$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout);
assert.ok(current.every(row => Date.parse(row.createdAt) > Date.parse(e.recordedAt)), "Observed numeric PID absent or proven reused after terminal envelope; native births were unavailable");
const restored = {};
for (const name of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  const published = sha(await readFile(path.join(root, "public/engines/remux", name)));
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux", name))), published); restored[name] = published;
}
for (const name of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm", "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", name)), { code: "ENOENT" });
const wasm = await readFile(path.join(root, "work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.wasm"));
assert.equal(sha(wasm), "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
assert.ok(!WebAssembly.Module.exports(new WebAssembly.Module(wasm)).some(row => row.name.startsWith("control_")));
const archive = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(archive), raw);
const archivePath = record.path.replace("output/playwright/", "outputs/reports/").replace(/\.json$/, "-stable-ui-headless-goldens.json.gz");
await writeFile(path.join(root, archivePath), archive, { flag: "wx" });
assert.equal(sha(gunzipSync(await readFile(path.join(root, archivePath)))), record.sha256);
const proofPath = envelopePath.replace(/-headless-goldens\.json$/, "-headless-golden-validation.json");
const proof = { recordedAt: new Date().toISOString(), status: "passed-5-of-5-headless-private-fidelity-recovery-not-speed-or-memory-acceptance",
  executionEnvelope: { path: envelopePath, bytes: envelopeBytes.length, sha256: sha(envelopeBytes) },
  buildProof: { path: e.buildProof, bytes: buildBytes.length, sha256: sha(buildBytes) }, sourcePins: e.sourcePins,
  verifier: { path: "scripts/freeze-stable-ui-headless-goldens.mjs", sha256: sha(await readFile(new URL(import.meta.url))) },
  rawReport: record, compressedReport: { path: archivePath, bytes: archive.length, sha256: sha(archive), originalHash: record.sha256 },
  rawReportRemovedAfterLosslessArchive: true, bytesSaved: raw.length - archive.length,
  conversions: conversions.map(({ sourceCodec, destination, sourceBytes, outputBytes, outputCodec, frames, audioTracks, ssim, outputSha256, metrics }) =>
    ({ sourceCodec, destination, sourceBytes, outputBytes, outputCodec, frames, audioTracks, ssim, outputSha256, metrics })),
  nativeFullDecodePassed: true, decodedAudioHashesIdentical: true, timelinesPassed: timelines.length, artworkPassed: artworkChecks.length,
  recovery: recovery.map(({ kind, status, terminalState, partialBytes }) => ({ kind, status, terminalState, partialBytes })),
  emptyCleanupInventories: inventories.length, actualServedCandidateBindingCount: served.length, actualServedCandidate: build.assets[0],
  ui: ui.map(({ observationPhase, jobState, matrixCards, overflow, matrixSha256, screenshot }) => ({ observationPhase, jobState, matrixCards, overflow, matrixSha256, screenshot })),
  visualReview: { allSixHeadlessScreenshotsInspected: true, metricsAndButtonsReadable: true, errorAndCancelVisible: true,
    noNewOverlapOrClippingObserved: true, headedManualValidation: false,
    caveat: "Private adapter retains public remux/MPEG4 labels; not suitable for publication. Previous headed geometry differs; matched headless baseline geometry still required." },
  cleanup: { observedPidCount: pids.length, allObservedNumericPidsAbsent: current.length === 0, currentProcesses: current,
    nativeBirthsUnavailable: true, ownedWrapperAbsent: true, restoredAssetHashes: restored, privateAdditionsAbsent: true },
  originalCompiledCoreSha256: sha(wasm), protectedOriginal: e.protectedPost,
  matchingHeadlessGeometryAccepted: false, completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false,
  conversionSpeedAcceptance: false, publicAcceptance: false };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 32768);
const currentIdentity = await lstat(rawPath, { bigint: true });
for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(currentIdentity[key], rawIdentity[key]);
await writeFile(path.join(root, proofPath), json, { flag: "wx" });
await rm(rawPath); await assert.rejects(access(rawPath), { code: "ENOENT" });
console.log(JSON.stringify({ proofPath, conversions: conversions.length, recovery: recovery.length, allObservedPidsAbsent: current.length === 0,
  compressedBytes: archive.length, bytesSaved: raw.length - archive.length, originalRawRemovedRecoverable: true }));
