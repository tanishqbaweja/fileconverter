// One-off terminal evidence and verified duplicate cleanup. No media conversion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, lstat, readFile, realpath, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makePacketInterleaveCollector, makePacketInterleaveBranchCaller } from "./lib/packet-interleave-build-recipe.mjs";
import { makePacketInterleaveHostedBuilder } from "../media/ffmpeg/mpeg2-packet-interleave-builder-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), runId = "38671160915";
assert.equal(process.argv.length, 2);
const read = file => readFile(path.join(root, file));
const output = "evidence/packet-interleave-ownership-38671160915.json";
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const proofPath = `evidence/mpeg2-packet-interleave-build-${runId}.json`, proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
const branchPath = "evidence/mpeg2-packet-interleave-build-branch-2026-10-15.json", branchBytes = await read(branchPath), branch = JSON.parse(branchBytes);
const cache = path.join(root, `work/mpeg2-packet-interleave-${runId}`), parent = path.join(root, "work/mpeg2-mvf-arena-38643550000");
assert.equal(cache, path.resolve(cache)); assert.equal(await realpath(cache), cache);
assert.equal(path.dirname(cache), path.join(root, "work"));
const identity = await lstat(cache, { bigint: true }); assert.ok(identity.isDirectory() && !identity.isSymbolicLink());
const manifestBytes = await readFile(path.join(cache, "build-manifest.json")), manifest = JSON.parse(manifestBytes);
const parentManifest = JSON.parse(await readFile(path.join(parent, "build-manifest.json")));
assert.equal(sha(manifestBytes), proof.files.find(row => row.file === "build-manifest.json").sha256);
assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success");
assert.equal(proof.run.headSha, branch.commit); assert.equal(branch.commit, "3354c5ce95652acfae4dc4946a50baf4e785da72");
assert.equal(proof.hostedCleanupStepPassed, true); assert.equal(proof.downloadRuntimeRemoved, true);
assert.equal(Object.keys(manifest.sources).length, 107);
assert.equal(Object.keys(parentManifest.sources).length, 99);
for (const [file, hash] of Object.entries(parentManifest.sources)) {
  assert.ok(file in manifest.sources);
  if (file !== branch.workflow.path) assert.equal(manifest.sources[file], hash, file);
}
const sources = [], currentPins = {};
for (const [file, expected] of Object.entries(manifest.sources).sort()) {
  const current = await read(file);
  const bytes = file === branch.workflow.path ? Buffer.from(branch.workflow.generatedExactSource) : current;
  assert.equal(sha(bytes), expected, file);
  if (file === branch.workflow.path) assert.equal(sha(current), branch.workflow.canonicalSha256);
  currentPins[file] = sha(current);
  sources.push({ path: file, bytes: bytes.length, sha256: sha(bytes), preimage: bytes.toString("base64"), canonicalCurrentSha256: sha(current) });
}
const collector = makePacketInterleaveCollector((await read("scripts/collect-mpeg2-single-idle-build.mjs")).toString(), root);
assert.equal(collector.generatedSha256, proof.collectorSourceSha256);
const branchRecipe = makePacketInterleaveBranchCaller((await read("scripts/prepare-alignment16-build-branch.mjs")).toString(), root);
const hosted = makePacketInterleaveHostedBuilder((await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs")).toString(), root);
const ownPath = "scripts/record-packet-interleave-ownership.mjs", ownBytes = await read(ownPath);
const envelope = { version: 1, scope: "source-bound-real-wasm-ownership-not-conversion", sources,
  collector: { sha256: sha(collector.generated), exactSource: collector.generated },
  branchCaller: { sha256: sha(branchRecipe.generated), exactSource: branchRecipe.generated },
  hostedBuilder: { sha256: sha(hosted.generated), exactSource: hosted.generated },
  manifest: { sha256: sha(manifestBytes), preimage: manifestBytes.toString("base64") },
  ownSource: { path: ownPath, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
assert.ok(sources.length <= 128);
const raw = Buffer.from(JSON.stringify(envelope)); assert.ok(raw.length <= 2 * 1024 ** 2);
const compressed = gzipSync(raw, { level: 9 });
const archivePath = `outputs/reports/packet-interleave-ownership-sources-${runId}.json.gz`;
await writeFile(path.join(root, archivePath), compressed, { flag: "wx" });
const retained = await read(archivePath); assert.equal(sha(retained), sha(compressed));
const restored = gunzipSync(retained); assert.equal(sha(restored), sha(raw));
const parsed = JSON.parse(restored);
for (const row of parsed.sources) assert.equal(sha(Buffer.from(row.preimage, "base64")), row.sha256);
assert.equal(sha(Buffer.from(parsed.manifest.preimage, "base64")), sha(manifestBytes));
for (const [file, hash] of Object.entries(currentPins)) assert.equal(sha(await read(file)), hash, file);

// Every disposable duplicate is positively identified and hash-checked first.
assert.deepEqual((await readdir(cache)).sort(), proof.files.map(row => row.file).sort());
let duplicateBytes = 0;
for (const row of proof.files) {
  const target = path.join(cache, row.file), info = await lstat(target);
  assert.equal(path.dirname(target), cache); assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.equal(sha(await readFile(target)), row.sha256); duplicateBytes += info.size;
  if (row.file !== "build-manifest.json") assert.equal(sha(await readFile(path.join(parent, row.file))), row.sha256, row.file);
}
assert.equal(proof.files.length, 20); assert.equal(duplicateBytes, proof.reusableToolBytes);
const runtime = await createOwnedRuntimeScratch("packet-interleave-terminal-");
const execute = promisify(execFile), gh = "D:/Program Files/GitHub CLI/gh.exe", repo = "tanishqbaweja/fileconverter";
const call = async args => (await execute(gh, args, { cwd: root, env: runtime.env, windowsHide: true,
  timeout: 60000, maxBuffer: 1048576 })).stdout;
let artifactBefore, artifactAfter;
try {
  artifactBefore = JSON.parse(await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`]));
  assert.equal(artifactBefore.total_count, 1);
  assert.equal(artifactBefore.artifacts[0].id, proof.artifact.id);
  assert.equal(artifactBefore.artifacts[0].workflow_run.head_sha, branch.commit);
  await call(["api", "--method", "DELETE", `repos/${repo}/actions/artifacts/${proof.artifact.id}`]);
  artifactAfter = JSON.parse(await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`]));
  assert.equal(artifactAfter.total_count, 0);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const currentIdentity = await lstat(cache, { bigint: true });
assert.equal(currentIdentity.dev, identity.dev); assert.equal(currentIdentity.ino, identity.ino);
assert.equal(await realpath(cache), cache);
await rm(cache, { recursive: true, force: false });
await assert.rejects(access(cache), { code: "ENOENT" });
const result = { recordedAt: new Date().toISOString(), status: "actual-pinned-wasm-interleave-ownership-passed-not-conversion",
  run: { id: runId, headSha: branch.commit, url: proof.run.url, buildStepSeconds: 368, jobSeconds: 413 },
  experiment: manifest.packetInterleaveOwnership.actualWasmExperiment,
  experimentSha256: manifest.packetInterleaveOwnership.sha256, nativeSourceCount: sources.length, inheritedSourceCount: 99,
  allInheritedSourcesRetained: true, inheritedSourceOnlyDifference: branch.workflow.path,
  sourcePreimagesAndPostPinsVerified: true, currentPins,
  archive: { path: archivePath, bytes: retained.length, sha256: sha(retained), restoredBytes: restored.length, restoredSha256: sha(restored) },
  parentProof: { path: proofPath, sha256: sha(proofBytes) }, branchProof: { path: branchPath, sha256: sha(branchBytes) },
  unchangedProductionDecoderSha256: manifest.artifacts["within-mpeg2-split.wasm"],
  unchangedProductionEncoderSha256: manifest.artifacts["split-encoder.wasm"],
  cleanup: { disposableDuplicateCacheRemoved: true, duplicateFilesRemoved: 20, duplicateBytesRemoved: duplicateBytes,
    all19NonManifestFilesIdenticalToRetainedParent: true, exactNewManifestArchived: true, retainedParentDirectory: path.relative(root, parent),
    hostedArtifactDeleted: proof.artifact.id, hostedArtifactCountAfter: artifactAfter.total_count,
    downloadedRuntimeRemoved: true, terminalRuntimeRemoved: true, hostedCleanupStepPassed: true },
  nativeExperimentIsSyntheticPayloadNotMedia: true, originalRead: false, originalChanged: false, conversionsPerformed: 0,
  productionQueuePolicyChanged: false, actualFatalCacheOccupancyMeasured: false, fullFailureCauseProven: false,
  realContainerFidelityVerified: false, fullOriginalCompleted: false, speedGainProven: false, publicAcceptance: false,
  nextAction: "Use the demonstrated queue release to prepare a private drain candidate; retain live refs and independently verify every real stream, timestamp, metadata, quality and memory gate before promotion/full acceptance.",
  ownSource: { path: ownPath, sha256: sha(ownBytes) } };
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCount: sources.length, archiveBytes: retained.length,
  experiment: result.experiment, duplicateBytesRemoved: duplicateBytes, hostedArtifactCountAfter: 0 }));
