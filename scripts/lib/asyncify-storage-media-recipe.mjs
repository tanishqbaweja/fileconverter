// Fresh private derivative; all historically qualified sources stay byte-exact.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { attemptMediaSourceFiles } from "./packet-cache-candidate.mjs";
import { makeAttemptMediaBrowserRecipe, makeAttemptMediaCaller, inspectAttemptMediaReport } from "./packet-cache-media-recipe.mjs";
import { makeAsyncifyStorageGlue, ORIGINAL_ASYNCIFY_GLUE_SHA } from "./asyncify-storage-glue-recipe.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";

const baseManifestSha = "6dd46664640139cc594f58eb52ae2000c7420eccaeecd1ab4259d154ac2402d1";
const newFiles = ["scripts/lib/bounded-asyncify-storage.mjs", "scripts/lib/asyncify-storage-glue-recipe.mjs",
  "scripts/lib/asyncify-storage-media-recipe.mjs", "scripts/qualify-asyncify-storage-media.mjs", "tests/bounded-asyncify-storage.test.mjs", "tests/asyncify-storage-media.test.mjs"];
export async function asyncifyMediaSourceFiles(root) { return [...new Set([...await attemptMediaSourceFiles(root), ...newFiles])]; }
function replaceOne(source, before, after) { assert.equal(source.split(before).length, 2, before); return source.replace(before, after); }
export async function verifyAsyncifyStorageCandidate(root, directory) {
  assert.equal(path.dirname(directory), path.join(root, "work"));
  const read = file => readFile(path.join(directory, file)), manifest = JSON.parse(await read("build-manifest.json"));
  const base = structuredClone(manifest); delete base.asyncifyStorage;
  base.artifacts["within-mpeg2-split.mjs"] = ORIGINAL_ASYNCIFY_GLUE_SHA;
  assert.equal(sha(JSON.stringify(base)), baseManifestSha, "Exact previously executed native composition, not substituted encoder or settings");
  const original = await readFile(path.join(root, "work/mpeg2-packet-cache-38206263853/within-mpeg2-split.mjs"), "utf8");
  const patch = makeAsyncifyStorageGlue(original);
  assert.deepEqual(manifest.asyncifyStorage, { originalGlueSha256: ORIGINAL_ASYNCIFY_GLUE_SHA, generatedGlueSha256: patch.generatedSha256,
    stackBytes: 262144, headerBytes: 12, reservationBytes: 262156, maximumLeases: 1, startupReservation: true,
    nativeWasmChanged: false, heapLimitsChanged: false, publicAcceptance: false });
  assert.equal(manifest.artifacts["within-mpeg2-split.mjs"], patch.generatedSha256);
  for (const [file, hash] of Object.entries(manifest.artifacts)) assert.equal(sha(await read(file)), hash, file);
  assert.equal(manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(manifest.allowMemoryGrowth, false);
  return manifest;
}
export async function makeAsyncifyMediaBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  const old = await makeAttemptMediaBrowserRecipe(sources, root, runtime, stamp, branch, build);
  assert.equal(sha(JSON.stringify(old.composition.manifest)), baseManifestSha);
  const file = path.join(runtime, "within-mpeg2-split.mjs"), original = await readFile(file, "utf8"), patch = makeAsyncifyStorageGlue(original);
  await writeFile(file, patch.generated);
  const manifest = structuredClone(old.composition.manifest);
  manifest.artifacts["within-mpeg2-split.mjs"] = patch.generatedSha256;
  manifest.asyncifyStorage = { originalGlueSha256: ORIGINAL_ASYNCIFY_GLUE_SHA, generatedGlueSha256: patch.generatedSha256,
    stackBytes: 262144, headerBytes: 12, reservationBytes: 262156, maximumLeases: 1, startupReservation: true,
    nativeWasmChanged: false, heapLimitsChanged: false, publicAcceptance: false };
  await writeFile(path.join(runtime, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const verified = await verifyAsyncifyStorageCandidate(root, runtime); assert.deepEqual(verified, manifest);
  const beforeImport = `import { verifyAttemptPlaneCandidate } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/packet-cache-candidate.mjs")).href)};`;
  const afterImport = `import { verifyAsyncifyStorageCandidate } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/asyncify-storage-media-recipe.mjs")).href)};`;
  let stage = replaceOne(old.stage, beforeImport, afterImport);
  stage = replaceOne(stage, "await verifyAttemptPlaneCandidate(root, source);", "await verifyAsyncifyStorageCandidate(root, source);");
  const start = stage.indexOf("const adapter = "), end = stage.indexOf(";\nconst replacing = ", start); assert.ok(start >= 0 && end > start);
  const literal = stage.slice(start + "const adapter = ".length, end), adapter = JSON.parse(literal);
  const updated = replaceOne(adapter, "        try { session.close();", '        try { try { console.debug("WITHIN_ASYNCIFY_STORAGE_FINAL "+JSON.stringify(core.withinAsyncifyStorageClose())); } finally { session.close(); }');
  stage = replaceOne(stage, literal, JSON.stringify(updated));
  let spec = replaceOne(old.spec, "const splitFinalSamples: SplitFinal[] = [];", "const asyncifyStorageSamples: Array<Record<string, number | boolean>> = [];\nconst splitFinalSamples: SplitFinal[] = [];");
  spec = replaceOne(spec, "  splitFinalSamples.length = 0;", "  splitFinalSamples.length = 0;\n  asyncifyStorageSamples.length = 0;");
  spec = replaceOne(spec, '    const splitPrefix = "WITHIN_MPEG2_SPLIT_FINAL ";',
    '    const storagePrefix = "WITHIN_ASYNCIFY_STORAGE_FINAL ";\n    if (text.startsWith(storagePrefix) && text.length <= 2048 && asyncifyStorageSamples.length < 8)\n      asyncifyStorageSamples.push(JSON.parse(text.slice(storagePrefix.length)));\n    const splitPrefix = "WITHIN_MPEG2_SPLIT_FINAL ";');
  spec = replaceOne(spec, "  expect(splitFinalSamples.length).toBeGreaterThan(0);", `  rows.push({ kind: "actual-asyncify-storage-lifecycle", samples: [...asyncifyStorageSamples] });
  expect(asyncifyStorageSamples.length).toBeGreaterThan(0);
  for (const sample of asyncifyStorageSamples) {
    expect(sample.allocations).toBe(1); expect(sample.frees).toBe(1); expect(sample.acquisitions).toBeGreaterThan(1);
    expect(sample.activeLeases).toBe(0); expect(sample.retainedBytes).toBe(0); expect(sample.maximumLeases).toBe(1);
    expect(sample.stackBytes).toBe(262144); expect(sample.reservationBytes).toBe(262156);
    expect(sample.closing).toBe(true); expect(sample.abortedReleaseDeferredUntilWorkerTermination).toBe(false);
  }
  expect(splitFinalSamples.length).toBeGreaterThan(0);`);
  return { ...old, stage, spec, composition: { ...old.composition, manifest,
    files: { ...old.composition.files, "within-mpeg2-split.mjs": { path: "derived-at-runtime", bytes: Buffer.byteLength(patch.generated), sha256: patch.generatedSha256 } } },
    asyncifyGlueRecipe: patch, publicAcceptance: false };
}
export function inspectAsyncifyMediaReport(report, baseline, build) {
  const original = inspectAttemptMediaReport(report, baseline, build);
  const samples = report.rows.filter(row => row.kind === "actual-asyncify-storage-lifecycle").flatMap(row => row.samples);
  assert.equal(samples.length, 5, "Normal, two adverse attempts and two same-page recovery jobs");
  for (const row of samples) {
    assert.equal(row.allocations, 1); assert.equal(row.frees, 1); assert.ok(row.acquisitions > 1);
    assert.equal(row.activeLeases, 0); assert.equal(row.retainedBytes, 0); assert.equal(row.stackBytes, 262144);
    assert.equal(row.reservationBytes, 262156); assert.equal(row.maximumLeases, 1); assert.equal(row.closing, true);
    assert.equal(row.abortedReleaseDeferredUntilWorkerTermination, false);
  }
  return { ...original, actualAsyncifyLifecycleSamples: samples, suspensionStorageReusedAndFreed: true, fullOriginalAcceptance: false };
}
export function makeAsyncifyMediaCaller(source, root) {
  const old = makeAttemptMediaCaller(source, root);
  let generated = replaceOne(old.generated,
    `import { makeAttemptMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectAttemptMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/packet-cache-media-recipe.mjs")).href)};`,
    `import { makeAsyncifyMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectAsyncifyMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/asyncify-storage-media-recipe.mjs")).href)};`);
  generated = replaceOne(generated,
    `import { attemptMediaSourceFiles } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/packet-cache-candidate.mjs")).href)};`,
    `import { asyncifyMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/asyncify-storage-media-recipe.mjs")).href)};`);
  generated = generated.replaceAll("${stamp}-packet-cache-media-", "${stamp}-asyncify-storage-media-").replaceAll("${stamp}-packet-cache-media.json", "${stamp}-asyncify-storage-media.json");
  return { generated, generatedSha256: sha(generated), previousCallerSha256: old.generatedSha256 };
}
