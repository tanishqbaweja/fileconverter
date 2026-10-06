// Download only a successful, source-bound private tool build. No media.
// All CLI scratch/extracted tools stay in this repository; failed output is
// removed only after validating its newly acquired directory identity.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), work = path.join(root, "work");
const runId = process.argv[2], expectedHead = process.argv[3];
assert.match(runId ?? "", /^[0-9]{8,}$/); assert.match(expectedHead ?? "", /^[a-f0-9]{40}$/);
const output = path.join(work, `mpeg2-split-pipeline-${runId}`);
const gh = "D:\\Program Files\\GitHub CLI\\gh.exe", exec = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
let runtime, identity, complete = false;
try {
  await mkdir(work, { recursive: true });
  assert.equal((await realpath(work)).toLowerCase(), work.toLowerCase());
  await assert.rejects(access(output), { code: "ENOENT" }, "Never overwrite an old candidate");
  runtime = await createOwnedRuntimeScratch("aligned-artifact-download-");
  const call = async args => (await exec(gh, args, { cwd: root, env: runtime.env,
    windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024 })).stdout;
  const run = JSON.parse(await call(["run", "view", runId, "--repo", "tanishqbaweja/fileconverter",
    "--json", "databaseId,headSha,status,conclusion,jobs,url"]));
  assert.equal(String(run.databaseId), runId); assert.equal(run.headSha, expectedHead);
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success");
  assert.ok(run.jobs.every(job => job.conclusion === "success"));
  const artifacts = JSON.parse(await call(["api", `repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`])).artifacts;
  assert.equal(artifacts.length, 1); const artifact = artifacts[0];
  assert.equal(artifact.name, `private-mpeg2-aligned-reuse-${runId}`); assert.equal(artifact.expired, false);
  assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 16 * 1024 * 1024);
  await mkdir(output); identity = await lstat(output, { bigint: true });
  await call(["run", "download", runId, "--repo", "tanishqbaweja/fileconverter", "--name", artifact.name, "--dir", output]);
  assert.equal(await realpath(output), output); assert.equal(identity.isSymbolicLink(), false);
  const files = await readdir(output); assert.equal(files.length, 9);
  const retained = {};
  for (const file of files) {
    assert.ok(/^[a-zA-Z0-9_.-]+$/.test(file));
    const detail = await lstat(path.join(output, file)); assert.ok(detail.isFile() && !detail.isSymbolicLink());
    assert.ok(detail.size <= 16 * 1024 * 1024);
    retained[file] = { bytes: detail.size, sha256: sha(await readFile(path.join(output, file))) };
  }
  const manifest = JSON.parse(await readFile(path.join(output, "build-manifest.json")));
  assert.equal(manifest.scope, "private-fixed-heap-alignment-reuse-candidate-not-browser-acceptance");
  assert.equal(manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(manifest.allowMemoryGrowth, false);
  assert.equal(manifest.alignedReuse.standaloneSyntheticContract.passed, 6);
  assert.equal(manifest.alignedReuse.actualLinkedWrapperVerified, true);
  assert.equal(manifest.alignedReuse.browserConversionVerified, false);
  for (const [file, digest] of Object.entries(manifest.artifacts)) assert.equal(retained[file]?.sha256, digest, file);
  for (const [file, digest] of Object.entries(manifest.sources)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  const report = { recordedAt: new Date().toISOString(), scope: "Compiled private tools only, not browser acceptance",
    run, artifact, retained, manifest, localToolDirectory: path.relative(root, output).replaceAll("\\", "/"),
    originalRead: false, conversionsPerformed: 0, publicAcceptance: false,
    remoteArtifactDeleted: false, sourceSha256: sha(await readFile(new URL(import.meta.url))) };
  await writeFile(path.join(root, `evidence/mpeg2-aligned-build-${runId}.json`), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  complete = true; console.log(`Verified reusable private tools: ${output}. No browser acceptance claimed.`);
} finally {
  try {
    if (identity && !complete) {
      const current = await lstat(output, { bigint: true });
      assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
      assert.ok(current.isDirectory() && !current.isSymbolicLink()); assert.equal(await realpath(output), output);
      assert.equal(path.dirname(output), work); await rm(output, { recursive: true });
    }
  } finally { if (runtime) await runtime.close(); }
}
