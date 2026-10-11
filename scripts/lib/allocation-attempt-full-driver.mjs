// Reversible derivative of the actually executed full-source driver, not a new
// acceptance harness. Historical bytes and all conversion gates stay retained.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { loadHistoricalFullSourceBase, partitionFullSourceLayers } from "./layered-full-source-archive.mjs";
import { makeQualifiedAttemptFullStager } from "./qualified-attempt-full-stager.mjs";
export async function makeAllocationAttemptFullDriver(root, runtime, candidateName, requestedFiles) {
  root = path.resolve(root); runtime = path.resolve(runtime);
  assert.equal(path.dirname(runtime), path.join(root, "work"));
  assert.match(path.basename(runtime), /^allocation-attempt-full-wrapper-[A-Za-z0-9]+$/);
  assert.match(candidateName ?? "", /^allocation-attempt-media-[A-Za-z0-9]+$/);
  const base = await loadHistoricalFullSourceBase(root), prior = base.archive.generated;
  assert.equal(sha(prior), "b9e05e13f3d3d47eb02d3589d1e40cc2e5bae62d54c1c6c6ca2dd8b205f0cfe2");
  assert.ok(prior.includes(`const root = ${JSON.stringify(root)}, MiB = 1024 ** 2;`), "Historical driver belongs to this repository");
  const layers = partitionFullSourceLayers(base.pins, requestedFiles);
  const stager = await makeQualifiedAttemptFullStager(root, candidateName);
  const moduleUrl = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  let generated = prior; const edits = [];
  const edit = (before, after, count = 1) => {
    assert.ok(before && after && before !== after); assert.equal(generated.split(before).length - 1, count, before.slice(0, 160));
    generated = generated.replaceAll(before, after); edits.push({ before, after, count });
  };
  const oldImport = prior.split("\n")[0]; assert.ok(oldImport.startsWith("import {makeEncoderPlaneBuildWorkflow}"));
  edit(oldImport, `import { verifyAttemptPlaneCandidate } from ${JSON.stringify(moduleUrl("allocation-attempt-plane-candidate.mjs"))};\nimport { validateCompositeAllocationFailureRecord } from ${JSON.stringify(moduleUrl("composite-allocation-failure-record.mjs"))};`);
  edit('"mpeg2-encoder-planes-38044000567"', JSON.stringify(candidateName));
  edit("/^mpeg2-encoder-planes-38044000567$/", `/^${candidateName}$/`);
  const trace = prior.match(/import \{ startBoundedRendererAttribution \} from "[^"]+\/trace-helper\.mjs";/);
  assert.ok(trace); edit(trace[0], `import { startBoundedRendererAttribution } from ${JSON.stringify(pathToFileURL(path.join(runtime, "trace-helper.mjs")).href)};`);
  edit("scripts/stage-mpeg2-bitrate-full-abort.mjs", "scripts/stage-allocation-attempt-full.mjs", 5);
  const start = prior.indexOf('assert.equal(Object.hasOwn(manifest.sources, ".github/workflows/reproduce-ffmpeg-nondocker.yml"), false);');
  const last = 'assert.equal(manifest.provenance.encoder.commit, "7b6dd8223d4a71b7f067017c6c8b5a7fa960e0c1");';
  const end = prior.indexOf(last, start); assert.ok(start >= 0 && end > start);
  edit(prior.slice(start, end + last.length), "await verifyAttemptPlaneCandidate(root, candidate); // Both actual components, manifests, maps, witnesses and current sources qualified.");
  edit("assert.equal(row.failedIndividualAllocationBytes,null);assert.equal(row.heapLiveBytes,null);", "validateCompositeAllocationFailureRecord(row);");
  edit("assert.equal((await stat(file)).size,20047);", `assert.equal((await stat(file)).size,${stager.adapter.bytes});`);
  edit('"81ea465cb26a839fed9ae4b25223e42a19d0486023cd443ff34126ed3a3eb2a7"', JSON.stringify(stager.adapter.sha256), 2);
  edit("bytes:20047,sha256:", `bytes:${stager.adapter.bytes},sha256:`);
  edit("Exact qualified bitrate-only staged abort adapter", "Exact media-qualified composite request/phase staged abort adapter");
  const sourceHash = "const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, await shaFile(path.join(root, file))])));";
  edit(sourceHash, `const historicalSourceFiles = ${JSON.stringify(Object.keys(base.pins))};\nconst additiveSourceFiles = ${JSON.stringify(layers.additiveFiles)};\nassert.equal(historicalSourceFiles.length,256);assert.ok(additiveSourceFiles.length<=128);\nconst fullSourceFiles = [...new Set([...sourceFiles,...historicalSourceFiles,...additiveSourceFiles])];\nassert.ok(fullSourceFiles.length<=384);\nconst sourceHashes = Object.fromEntries(await Promise.all(fullSourceFiles.map(async (file) => [file, await shaFile(path.join(root, file))])));`);
  edit("Uninstrumented real split conversion, all three stress runs required.", "Real split conversion with bounded C request slot; all three stress runs required.");
  edit('"privateNativeCandidate":"hevc-single-idle-plus-encoder-plane"', '"privateNativeCandidate":"hevc-allocation-attempt-plus-encoder-plane"');
  edit("mpeg2-encoder-plane-bitrate-full-runtime-", "allocation-attempt-full-runtime-");
  edit("-private-mpeg2-encoder-plane-bitrate-full-native-100ms", "-private-mpeg2-allocation-attempt-full-native-100ms");
  edit("Qualified failure-only late-pool/allocator observer retained.", "Media-qualified bounded C request/phase plus pool/header observer retained; original cause remains unproven.");
  let reversed = generated;
  for (const { before, after, count } of edits.toReversed()) { assert.equal(reversed.split(after).length - 1, count); reversed = reversed.replaceAll(after, before); }
  assert.equal(reversed, prior, "Only enumerated component/observer/source-layer/runtime identities change; ALL original acceptance gates reverse byte-exact");
  const declared = [...generated.matchAll(/^const sourceFiles = (\[[\s\S]*?\]);$/gm)]; assert.equal(declared.length, 1);
  const driverFiles = JSON.parse(declared[0][1]); assert.ok(driverFiles.length <= 256);
  const observedFiles = [...new Set([...driverFiles, ...Object.keys(base.pins), ...layers.additiveFiles])];
  assert.deepEqual(observedFiles.toSorted(), layers.files.toSorted(), "Layer archive must cover every driver-hashed source and retain all historical pins");
  return { generated, generatedSha256: sha(generated), previousDriverSha256: sha(prior), edits,
    qualifiedMedia: stager.qualifiedMedia, manifest: stager.manifest, adapter: stager.adapter,
    sourceFiles: layers.files, additiveFiles: layers.additiveFiles, historicalFilesRetained: 256,
    originalAcceptanceGatesByteExact: true, publicAcceptance: false, fullOriginalAcceptance: false, conversionSpeedAcceptance: false };
}
