// Actual encoder-only build collector; compose with verified unchanged decoder.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readdir, realpath, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { verifySingleIdleBuildEvidence, SINGLE_IDLE_SLOT, SINGLE_IDLE_DECODER_SHA } from "./lib/single-idle-browser-recipe.mjs";
import { reverseSingleIdlePlaneBuffer, reverseSingleIdlePlaneGetBuffer } from "../media/ffmpeg/mpeg2-encoder-plane-source.mjs";
import { reversePlaneFactoryPrototype } from "../media/ffmpeg/mpeg2-encoder-plane-prototype-source.mjs";
import { makeSingleIdleEncoderPlaneRecipe } from "../media/ffmpeg/mpeg2-encoder-plane-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), read = file => readFile(path.join(root, file));
const runId = "38044000567", slot = "mpeg2-encoder-planes-" + runId;
const cache = path.join(root, "work", slot), proofPath = `evidence/mpeg2-encoder-plane-build-${runId}.json`;
assert.equal(process.argv.length, 2);
await assert.rejects(access(cache), { code: "ENOENT" }); await assert.rejects(access(path.join(root, proofPath)), { code: "ENOENT" });
const branchPath = "evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json", branchBytes = await read(branchPath), branch = JSON.parse(branchBytes);
const decoderPath = "evidence/mpeg2-single-idle-build-37986418102.json", decoderBytes = await read(decoderPath), decoderProof = JSON.parse(decoderBytes);
const decoderBranch = JSON.parse(await read("evidence/mpeg2-single-idle-build-branch-2026-10-10.json"));
verifySingleIdleBuildEvidence(decoderProof, decoderBranch);
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 64 * 1024 ** 2);
const runtime = await createOwnedRuntimeScratch("encoder-plane-artifact-");
const call = async args => (await execute("D:/Program Files/GitHub CLI/gh.exe", args,
  { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 1048576 })).stdout;
