// Fresh full-original derivative: actual qualified adapter + bounded read errors.
// No retries, different input, reader strategy, codec, heap or acceptance change.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { inspectInputReadMediaReport } from "./input-read-media-recipe.mjs";
import { createBoundedInputReadCapture } from "./bounded-input-read-capture.mjs";
import { makeAsyncifyStorageFullCaller, makeAllocationAttemptFullDriver as parentDriver } from "./asyncify-storage-full-recipe.mjs";
const rootDefault = path.resolve(import.meta.dirname, "../..");
const qualifiedPath = "evidence/2026-10-12T19-28-30-102Z-input-read-media.json";
const priorPath = "evidence/2026-10-12T14-43-54-627Z-asyncify-storage-original-full-terminal.json";
export const INPUT_READ_FULL_FILES = ["scripts/lib/input-read-full-recipe.mjs", "scripts/lib/input-read-layered-source-archive.mjs",
  "scripts/stage-input-read-full.mjs", "scripts/run-input-read-original-full.mjs", "scripts/launch-input-read-supervisor.mjs", "tests/input-read-full.test.mjs"];
function edit(parent, edits) {
  let generated = parent.generated;
  for (const [before, after, count = 1] of edits) { assert.notEqual(before, after); assert.equal(generated.split(before).length - 1, count, before.slice(0, 180)); generated = generated.replaceAll(before, after); }
  let reversed = generated;
  for (const [before, after, count = 1] of edits.toReversed()) { assert.equal(reversed.split(after).length - 1, count); reversed = reversed.replaceAll(after, before); }
  assert.equal(reversed, parent.generated, "All parent conversion/fidelity/memory/repeat/cleanup gates byte-exact");
  return { ...parent, generated, generatedSha256: sha(generated), parentGeneratedSha256: parent.generatedSha256, inputReadEdits: edits,
    originalAcceptanceGatesByteExact: true, publicAcceptance: false, fullOriginalAcceptance: false, conversionSpeedAcceptance: false };
}
export async function loadQualifiedInputReadMedia(root = rootDefault) {
  const read = file => readFile(path.join(root, file)), bytes = await read(qualifiedPath), proof = JSON.parse(bytes);
  assert.equal(sha(bytes), "c5df28ee7e46f8519445b97c63d578939c18ebbc5f98ab86b074098bd1b49c4d");
  assert.equal(proof.failure, null); assert.equal(proof.analysis.genuineValidatedConversions, 4);
  assert.equal(Object.keys(proof.sourcePins).length, 162); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  async function restore(row, maximum) {
    const compressed = await read(row.path); assert.equal(compressed.length, row.bytes); assert.equal(sha(compressed), row.sha256);
    const raw = gunzipSync(compressed, { maxOutputLength: maximum }); assert.equal(raw.length, row.restoredBytes); assert.equal(sha(raw), row.restoredSha256);
    return JSON.parse(raw);
  }
  const archive = await restore(proof.generatedArchive, 8388608), report = await restore(proof.report.archive, 2097152);
  assert.deepEqual(archive.sourcePins, proof.sourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) { assert.equal(sha(await read(file)), hash, file); assert.equal(sha(archive.sources[file]), hash, file); }
  const build = await read(proof.build.path), baseline = await read(proof.baseline.path);
  assert.equal(sha(build), proof.build.sha256); assert.equal(sha(baseline), proof.baseline.sha256);
  assert.deepEqual(inspectInputReadMediaReport(report, JSON.parse(baseline).reports[0].report, JSON.parse(build)), proof.analysis);
  assert.deepEqual(archive.generated.composition.manifest, report.manifest);
  const generated = archive.generated, start = generated.stage.indexOf("const adapter = "), end = generated.stage.indexOf(";\nconst replacing = ", start);
  assert.ok(start >= 0 && end > start);
  const adapter = JSON.parse(generated.stage.slice(start + "const adapter = ".length, end));
  assert.ok(adapter.includes(createBoundedInputReadCapture.toString()), "Actual qualified browser helper, not a substituted diagnostic");
  assert.ok(adapter.includes("originalBridge.read(offset, destination)")); assert.ok(adapter.includes("withinAsyncifyStorageClose"));
  return { proof, archive, report, adapter: { bytes: Buffer.byteLength(adapter), sha256: sha(adapter) },
    reference: { path: qualifiedPath, sha256: sha(bytes), sourceCount: 162 } };
}
export async function makeInputReadFullStager(root, name) {
  assert.match(name, /^allocation-attempt-media-[A-Za-z0-9]+$/);
  const qualified = await loadQualifiedInputReadMedia(root), oldName = qualified.archive.generated.candidateName;
  const parent = { generated: qualified.archive.generated.stage, generatedSha256: sha(qualified.archive.generated.stage) };
  return { ...edit(parent, [[JSON.stringify(oldName), JSON.stringify(name)], [`/^${oldName}$/`, `/^${name}$/`]]),
    qualifiedMedia: qualified.reference, manifest: qualified.report.manifest, adapter: qualified.adapter };
}
export async function makeInputReadFullDriver(root, runtime, name, files) {
  const parent = await parentDriver(root, runtime, name, files), qualified = await loadQualifiedInputReadMedia(root);
  return { ...edit(parent, [
    ['["scripts/stage-asyncify-storage-full.mjs", "stage"]', '["scripts/stage-input-read-full.mjs", "stage"]'],
    ['["scripts/stage-asyncify-storage-full.mjs", "restore"]', '["scripts/stage-input-read-full.mjs", "restore"]'],
    [`assert.equal((await stat(file)).size,${parent.adapter.bytes});`, `assert.equal((await stat(file)).size,${qualified.adapter.bytes});`],
    [JSON.stringify(parent.adapter.sha256), JSON.stringify(qualified.adapter.sha256), 2],
    [`bytes:${parent.adapter.bytes},sha256:`, `bytes:${qualified.adapter.bytes},sha256:`],
    ["const asyncifyStorageFinalSamples = [];", "const inputReadFailureSamples = [];\nconst asyncifyStorageFinalSamples = [];"],
    ['["WITHIN_ASYNCIFY_STORAGE_FINAL ", asyncifyStorageFinalSamples],', '["WITHIN_ASYNCIFY_STORAGE_FINAL ", asyncifyStorageFinalSamples], ["WITHIN_INPUT_READ_FAILURE ", inputReadFailureSamples],'],
    ["    assert.equal(asyncifyStorageFinalSamples.length, number);", "    assert.deepEqual(inputReadFailureSamples, [], 'A completed conversion must have no input read failures');\n    assert.equal(asyncifyStorageFinalSamples.length, number);"],
    ["splitFinalSamples, asyncifyStorageFinalSamples, nativeStackSamples,", "splitFinalSamples, asyncifyStorageFinalSamples, inputReadFailureSamples, nativeStackSamples,"],
    ["-private-mpeg2-asyncify-storage-full-native-100ms", "-private-mpeg2-input-read-full-native-100ms"],
  ]), qualifiedMedia: qualified.reference, manifest: qualified.report.manifest, adapter: qualified.adapter };
}
export async function makeInputReadFullCaller(root = rootDefault) {
  const parent = await makeAsyncifyStorageFullCaller(root), url = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const priorBytes = await readFile(path.join(root, priorPath)), prior = JSON.parse(priorBytes);
  assert.equal(sha(priorBytes), "2d6c3be87adffaaadee563916e0bbcc69146a350a9d39dc9a3022592895b6752");
  assert.equal(Object.keys(prior.sourcePins).length, 365); assert.deepEqual(prior.sourcePins, prior.postSourcePins);
  for (const [file, hash] of Object.entries(prior.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  const extra = [...new Set([...parent.extraFiles, ...Object.keys(prior.sourcePins), ...INPUT_READ_FULL_FILES, priorPath])];
  return { ...edit(parent, [
    [url("asyncify-storage-layered-source-archive.mjs"), url("input-read-layered-source-archive.mjs")],
    [`import { loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("asyncify-storage-full-recipe.mjs"))};`,
      `import { loadQualifiedInputReadMedia as loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("input-read-full-recipe.mjs"))};`],
    [`import { makeAllocationAttemptFullDriver } from ${JSON.stringify(url("asyncify-storage-full-recipe.mjs"))};`,
      `import { makeInputReadFullDriver as makeAllocationAttemptFullDriver } from ${JSON.stringify(url("input-read-full-recipe.mjs"))};`],
    ["const callerFiles = [", `const callerFiles = [${extra.map(file => JSON.stringify(file)).join(",")},`],
    ["|asyncify-storage)-full-live", "|asyncify-storage|input-read)-full-live"],
    ["-asyncify-storage-full-live.json", "-input-read-full-live.json"],
    ["-private-mpeg2-asyncify-storage-full-native-100ms.json", "-private-mpeg2-input-read-full-native-100ms.json"],
    ["${stamp}-asyncify-storage-original-full", "${stamp}-input-read-original-full"],
    ["abortDiagnostic: raw.abortDiagnostic, cleanup: raw.cleanup,", "abortDiagnostic: raw.abortDiagnostic, inputReadFailureSamples: raw.inputReadFailureSamples, cleanup: raw.cleanup,"],
    ["assert.deepEqual(raw.forbiddenRequests, []);", `assert.deepEqual(raw.forbiddenRequests, []);
    assert.ok(Array.isArray(raw.inputReadFailureSamples) && raw.inputReadFailureSamples.length <= 6);
    for (const row of raw.inputReadFailureSamples) {
      assert.equal(row.version,1); assert.equal(row.inputSize,2958573265);
      assert.equal(row.scope,'production-input-read-failure-not-cause-attribution');
      assert.ok(row.offset===null||(Number.isSafeInteger(row.offset)&&row.offset>=0&&row.offset<=2958573265));
      assert.ok(row.requestedBytes===null||(Number.isInteger(row.requestedBytes)&&row.requestedBytes>=0&&row.requestedBytes<=65536));
      assert.ok(Array.isArray(row.stackLocations)&&row.stackLocations.length<=8);
      assert.notEqual(row.messageClass,'injected-control','Worker-local injected fault must never be enabled in the full test');
    }`],
  ]), extraFiles: extra };
}
