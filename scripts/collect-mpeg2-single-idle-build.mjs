// Collect only a successful source-bound private tool build. No user media.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readdir, realpath, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { reverseSingleIdleRefstruct } from "../media/ffmpeg/mpeg2-single-idle-source.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const runId = process.argv[2]; assert.equal(process.argv.length, 3); assert.match(runId ?? "", /^[0-9]{8,}$/);
const cache = path.join(root, `work/mpeg2-single-idle-${runId}`), proofPath = path.join(root, `evidence/mpeg2-single-idle-build-${runId}.json`);
await assert.rejects(access(cache), { code: "ENOENT" }); await assert.rejects(access(proofPath), { code: "ENOENT" });
const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-single-idle-build-branch-2026-10-10.json")));
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 64 * 1024 ** 2);
const runtime = await createOwnedRuntimeScratch("single-idle-artifact-");
const gh = "D:/Program Files/GitHub CLI/gh.exe", repo = "tanishqbaweja/fileconverter";
const call = async args => (await execute(gh, args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 1048576 })).stdout;
let run, artifact, manifest, files, smoke, identity, complete = false;
try {
  run = JSON.parse(await call(["run", "view", runId, "--repo", repo, "--json", "databaseId,headSha,createdAt,updatedAt,status,conclusion,jobs,url"]));
  assert.equal(String(run.databaseId), runId); assert.equal(run.headSha, branch.commit);
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success");
  assert.ok(run.jobs.every(job => job.conclusion === "success"));
  const listing = JSON.parse(await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`]));
  assert.equal(listing.total_count, 1); artifact = listing.artifacts[0];
  assert.equal(artifact.name, `private-mpeg2-aligned-reuse-${runId}`); assert.equal(artifact.expired, false);
  assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 8 * 1024 ** 2);
  const download = path.join(runtime.directory, "tools");
  await call(["run", "download", runId, "--repo", repo, "--name", artifact.name, "--dir", download]);
  const names = await readdir(download); assert.ok(names.length > 0 && names.length <= 20); files = [];
  for (const file of names.toSorted()) {
    assert.match(file, /^(?:within-mpeg2-split\.mjs(?:\.symbols)?|within-mpeg2-split\.wasm|split-encoder\.mjs|split-encoder\.wasm|build-manifest\.json|config_components\.h|LICENSE\.ffmpeg|encoder-initialization\.json|late-refstruct-smoke\.json|late-refstruct-source\.sha256|decoder-link\.map|single-idle-smoke\.json|single-idle-refstruct\.c|single-idle-hevc-policy\.h)$/);
    const info = await lstat(path.join(download, file)); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size < 8 * 1024 ** 2);
    files.push({ file, bytes: info.size, sha256: sha(await readFile(path.join(download, file))) });
  }
  assert.ok(files.reduce((sum, row) => sum + row.bytes, 0) <= 16 * 1024 ** 2);
  manifest = JSON.parse(await readFile(path.join(download, "build-manifest.json")));
  assert.equal(manifest.scope, "private-fixed-heaps-hevc-single-idle-candidate-not-browser-acceptance");
  for (const [file, hash] of Object.entries(manifest.artifacts)) assert.equal(files.find(row => row.file === file)?.sha256, hash, file);
  for (const [file, hash] of Object.entries(manifest.sources)) {
    if (file === branch.workflow.path) assert.equal(hash, branch.workflow.generatedSha256);
    else assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  }
  const decoder = await readFile(path.join(download, "within-mpeg2-split.wasm"));
  assert.deepEqual(readWasmMemoryLimits(decoder), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.notEqual(sha(decoder), "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
  assert.equal(manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.equal(manifest.artifacts["split-encoder.mjs"], "00c0d1b4435e9294c6784e9ccaf196f171caa3c9cc3d4c7a4aab1a47c6d8bb5e");
  smoke = JSON.parse(await readFile(path.join(download, "single-idle-smoke.json")));
  assert.deepEqual(smoke, manifest.singleIdle.actualSyntheticWasm32Unit);
  assert.equal(smoke.status, "passed"); assert.equal(smoke.sequentialReuses, 200000); assert.equal(smoke.sequentialFreshAllocations, 1);
  assert.equal(smoke.maximumIdleEntriesPerSelectedPool, 1); assert.equal(smoke.conversionsPerformed, 0);
  assert.equal(manifest.singleIdle.actualBrowserConversionVerified, false); assert.equal(manifest.singleIdle.publicAcceptance, false);
  const actualRefstruct = await readFile(path.join(download, "single-idle-refstruct.c"), "utf8");
  reverseSingleIdleRefstruct(actualRefstruct);
  assert.equal(sha(actualRefstruct), manifest.singleIdle.actualPatchedRefstructSha256);
  assert.deepEqual(await readFile(path.join(download, "single-idle-hevc-policy.h")), await readFile(path.join(root, "media/ffmpeg/mpeg2-hevc-single-idle-policy.h")));
  const cleanup = run.jobs.flatMap(job => job.steps).find(step => step.name === "Remove repository-local build data");
  assert.equal(cleanup?.conclusion, "success");
  await mkdir(cache); identity = await lstat(cache, { bigint: true });
  assert.ok(identity.isDirectory() && !identity.isSymbolicLink()); assert.equal(await realpath(cache), cache);
  for (const row of files) await copyFile(path.join(download, row.file), path.join(cache, row.file), constants.COPYFILE_EXCL);
  for (const row of files) assert.equal(sha(await readFile(path.join(cache, row.file))), row.sha256);
  complete = true;
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  if (identity && !complete) {
    assert.equal(path.dirname(cache), path.join(root, "work")); const current = await lstat(cache, { bigint: true });
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino); assert.ok(current.isDirectory() && !current.isSymbolicLink());
    assert.equal(await realpath(cache), cache); await rm(cache, { recursive: true });
  }
}
const result = { recordedAt: new Date().toISOString(), status: "actual-single-idle-build-lifetime-unit-verified-not-browser-acceptance", run, artifact,
  manifest, files, smoke, reusableToolDirectory: cache, reusableToolBytes: files.reduce((sum, row) => sum + row.bytes, 0),
  retentionReason: "Small changed private core required for actual browser goldens/full test; remove when superseded",
  downloadRuntimeRemoved: true, hostedCleanupStepPassed: true, canonicalWorkflowUnchanged: true,
  collectorSourceSha256: sha(await readFile(new URL(import.meta.url))), originalRead: false, noDocker: true,
  browserConversionsPerformed: 0, actualLatePoolOomResolved: false, speedImprovementProven: false, publicAcceptance: false };
await writeFile(proofPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, tools: cache, bytes: result.reusableToolBytes, actualWasmReuses: smoke.sequentialReuses, publicAcceptance: false }));