let run, artifact, encoderManifest, manifest, files, smoke, identity, complete = false;
try {
  const repo = "tanishqbaweja/fileconverter";
  run = JSON.parse(await call(["run", "view", runId, "--repo", repo, "--json", "databaseId,headSha,createdAt,updatedAt,status,conclusion,jobs,url"]));
  assert.equal(String(run.databaseId), runId); assert.equal(run.headSha, branch.commit);
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success"); assert.ok(run.jobs.every(job => job.conclusion === "success"));
  const listing = JSON.parse(await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`]));
  assert.equal(listing.total_count, 1); artifact = listing.artifacts[0];
  assert.equal(artifact.name, `private-mpeg2-split-encoder-${runId}`); assert.equal(artifact.expired, false);
  assert.equal(artifact.workflow_run.head_sha, branch.commit); assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 2097152);
  const download = path.join(runtime.directory, "tools");
  await call(["run", "download", runId, "--repo", repo, "--name", artifact.name, "--dir", download]);
  const permitted = new Set(["split-encoder.mjs", "split-encoder.wasm", "config_components.h", "LICENSE.LGPLv2.1",
    "mpeg2-split-encoder.c", "mpeg2-split-frame-layout.h", "mpeg2-split-frame-properties.h", "mpeg2-split-codec-parameters.h",
    "build-mpeg2-split-encoder.sh", "mpeg2-encoder-uncached-frame-buffers.patch", "mpeg2-encoder-uncached-accessories.patch",
    "mpeg2-accessory-smoke.json", "encoder-plane-smoke.json", "encoder-plane-buffer.c", "encoder-plane-get-buffer.c",
    "encoder-plane-policy.h", "initialization-contract.json", "encoder-plane-build-manifest.json"]);
  const names = await readdir(download); assert.equal(names.length, permitted.size); files = [];
  for (const file of names.toSorted()) {
    assert.ok(permitted.has(file), file); const info = await lstat(path.join(download, file));
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 1048576);
    files.push({ file, bytes: info.size, sha256: sha(await readFile(path.join(download, file))) });
  }
  assert.ok(files.reduce((total, row) => total + row.bytes, 0) <= 2097152);
  encoderManifest = JSON.parse(await readFile(path.join(download, "encoder-plane-build-manifest.json")));
  assert.equal(encoderManifest.scope, "private-actual-wasm32-plane-lifecycle-and-initialization-not-browser-acceptance");
  for (const [file, hash] of Object.entries(encoderManifest.artifacts)) assert.equal(files.find(row => row.file === file)?.sha256, hash, file);
  for (const [file, hash] of Object.entries({ ...encoderManifest.baseInitialization, ...encoderManifest.sources }))
    assert.equal(sha(await read(file)), hash, file);
  const actualWorkflow = (await execute("git", ["show", `${branch.commit}:${branch.workflow.path}`],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 65536 })).stdout;
  assert.equal(sha(actualWorkflow), branch.workflow.generatedSha256);
  assert.equal(sha(await read(branch.workflow.path)), branch.workflow.canonicalSha256);
  const { generated } = makeSingleIdleEncoderPlaneRecipe((await read("media/ffmpeg/build-mpeg2-split-encoder.sh")).toString());
  assert.equal(sha(generated), encoderManifest.executedRecipeSha256);
  const encoderLimits = readWasmMemoryLimits(await readFile(path.join(download, "split-encoder.wasm")));
  assert.deepEqual(encoderLimits, [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  assert.notEqual(encoderManifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  smoke = JSON.parse(await readFile(path.join(download, "encoder-plane-smoke.json"))); assert.deepEqual(smoke, encoderManifest.smoke);
  assert.equal(smoke.status, "passed"); assert.equal(smoke.selectorConfigurations, 80); assert.equal(smoke.sequentialReuses, 200000);
  assert.equal(smoke.sequentialFreshAllocations, 1); assert.equal(smoke.maximumIdleEntriesPerSelectedPool, 1); assert.equal(smoke.conversionsPerformed, 0);
  for (const key of ["liveReferencesUnchanged", "uninitWithLiveReferencesPassed", "allocatorCallbackFailurePassed", "zeroEveryAcquisitionPassed", "nonselectedCacheUnchanged"])
    assert.equal(smoke[key], true);
  reverseSingleIdlePlaneBuffer(reversePlaneFactoryPrototype(await readFile(path.join(download, "encoder-plane-buffer.c"), "utf8")));
  reverseSingleIdlePlaneGetBuffer(await readFile(path.join(download, "encoder-plane-get-buffer.c"), "utf8"));
  assert.deepEqual(await readFile(path.join(download, "encoder-plane-policy.h")), await read("media/ffmpeg/mpeg2-encoder-plane-policy.h"));
  for (const key of ["heapLimitsRaised", "codecOptionsChanged", "browserAcceptance", "publicAcceptance"]) assert.equal(encoderManifest[key], false);
  assert.equal(encoderManifest.privateFactoryDeclarationPresent, true); assert.equal(encoderManifest.actualSourceReversalsPassed, true);
  assert.equal(run.jobs.flatMap(job => job.steps).find(step => step.name === "Remove repository-local build data")?.conclusion, "success");
  const decoderFiles = [];
  for (const file of ["within-mpeg2-split.mjs", "within-mpeg2-split.wasm"]) {
    const bytes = await read(`work/${SINGLE_IDLE_SLOT}/${file}`), expected = decoderProof.files.find(row => row.file === file);
    assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256); decoderFiles.push({ file, bytes: bytes.length, sha256: sha(bytes) });
  }
  assert.equal(decoderFiles.find(row => row.file.endsWith(".wasm")).sha256, SINGLE_IDLE_DECODER_SHA);
  const sources = { ...decoderProof.manifest.sources, ...encoderManifest.baseInitialization, ...encoderManifest.sources };
  delete sources[branch.workflow.path]; // Each actual workflow stays in its separate, immutable component provenance.
  for (const [file, hash] of Object.entries(sources)) assert.equal(sha(await read(file)), hash, file);
  manifest = { scope: "verified-component-assembly-not-one-build-or-browser-acceptance", aggregateWasmMemoryBytes: 50331648,
    allowMemoryGrowth: false, memories: { decoderMux: decoderProof.manifest.memories.decoderMux, encoder: encoderLimits },
    sources, artifacts: Object.fromEntries([...files, ...decoderFiles].map(row => [row.file, row.sha256])),
    provenance: { decoder: { evidence: decoderPath, sha256: sha(decoderBytes), run: 37986418102, copiedByteExact: true },
      encoder: { run: Number(runId), commit: run.headSha, workflowSha256: branch.workflow.generatedSha256,
        manifestSha256: files.find(row => row.file === "encoder-plane-build-manifest.json").sha256 } }, publicAcceptance: false };
  await mkdir(cache); identity = await lstat(cache, { bigint: true });
  assert.ok(identity.isDirectory() && !identity.isSymbolicLink()); assert.equal(await realpath(cache), cache);
  for (const row of files) await copyFile(path.join(download, row.file), path.join(cache, row.file), constants.COPYFILE_EXCL);
  for (const row of decoderFiles) await copyFile(path.join(root, "work", SINGLE_IDLE_SLOT, row.file), path.join(cache, row.file), constants.COPYFILE_EXCL);
  files.push(...decoderFiles);
  await writeFile(path.join(cache, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  const manifestBytes = await readFile(path.join(cache, "build-manifest.json")); files.push({ file: "build-manifest.json", bytes: manifestBytes.length, sha256: sha(manifestBytes) });
  for (const row of files) assert.equal(sha(await readFile(path.join(cache, row.file))), row.sha256);
  complete = true;
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  if (identity && !complete) {
    assert.equal(path.dirname(cache), path.join(root, "work")); const current = await lstat(cache, { bigint: true });
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
    assert.ok(current.isDirectory() && !current.isSymbolicLink()); assert.equal(await realpath(cache), cache); await rm(cache, { recursive: true });
  }
}
const proof = { observedAt: new Date().toISOString(), status: "actual-encoder-plane-wasm-lifecycle-and-initialization-verified-not-browser-acceptance",
  run, artifact, encoderManifest, manifest, smoke, files, branch: { path: branchPath, sha256: sha(branchBytes) },
  decoder: { path: decoderPath, sha256: sha(decoderBytes), unchanged: true }, reusableToolDirectory: cache,
  reusableToolBytes: files.reduce((total, row) => total + row.bytes, 0), retentionReason: "Small private changed encoder plus unchanged decoder required for browser goldens/full test; remove when superseded",
  downloadRuntimeRemoved: true, hostedCleanupStepPassed: true, canonicalWorkflowUnchanged: true,
  collectorSourceSha256: sha(await readFile(new URL(import.meta.url))), originalRead: false, noDocker: true,
  browserConversionsPerformed: 0, originalOomResolved: false, speedImprovementProven: false, publicAcceptance: false };
await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, tools: cache, bytes: proof.reusableToolBytes, sequentialReuses: smoke.sequentialReuses, publicAcceptance: false }));
