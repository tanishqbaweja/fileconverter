// Reuse the actual qualified stager and the durable full driver. Only listed
// glue/close/identity/evidence additions; no smaller source or relaxed gate.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { inspectAsyncifyMediaReport } from "./asyncify-storage-media-recipe.mjs";
import { makeDurablePacketCacheFullCaller, makeAllocationAttemptFullDriver as makeParentDriver } from "./durable-packet-cache-full-recipe.mjs";
const rootDefault = path.resolve(import.meta.dirname, "../..");
const qualifiedPath = "evidence/2026-10-12T14-25-42-022Z-asyncify-storage-media.json";
function edit(parent, edits) {
  let generated = parent.generated;
  for (const [before, after, count = 1] of edits) { assert.notEqual(before, after); assert.equal(generated.split(before).length - 1, count, before); generated = generated.replaceAll(before, after); }
  let reverse = generated;
  for (const [before, after, count = 1] of edits.toReversed()) { assert.equal(reverse.split(after).length - 1, count); reverse = reverse.replaceAll(after, before); }
  assert.equal(reverse, parent.generated, "Exact parent gates preserved; only enumerated private candidate/lifecycle/evidence edits");
  return { ...parent, generated, generatedSha256: sha(generated), asyncifyEdits: edits, parentGeneratedSha256: parent.generatedSha256,
    originalAcceptanceGatesByteExact: true, publicAcceptance: false, fullOriginalAcceptance: false, conversionSpeedAcceptance: false };
}
export async function loadQualifiedAttemptMediaSources(root = rootDefault) {
  const read = file => readFile(path.join(root, file)), bytes = await read(qualifiedPath), proof = JSON.parse(bytes);
  assert.equal(sha(bytes), "e8b0079f55482095864ccaf29854ad99e37c188d624d61dc27c48e8b988b8ed0");
  assert.equal(proof.failure, null); assert.equal(proof.analysis.genuineValidatedConversions, 3);
  assert.equal(Object.keys(proof.sourcePins).length, 157); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  async function restore(row, maximum) {
    const compressed = await read(row.path); assert.equal(compressed.length, row.bytes); assert.equal(sha(compressed), row.sha256);
    const raw = gunzipSync(compressed, { maxOutputLength: maximum }); assert.equal(raw.length, row.restoredBytes); assert.equal(sha(raw), row.restoredSha256); return JSON.parse(raw);
  }
  const archive = await restore(proof.generatedArchive, 8388608), report = await restore(proof.report.archive, 2097152);
  assert.deepEqual(archive.sourcePins, proof.sourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) { assert.equal(sha(await read(file)), hash, file); assert.equal(sha(archive.sources[file]), hash, file); }
  const build = await read(proof.build.path), baseline = await read(proof.baseline.path);
  assert.equal(sha(build), proof.build.sha256); assert.equal(sha(baseline), proof.baseline.sha256);
  assert.deepEqual(inspectAsyncifyMediaReport(report, JSON.parse(baseline).reports[0].report, JSON.parse(build)), proof.analysis);
  assert.deepEqual(archive.generated.composition.manifest, report.manifest);
  const generated = archive.generated, start = generated.stage.indexOf("const adapter = "), end = generated.stage.indexOf(";\nconst replacing = ", start);
  assert.ok(start >= 0 && end > start);
  const adapter = JSON.parse(generated.stage.slice(start + "const adapter = ".length, end));
  assert.ok(adapter.includes("withinAsyncifyStorageClose"));
  return { proof, archive, report, adapter: { bytes: Buffer.byteLength(adapter), sha256: sha(adapter) },
    reference: { path: qualifiedPath, sha256: sha(bytes), sourceCount: 157 } };
}
export async function makeQualifiedAttemptFullStager(root, name) {
  assert.match(name, /^allocation-attempt-media-[A-Za-z0-9]+$/);
  const qualified = await loadQualifiedAttemptMediaSources(root), oldName = qualified.archive.generated.candidateName;
  const parent = { generated: qualified.archive.generated.stage, generatedSha256: sha(qualified.archive.generated.stage) };
  const result = edit(parent, [[JSON.stringify(oldName), JSON.stringify(name)], [`/^${oldName}$/`, `/^${name}$/`]]);
  return { ...result, qualifiedMedia: qualified.reference, manifest: qualified.report.manifest, adapter: qualified.adapter };
}
export async function makeAllocationAttemptFullDriver(root, runtime, name, files) {
  const parent = await makeParentDriver(root, runtime, name, files), qualified = await loadQualifiedAttemptMediaSources(root);
  const url = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = edit(parent, [
    [url("packet-cache-candidate.mjs"), url("asyncify-storage-full-candidate.mjs")],
    ['["scripts/stage-packet-cache-full.mjs", "stage"]', '["scripts/stage-asyncify-storage-full.mjs", "stage"]'],
    ['["scripts/stage-packet-cache-full.mjs", "restore"]', '["scripts/stage-asyncify-storage-full.mjs", "restore"]'],
    [`assert.equal((await stat(file)).size,${parent.adapter.bytes});`, `assert.equal((await stat(file)).size,${qualified.adapter.bytes});`],
    [JSON.stringify(parent.adapter.sha256), JSON.stringify(qualified.adapter.sha256), 2],
    [`bytes:${parent.adapter.bytes},sha256:`, `bytes:${qualified.adapter.bytes},sha256:`],
    ["const splitFinalSamples = [];", "const asyncifyStorageFinalSamples = [];\nconst splitFinalSamples = [];"],
    ['["WITHIN_MPEG2_SPLIT_FINAL ", splitFinalSamples],', '["WITHIN_MPEG2_SPLIT_FINAL ", splitFinalSamples], ["WITHIN_ASYNCIFY_STORAGE_FINAL ", asyncifyStorageFinalSamples],'],
    ["    assert.equal(splitFinalSamples.length, number);", `    assert.equal(asyncifyStorageFinalSamples.length, number);
    const suspension = asyncifyStorageFinalSamples[number - 1];
    assert.equal(suspension.allocations,1);assert.equal(suspension.frees,1);assert.ok(suspension.acquisitions>1);
    assert.equal(suspension.stackBytes,262144);assert.equal(suspension.reservationBytes,262156);
    assert.equal(suspension.activeLeases,0);assert.equal(suspension.retainedBytes,0);assert.equal(suspension.maximumLeases,1);
    assert.equal(suspension.closing,true);assert.equal(suspension.abortedReleaseDeferredUntilWorkerTermination,false);
    run.asyncifyStorage = suspension;
    assert.equal(splitFinalSamples.length, number);`],
    ["allocatorSamplesEvicted, bitrateAuditSamples, splitFinalSamples, nativeStackSamples,", "allocatorSamplesEvicted, bitrateAuditSamples, splitFinalSamples, asyncifyStorageFinalSamples, nativeStackSamples,"],
    ["-private-mpeg2-packet-cache-full-native-100ms", "-private-mpeg2-asyncify-storage-full-native-100ms"],
  ]);
  return { ...result, qualifiedMedia: qualified.reference, manifest: qualified.report.manifest, adapter: qualified.adapter };
}
export async function makeAsyncifyStorageFullCaller(root = rootDefault) {
  const parent = await makeDurablePacketCacheFullCaller(root), url = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-10-12T10-18-33-321Z-packet-cache-original-full-terminal.json")));
  const extra = [...new Set([...Object.keys(prior.sourcePins), "scripts/lib/asyncify-storage-full-recipe.mjs", "scripts/lib/asyncify-storage-full-candidate.mjs",
    "scripts/lib/asyncify-storage-layered-source-archive.mjs", "scripts/stage-asyncify-storage-full.mjs", "scripts/run-asyncify-storage-original-full.mjs",
    "scripts/launch-asyncify-storage-supervisor.mjs", "tests/asyncify-storage-full.test.mjs", "tests/asyncify-storage-browser-evidence.test.mjs",
    "scripts/verify-asyncify-storage-media-evidence.mjs", "evidence/2026-10-12T14-25-42-022Z-asyncify-storage-media-verified.json"])];
  return { ...edit(parent, [
    [url("packet-cache-layered-source-archive.mjs"), url("asyncify-storage-layered-source-archive.mjs")],
    [`import { loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("packet-cache-full-recipe.mjs"))};`, `import { loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("asyncify-storage-full-recipe.mjs"))};`],
    [url("packet-cache-candidate.mjs"), url("asyncify-storage-full-candidate.mjs")],
    [`import { makeAllocationAttemptFullDriver } from ${JSON.stringify(url("durable-packet-cache-full-recipe.mjs"))};`, `import { makeAllocationAttemptFullDriver } from ${JSON.stringify(url("asyncify-storage-full-recipe.mjs"))};`],
    ["const callerFiles = [", `const callerFiles = [${extra.map(file => JSON.stringify(file)).join(",")},`],
    ["captureLayeredFullSourcePins(root, [...Object.keys(media.proof.sourcePins), ...callerFiles])", "captureLayeredFullSourcePins(root, [...new Set([...Object.keys(media.proof.sourcePins), ...callerFiles])])"],
    ["|packet-cache)-full-live", "|packet-cache|asyncify-storage)-full-live"],
    ["-packet-cache-full-live.json", "-asyncify-storage-full-live.json"],
    ["-private-mpeg2-packet-cache-full-native-100ms.json", "-private-mpeg2-asyncify-storage-full-native-100ms.json"],
    ["${stamp}-packet-cache-original-full", "${stamp}-asyncify-storage-original-full"],
  ]), extraFiles: extra };
}
