// Retrieve static tools only, never source/output media; retain one reusable small core.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, lstat, mkdir, readFile, readdir, realpath, rm, statfs, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const gh = "D:/Program Files/GitHub CLI/gh.exe", repo = "tanishqbaweja/fileconverter", runId = "37739125738";
const cache = path.join(root, `work/mpeg2-split-pipeline-${runId}`);
const proofPath = path.join(root, "evidence/mpeg2-late-slot-build-2026-10-08.json");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
await assert.rejects(access(cache), { code: "ENOENT" }); await assert.rejects(access(proofPath), { code: "ENOENT" });
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 64 * 1024 ** 2);
const runtime = await createOwnedRuntimeScratch("mpeg2-late-artifact-");
const call = args => execute(gh, args, { cwd: root, env: runtime.env, windowsHide: true,
  timeout: 30000, maxBuffer: 1024 * 1024 });
let run, artifact, manifest, files, smoke, identity, validated = false;
try {
  run = JSON.parse((await call(["run", "view", runId, "--repo", repo, "--json",
    "databaseId,headSha,createdAt,updatedAt,status,conclusion,jobs"])).stdout);
  assert.equal(run.headSha, "0e26ce4a853364c3cb10546e3313044daa90f927");
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success");
  const listing = JSON.parse((await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`])).stdout);
  assert.equal(listing.total_count, 1); artifact = listing.artifacts[0];
  assert.equal(artifact.id, 11533626760); assert.equal(artifact.name, `private-mpeg2-aligned-reuse-${runId}`);
  assert.equal(artifact.expired, false); assert.ok(artifact.size_in_bytes <= 8 * 1024 ** 2);
  const download = path.join(runtime.directory, "tools");
  await call(["run", "download", runId, "--repo", repo, "--name", artifact.name, "--dir", download]);
  const entries = await readdir(download); assert.ok(entries.length <= 20);
  files = [];
  for (const file of entries.toSorted()) {
    assert.match(file, /^(?:within-mpeg2-split\.mjs(?:\.symbols)?|within-mpeg2-split\.wasm|split-encoder\.mjs|split-encoder\.wasm|build-manifest\.json|config_components\.h|LICENSE\.[A-Za-z0-9.-]+|encoder-initialization\.json|late-refstruct-smoke\.json|late-refstruct-source\.sha256|decoder-link\.map)$/);
    const target = path.join(download, file), info = await lstat(target);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size < 8 * 1024 ** 2);
    files.push({ file, bytes: info.size, sha256: sha(await readFile(target)) });
  }
  assert.ok(files.reduce((sum, row) => sum + row.bytes, 0) < 16 * 1024 ** 2);
  manifest = JSON.parse(await readFile(path.join(download, "build-manifest.json")));
  assert.equal(manifest.scope, "private-fixed-heap-late-refstruct-request-diagnostic-not-acceptance");
  for (const [file, hash] of Object.entries(manifest.artifacts)) {
    const actual = files.find(row => row.file === file); assert.ok(actual, file); assert.equal(actual.sha256, hash);
  }
  const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-late-slot-build-branch-2026-10-08.json")));
  for (const [file, hash] of Object.entries(manifest.sources)) {
    if (file === ".github/workflows/reproduce-ffmpeg-nondocker.yml") assert.equal(hash, branch.workflow.generatedSha256);
    else assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  }
  const wasm = await readFile(path.join(download, "within-mpeg2-split.wasm"));
  assert.deepEqual(readWasmMemoryLimits(wasm), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.ok(WebAssembly.Module.imports(new WebAssembly.Module(wasm)).some(row => row.name === "within_bind_refstruct_abort_slot"));
  assert.equal(manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.equal(manifest.artifacts["split-encoder.mjs"], "00c0d1b4435e9294c6784e9ccaf196f171caa3c9cc3d4c7a4aab1a47c6d8bb5e");
  smoke = JSON.parse(await readFile(path.join(download, "late-refstruct-smoke.json")));
  assert.equal(smoke.status, "passed"); assert.equal(smoke.fixedSlotBytes, 64);
  assert.equal(smoke.freshRequestsObserved, 82); assert.equal(smoke.afterFirst48Verified, true);
  assert.equal(smoke.cacheReuseDoesNotCreateFreshRequest, true); assert.equal(smoke.initializationAddressBound, true);
  assert.equal(smoke.actualRefcountHeaderBytes, 16); assert.equal(smoke.conversionsPerformed, 0);
  assert.equal(manifest.lateRefstruct.actualBrowserAbortCaptureVerified, false);
  const cleanup = run.jobs[0].steps.find(step => step.name === "Remove repository-local build data");
  assert.equal(cleanup.conclusion, "success");
  await mkdir(cache); identity = await lstat(cache, { bigint: true });
  assert.equal(await realpath(cache), cache); assert.equal(identity.isSymbolicLink(), false);
  for (const row of files) await copyFile(path.join(download, row.file), path.join(cache, row.file), constants.COPYFILE_EXCL);
  for (const row of files) assert.equal(sha(await readFile(path.join(cache, row.file))), row.sha256);
  validated = true;
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  if (identity && !validated) {
    assert.equal(path.dirname(cache), path.join(root, "work"));
    const current = await lstat(cache, { bigint: true });
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino); assert.equal(current.isSymbolicLink(), false);
    await rm(cache, { recursive: true, force: true });
  }
}
await writeFile(proofPath, JSON.stringify({ recordedAt: new Date().toISOString(),
  status: "actual-no-docker-build-and-82-request-wasm-unit-verified-not-browser-acceptance",
  run, artifact, manifest, files, smoke, reusableToolDirectory: cache,
  reusableToolBytes: files.reduce((sum, row) => sum + row.bytes, 0),
  retentionReason: "Small private tools needed for next actual browser failure capture and goldens; delete when superseded",
  downloadRuntime: runtime.directory, ownedDownloadRemoved: true, hostedCleanupStepPassed: true,
  canonicalWorkflowUnchanged: true, noDocker: true, nativeConverterUsed: false, protectedOriginalRead: false,
  localBrowserConversions: 0, actualBrowserAbortCaptureVerified: false,
  actualLateFailedPool: null, actualFailedAllocationBytes: null, allocatorRootVerified: false,
  originalConversionCompleted: false, publicAcceptance: false,
  collectorSourceSha256: sha(await readFile(new URL(import.meta.url))) }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, reusedTools: cache, bytes: files.reduce((sum, row) => sum + row.bytes, 0),
  compiledRequestsVerified: 82, downloadRemoved: true, browserAcceptance: false }));
