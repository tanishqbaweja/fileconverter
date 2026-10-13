// Same qualified production I/O/recovery suite, changed native decoder only.
import assert from "node:assert/strict";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { inputReadMediaSourceFiles, makeInputReadMediaBrowserRecipe, makeInputReadMediaCaller } from "./input-read-media-recipe.mjs";
import { inspectBitrateDiagnostic } from "./encoder-plane-bitrate-browser-recipe.mjs";
import { inspectRecoveryDiagnostic } from "./encoder-plane-recovery-browser-recipe.mjs";
import { verifyPacketLargestIdleNativeEnvelope } from "./packet-largest-idle-native-envelope.mjs";
const controlStamp = "2026-10-13T00-53-07-022Z", decoderSlot = "work/mpeg2-packet-largest-idle-38327579000";
const oldSha = "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb";
const decoderSha = "7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439";
function once(source, before, after) { assert.equal(source.split(before).length, 2, before.slice(0, 160)); return source.replace(before, after); }
async function components(root) {
  const read = file => readFile(path.join(root, file));
  const witnessPath = `evidence/${controlStamp}-packet-largest-idle-abort-control-executed-sources.json`;
  const witness = JSON.parse(await read(witnessPath)), proofBytes = await read(witness.proof.path), proof = JSON.parse(proofBytes);
  assert.equal(sha(proofBytes), "2539d7f99dfbd409aa7e86cc0dbdcbddea51e5a4280e32914e16d5a2ec50560f");
  assert.equal(witness.proof.sha256, sha(proofBytes)); assert.equal(witness.failure, null);
  assert.equal(proof.status, "passed-synthetic-abort-control"); assert.equal(proof.exportOnlyControl.originalSha256, decoderSha);
  assert.equal(proof.result.terminal.emitted.allocationAttemptUnavailable, null);
  assert.equal(proof.result.terminal.emitted.allocatorFreeBlocksUnavailable, null);
  assert.deepEqual(witness.sourcePins, witness.postSourcePins);
  const zipped = await read(witness.archive.path); assert.equal(sha(zipped), witness.archive.sha256);
  const restored = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(restored), witness.archive.restoredSha256);
  const archive = JSON.parse(restored);
  for (const [file, hash] of Object.entries(witness.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(archive.preimages[file], "base64")), hash, file);
  }
  const bytes = await read(witness.layout.build.path), build = JSON.parse(bytes);
  const branch = JSON.parse(await read(witness.layout.branch.path)); assert.equal(sha(bytes), witness.layout.build.sha256);
  const envelope = await verifyPacketLargestIdleNativeEnvelope(root, build, bytes, branch);
  assert.deepEqual(envelope, witness.layout.nativeSourceEnvelope); assert.deepEqual(envelope, witness.nativeSourceEnvelopePost);
  for (const row of build.files) { const bytes = await read(`${decoderSlot}/${row.file}`); assert.equal(sha(bytes), row.sha256); assert.equal(bytes.length, row.bytes); }
  const priorBytes = await read("evidence/2026-10-12T19-28-30-102Z-input-read-media.json");
  assert.equal(sha(priorBytes), "c5df28ee7e46f8519445b97c63d578939c18ebbc5f98ab86b074098bd1b49c4d");
  const prior = JSON.parse(priorBytes), record = prior.report.archive, compressed = await read(record.path);
  assert.equal(sha(compressed), record.sha256);
  const raw = gunzipSync(compressed, { maxOutputLength: 2097152 }); assert.equal(sha(raw), record.restoredSha256);
  const baselineManifest = JSON.parse(raw).manifest;
  const base = structuredClone(baselineManifest); delete base.asyncifyStorage;
  base.artifacts["within-mpeg2-split.mjs"] = build.manifest.artifacts["within-mpeg2-split.mjs"];
  assert.equal(sha(JSON.stringify(base)), "6dd46664640139cc594f58eb52ae2000c7420eccaeecd1ab4259d154ac2402d1");
  return { witnessPath, witness, proof, build, envelope, baselineManifest };
}
export async function largestIdleMediaSourceFiles(root) {
  const { witnessPath, witness, build } = await components(root);
  return [...new Set([...await inputReadMediaSourceFiles(root), ...Object.keys(witness.sourcePins), ...Object.keys(build.manifest.sources),
    witnessPath, witness.proof.path, "scripts/lib/packet-largest-idle-media-recipe.mjs", "scripts/qualify-packet-largest-idle-media.mjs",
    "tests/packet-largest-idle-media.test.mjs"])];
}
function inline(source) {
  return source.replace(/^import[^;]+;\n/gm, "").replaceAll("export function ", "function ").replaceAll("export const ", "const ");
}
function expectedManifest(prior, build, witness, envelope) {
  const manifest = structuredClone(prior);
  for (const row of build.files) {
    if (["build-manifest.json", "split-encoder.mjs", "split-encoder.wasm", "encoder-initialization.json", "within-mpeg2-split.mjs"].includes(row.file)) continue;
    manifest.artifacts[row.file] = row.sha256;
  }
  for (const [file, hash] of Object.entries(build.manifest.sources)) {
    if (file === ".github/workflows/reproduce-ffmpeg-nondocker.yml") continue;
    if (manifest.sources[file]) assert.equal(manifest.sources[file], hash);
    manifest.sources[file] = hash;
  }
  manifest.packetCache = build.manifest.packetCache; manifest.packetLargestIdle = build.manifest.packetLargestIdle;
  manifest.provenance.decoder = { run: build.run.databaseId, commit: build.run.headSha,
    workflowSha256: build.manifest.sources[".github/workflows/reproduce-ffmpeg-nondocker.yml"],
    buildPath: witness.layout.build.path, buildSha256: witness.layout.build.sha256 };
  manifest.componentProofs.decoder = { path: witness.layout.build.path, sha256: witness.layout.build.sha256 };
  manifest.componentProofs.compositeObserver = { path: witness.proof.path, sha256: witness.proof.sha256 };
  manifest.componentProofs.nativeExecutedSources = envelope;
  return manifest;
}
async function swapCandidate(root, directory, prior) {
  const { build, envelope, witness, baselineManifest } = await components(root);
  assert.deepEqual(prior.manifest, baselineManifest);
  const manifest = expectedManifest(prior.manifest, build, witness, envelope), files = structuredClone(prior.files);
  assert.equal(prior.manifest.artifacts["within-mpeg2-split.wasm"], oldSha);
  assert.equal(build.manifest.artifacts["within-mpeg2-split.mjs"], manifest.asyncifyStorage.originalGlueSha256);
  for (const row of build.files) {
    if (["build-manifest.json", "split-encoder.mjs", "split-encoder.wasm", "encoder-initialization.json", "within-mpeg2-split.mjs"].includes(row.file)) continue;
    const target = path.join(directory, row.file);
    assert.equal(sha(await readFile(target)), prior.manifest.artifacts[row.file]);
    await copyFile(path.join(root, decoderSlot, row.file), target);
    assert.equal(sha(await readFile(target)), row.sha256);
    manifest.artifacts[row.file] = row.sha256; files[row.file] = { path: `${decoderSlot}/${row.file}`, bytes: row.bytes, sha256: row.sha256 };
  }
  await writeFile(path.join(directory, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { ...prior, manifest, files };
}
export async function verifyLargestIdleMediaCandidate(root, directory) {
  assert.equal(path.dirname(directory), path.join(root, "work"));
  const { build, envelope, witness, baselineManifest } = await components(root), manifest = JSON.parse(await readFile(path.join(directory, "build-manifest.json")));
  assert.deepEqual(manifest, expectedManifest(baselineManifest, build, witness, envelope));
  assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], decoderSha);
  assert.equal(manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.deepEqual(manifest.packetLargestIdle, build.manifest.packetLargestIdle);
  assert.deepEqual(manifest.componentProofs.nativeExecutedSources, envelope);
  assert.equal(manifest.asyncifyStorage.reservationBytes, 262156); assert.equal(manifest.asyncifyStorage.maximumLeases, 1);
  assert.equal(manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(manifest.allowMemoryGrowth, false);
  for (const [file, hash] of Object.entries(manifest.artifacts)) assert.equal(sha(await readFile(path.join(directory, file))), hash, file);
  return manifest;
}
export async function makeLargestIdleMediaBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  const old = await makeInputReadMediaBrowserRecipe(sources, root, runtime, stamp, branch, build);
  const composition = await swapCandidate(root, runtime, old.composition);
  await verifyLargestIdleMediaCandidate(root, runtime);
  const read = file => readFile(path.join(root, "scripts/lib", file), "utf8");
  const prefix = async kind => inline(await read(`${kind}-attempt-abort-capture.mjs`)) + "\n" + inline(await read(`${kind}-composite-abort-capture.mjs`)) + "\n";
  const oldPrefix = await prefix("packet-cache"), newPrefix = await prefix("packet-largest-idle");
  const start = old.stage.indexOf("const adapter = "), end = old.stage.indexOf(";\nconst replacing = ", start);
  const literal = old.stage.slice(start + "const adapter = ".length, end), adapter = JSON.parse(literal);
  let updated = once(adapter, oldPrefix, newPrefix);
  updated = once(updated, `qualifiedBinarySha256: "${oldSha}"`, `qualifiedBinarySha256: "${decoderSha}"`);
  let stage = once(old.stage, literal, JSON.stringify(updated));
  stage = once(stage,
    `import { verifyAsyncifyStorageCandidate } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/asyncify-storage-media-recipe.mjs")).href)};`,
    `import { verifyLargestIdleMediaCandidate } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/packet-largest-idle-media-recipe.mjs")).href)};`);
  stage = once(stage, "await verifyAsyncifyStorageCandidate(root, source);", "await verifyLargestIdleMediaCandidate(root, source);");
  return { ...old, stage, composition, largestIdleDecoderOnly: true, qualifiedPacketFailureCapture: true, publicAcceptance: false };
}
function inspectBase(report, baseline, build) {
  const boundary = report.rows.findIndex(row => row.kind === "direct-write-failure"); assert.ok(boundary > 0);
  const normal = inspectBitrateDiagnostic({ ...report, rows: report.rows.slice(0, boundary) }, baseline, build, 4000000);
  assert.equal(normal.caseStatus, "passed"); assert.ok(normal.ordinalSsim >= 0.98);
  const recovery = inspectRecoveryDiagnostic(report, baseline, build);
  for (const row of recovery.results) { assert.deepEqual(row.analysis.input, normal.input); assert.equal(row.analysis.outputBytes, normal.outputBytes); }
  assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"], decoderSha);
  const samples = report.rows.filter(row => row.kind === "actual-asyncify-storage-lifecycle").flatMap(row => row.samples);
  assert.equal(samples.length, 5);
  for (const row of samples) {
    assert.equal(row.allocations, 1); assert.equal(row.frees, 1); assert.ok(row.acquisitions > 1);
    assert.equal(row.activeLeases, 0); assert.equal(row.retainedBytes, 0); assert.equal(row.reservationBytes, 262156);
    assert.equal(row.maximumLeases, 1); assert.equal(row.closing, true); assert.equal(row.abortedReleaseDeferredUntilWorkerTermination, false);
  }
  return { normal, recovery, actualAsyncifyLifecycleSamples: samples, genuineValidatedConversions: 3, publicAcceptance: false };
}
export function inspectLargestIdleMediaReport(report, baseline, build) {
  const boundary = report.rows.findIndex(row => row.kind === "input-read-control-start"); assert.ok(boundary > 0);
  const previous = inspectBase({ ...report, rows: report.rows.slice(0, boundary) }, baseline, build);
  assert.deepEqual(report.rows.slice(0, boundary).filter(row => row.kind === "input-read-diagnostics").flatMap(row => row.samples), []);
  const rows = report.rows.slice(boundary), adverse = rows.filter(row => row.kind === "input-read-failure");
  assert.equal(adverse.length, 1); assert.equal(adverse[0].status, "passed"); assert.ok(adverse[0].partialBytes.every(bytes => bytes === 0));
  assert.equal(adverse[0].metrics.queuedBytes, 0); assert.equal(adverse[0].metrics.pendingOperations, 0);
  const samples = rows.filter(row => row.kind === "input-read-diagnostics").flatMap(row => row.samples); assert.equal(samples.length, 2);
  const failure = samples[0]; assert.equal(failure.exceptionName, "NotReadableError"); assert.equal(failure.exceptionCode, 0);
  assert.equal(failure.messageClass, "injected-control"); assert.equal(failure.requestedBytes, 65536); assert.equal(failure.failureOrdinal, 1);
  assert.equal(failure.inputSize, previous.normal.input.bytes); assert.ok(Number.isSafeInteger(failure.offset) && failure.offset >= 0 && failure.offset < failure.inputSize);
  assert.deepEqual(samples[1], { ...failure, failureOrdinal: 2 });
  const markers = rows.filter(row => row.kind === "validated-same-page-recovery"); assert.equal(markers.length, 1);
  const marker = markers[0]; assert.equal(marker.phase, "input-read-failure"); assert.equal(marker.noPageReload, true);
  for (const field of ["retiredWorkerAbsent", "productionReplacementWorkerUsed", "completedWorkerRetired"]) assert.equal(marker[field], true);
  const recovered = inspectBitrateDiagnostic({ ...report, rows: report.rows.slice(marker.startRow, marker.endRow) }, baseline, build, 4000000);
  assert.equal(recovered.caseStatus, "passed"); assert.deepEqual(recovered.input, previous.normal.input); assert.equal(recovered.outputBytes, previous.normal.outputBytes);
  const leases = rows.filter(row => row.kind === "actual-asyncify-storage-lifecycle").flatMap(row => row.samples); assert.equal(leases.length, 2);
  for (const lease of leases) { assert.equal(lease.allocations, 1); assert.equal(lease.frees, 1); assert.equal(lease.activeLeases, 0); assert.equal(lease.retainedBytes, 0); }
  return { previous, inputReadFailures: samples, validatedInputFailureRecovery: recovered, actualExtraAsyncifyLifecycle: leases,
    genuineValidatedConversions: 4, fullOriginalAcceptance: false, publicAcceptance: false, speedImprovementProven: false };
}
export function makeLargestIdleMediaCaller(source, root) {
  const old = makeInputReadMediaCaller(source, root), url = pathToFileURL(path.join(root, "scripts/lib/packet-largest-idle-media-recipe.mjs")).href;
  let generated = once(old.generated,
    `import { makeInputReadMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectInputReadMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/input-read-media-recipe.mjs")).href)};`,
    `import { makeLargestIdleMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectLargestIdleMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(url)};`);
  generated = once(generated,
    `import { inputReadMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/input-read-media-recipe.mjs")).href)};`,
    `import { largestIdleMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(url)};`);
  generated = generated.replaceAll("${stamp}-input-read-media", "${stamp}-packet-largest-idle-media");
  return { generated, generatedSha256: sha(generated), previousCallerSha256: old.generatedSha256 };
}
