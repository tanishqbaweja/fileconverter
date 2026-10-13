// Fresh full-original harness: actual qualified decoder/adapter only, retaining
// all quality, full-input, repeat, memory, production I/O and cleanup gates.
import assert from "node:assert/strict";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { inspectLargestIdleMediaReport, verifyLargestIdleMediaCandidate } from "./packet-largest-idle-media-recipe.mjs";
import { createAttemptPlaneCandidate as createLegacyCandidate } from "./asyncify-storage-full-candidate.mjs";
import { makeInputReadFullCaller } from "./input-read-full-recipe.mjs";
import { loadLegacyFullSources, LEGACY_FULL_RECEIPT, LARGEST_IDLE_MEDIA_RECEIPT, SUPPLEMENTAL_LIMITS } from "./packet-largest-idle-full-sources.mjs";
const rootDefault = path.resolve(import.meta.dirname, "../..");
export const LARGEST_IDLE_FULL_FILES = ["scripts/lib/packet-largest-idle-full-recipe.mjs", "scripts/lib/packet-largest-idle-full-sources.mjs",
  "scripts/lib/packet-largest-idle-full-failure.mjs", "scripts/stage-packet-largest-idle-full.mjs", "scripts/run-packet-largest-idle-original-full.mjs",
  "scripts/launch-packet-largest-idle-supervisor.mjs", "tests/packet-largest-idle-full.test.mjs"];
function edit(parent, edits) {
  let generated = parent.generated;
  for (const [before, after, count = 1] of edits) {
    assert.notEqual(before, after); assert.equal(generated.split(before).length - 1, count, before.slice(0, 160)); generated = generated.replaceAll(before, after);
  }
  let reverse = generated;
  for (const [before, after, count = 1] of edits.toReversed()) { assert.equal(reverse.split(after).length - 1, count); reverse = reverse.replaceAll(after, before); }
  assert.equal(reverse, parent.generated, "Only enumerated candidate/observer/source-envelope/identity edits; all converter acceptance gates unchanged");
  return { ...parent, generated, generatedSha256: sha(generated), parentGeneratedSha256: sha(parent.generated), largestIdleEdits: edits,
    originalConversionAcceptanceGatesByteExact: true, publicAcceptance: false, fullOriginalAcceptance: false, speedGainProven: false };
}
export async function loadQualifiedLargestIdleMedia(root = rootDefault) {
  const read = file => readFile(path.join(root, file)), bytes = await read(LARGEST_IDLE_MEDIA_RECEIPT), proof = JSON.parse(bytes);
  assert.equal(sha(bytes), "a3cff63fbda9bbc41c80de30dd25ff206bbcc042e389c4d74546aa71e357c1eb");
  assert.equal(proof.failure, null); assert.equal(proof.analysis.genuineValidatedConversions, 4);
  assert.equal(Object.keys(proof.sourcePins).length, 210); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  const restore = async (row, maximum) => {
    const zipped = await read(row.path); assert.equal(zipped.length, row.bytes); assert.equal(sha(zipped), row.sha256);
    const raw = gunzipSync(zipped, { maxOutputLength: maximum }); assert.equal(raw.length, row.restoredBytes); assert.equal(sha(raw), row.restoredSha256); return JSON.parse(raw);
  };
  const archive = await restore(proof.generatedArchive, 8388608), report = await restore(proof.report.archive, 2097152);
  assert.deepEqual(archive.sourcePins, proof.sourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) { assert.equal(sha(await read(file)), hash, file); assert.equal(sha(archive.sources[file]), hash, file); }
  const baseline = await read(proof.baseline.path), build = await read(proof.build.path);
  assert.equal(sha(baseline), proof.baseline.sha256); assert.equal(sha(build), proof.build.sha256);
  assert.deepEqual(inspectLargestIdleMediaReport(report, JSON.parse(baseline).reports[0].report, JSON.parse(build)), proof.analysis);
  assert.deepEqual(archive.generated.composition.manifest, report.manifest);
  const stage = archive.generated.stage, start = stage.indexOf("const adapter = "), end = stage.indexOf(";\nconst replacing = ", start);
  assert.ok(start >= 0 && end > start); const adapterSource = JSON.parse(stage.slice(start + "const adapter = ".length, end));
  for (const token of ["qualifiedPacketCallPath", "originalBridge.read(offset, destination)", "withinAsyncifyStorageClose", "7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439"])
    assert.ok(adapterSource.includes(token), token);
  return { proof, archive, report, adapter: { bytes: Buffer.byteLength(adapterSource), sha256: sha(adapterSource) },
    reference: { path: LARGEST_IDLE_MEDIA_RECEIPT, sha256: sha(bytes), sourceCount: 210 } };
}
export const verifyAttemptPlaneCandidate = verifyLargestIdleMediaCandidate;
export async function createAttemptPlaneCandidate(root, directory) {
  const qualified = await loadQualifiedLargestIdleMedia(root), previous = await createLegacyCandidate(root, directory);
  const composition = qualified.archive.generated.composition;
  for (const [file, row] of Object.entries(composition.files)) {
    const target = path.join(directory, file); assert.equal(sha(await readFile(target)), previous.manifest.artifacts[file], file);
    if (previous.manifest.artifacts[file] === row.sha256) continue;
    assert.ok(row.path.startsWith("work/mpeg2-packet-largest-idle-38327579000/"));
    const bytes = await readFile(path.join(root, row.path)); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
    await copyFile(path.join(root, row.path), target);
  }
  await writeFile(path.join(directory, "build-manifest.json"), JSON.stringify(qualified.report.manifest, null, 2) + "\n");
  assert.deepEqual(await verifyLargestIdleMediaCandidate(root, directory), qualified.report.manifest);
  return { ...composition, bytes: Object.values(composition.files).reduce((total, row) => total + row.bytes, 0), publicAcceptance: false };
}
export async function makeLargestIdleFullStager(root, name) {
  assert.match(name, /^allocation-attempt-media-[A-Za-z0-9]+$/);
  const qualified = await loadQualifiedLargestIdleMedia(root), oldName = qualified.archive.generated.candidateName;
  return { ...edit({ generated: qualified.archive.generated.stage }, [[JSON.stringify(oldName), JSON.stringify(name)], [`/^${oldName}$/`, `/^${name}$/`]]),
    adapter: qualified.adapter, manifest: qualified.report.manifest, qualifiedMedia: qualified.reference };
}
export async function makeLargestIdleFullDriver(root, runtime, name, files) {
  assert.equal(path.dirname(runtime), path.join(root, "work")); assert.match(path.basename(runtime), /^allocation-attempt-full-wrapper-[A-Za-z0-9]+$/);
  assert.match(name, /^allocation-attempt-media-[A-Za-z0-9]+$/);
  const legacy = await loadLegacyFullSources(root), qualified = await loadQualifiedLargestIdleMedia(root);
  const url = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const supplemental = [...new Set(files.filter(file => !Object.hasOwn(legacy.proof.sourcePins, file)))]; assert.ok(supplemental.length <= 128);
  assert.deepEqual([...new Set([...Object.keys(legacy.proof.sourcePins), ...supplemental])].sort(), [...new Set(files)].sort());
  const oldName = path.basename(legacy.proof.candidateDirectory), oldTrace = pathToFileURL(path.join(legacy.proof.wrapper, "trace-helper.mjs")).href;
  const sourceLine = "const fullSourceFiles = [...new Set([...sourceFiles,...historicalSourceFiles,...additiveSourceFiles])];\nassert.ok(fullSourceFiles.length<=384);";
  return { ...edit({ generated: legacy.archive.generated }, [
    [url("asyncify-storage-full-candidate.mjs"), url("packet-largest-idle-full-recipe.mjs")],
    [url("packet-cache-full-recipe.mjs"), url("packet-largest-idle-full-failure.mjs")],
    [JSON.stringify(oldName), JSON.stringify(name)], [`/^${oldName}$/`, `/^${name}$/`],
    [oldTrace, pathToFileURL(path.join(runtime, "trace-helper.mjs")).href],
    ['["scripts/stage-input-read-full.mjs", "stage"]', '["scripts/stage-packet-largest-idle-full.mjs", "stage"]'],
    ['["scripts/stage-input-read-full.mjs", "restore"]', '["scripts/stage-packet-largest-idle-full.mjs", "restore"]'],
    ["assert.equal((await stat(file)).size,33387);", `assert.equal((await stat(file)).size,${qualified.adapter.bytes});`],
    [JSON.stringify("395406e6a2a8cd34b262e3805207bee1141f6c0304ef65eb389b61c156f2b7c3"), JSON.stringify(qualified.adapter.sha256), 2],
    ["bytes:33387,sha256:", `bytes:${qualified.adapter.bytes},sha256:`],
    [sourceLine, `const legacySourceFiles = ${JSON.stringify(Object.keys(legacy.proof.sourcePins))};\nconst supplementalSourceFiles = ${JSON.stringify(supplemental)};\nassert.equal(legacySourceFiles.length,380);assert.ok(supplementalSourceFiles.length<=128);\nconst fullSourceFiles = [...new Set([...sourceFiles,...historicalSourceFiles,...additiveSourceFiles,...legacySourceFiles,...supplementalSourceFiles])];\nassert.equal(fullSourceFiles.length,legacySourceFiles.length+supplementalSourceFiles.length);`],
    ["-private-mpeg2-input-read-full-native-100ms", "-private-mpeg2-packet-largest-idle-full-native-100ms"],
  ]), adapter: qualified.adapter, manifest: qualified.report.manifest, qualifiedMedia: qualified.reference,
    sourceEnvelopeLimits: SUPPLEMENTAL_LIMITS };
}
export async function makeLargestIdleFullCaller(root = rootDefault) {
  const parent = await makeInputReadFullCaller(root), legacy = await loadLegacyFullSources(root);
  const url = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const extra = [...new Set([...parent.extraFiles, ...Object.keys(legacy.proof.sourcePins), ...LARGEST_IDLE_FULL_FILES,
    LEGACY_FULL_RECEIPT, legacy.proof.sourceArchive.path])];
  return { ...edit(parent, [
    [url("input-read-layered-source-archive.mjs"), url("packet-largest-idle-full-sources.mjs")],
    [`import { loadQualifiedInputReadMedia as loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("input-read-full-recipe.mjs"))};`,
      `import { loadQualifiedLargestIdleMedia as loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("packet-largest-idle-full-recipe.mjs"))};`],
    [`import { makeInputReadFullDriver as makeAllocationAttemptFullDriver } from ${JSON.stringify(url("input-read-full-recipe.mjs"))};`,
      `import { makeLargestIdleFullDriver as makeAllocationAttemptFullDriver } from ${JSON.stringify(url("packet-largest-idle-full-recipe.mjs"))};`],
    [`import { createAttemptPlaneCandidate, verifyAttemptPlaneCandidate } from ${JSON.stringify(url("asyncify-storage-full-candidate.mjs"))};`,
      `import { createAttemptPlaneCandidate, verifyAttemptPlaneCandidate } from ${JSON.stringify(url("packet-largest-idle-full-recipe.mjs"))};`],
    [url("packet-cache-full-recipe.mjs"), url("packet-largest-idle-full-failure.mjs")],
    ["const callerFiles = [", `const callerFiles = [${extra.map(file => JSON.stringify(file)).join(",")},`],
    ["|input-read)-full-live", "|input-read|packet-largest-idle)-full-live"],
    ["-input-read-full-live.json", "-packet-largest-idle-full-live.json"],
    ["-private-mpeg2-input-read-full-native-100ms.json", "-private-mpeg2-packet-largest-idle-full-native-100ms.json"],
    ["${stamp}-input-read-original-full", "${stamp}-packet-largest-idle-original-full"],
    ["historicalFilesRetained: 256, additiveFiles: snapshot.additiveFiles.length", "historicalFilesRetained: 256, legacyFilesRetained: 380, supplementalFiles: snapshot.supplementalFiles.length, omittedLegacyFiles: 0"],
  ]), extraFiles: extra };
}
