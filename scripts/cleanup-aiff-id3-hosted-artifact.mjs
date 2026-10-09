// Delete only this exact owned hosted archive after independently verified local
// tools exist. Keep useful tiny modules for pending browser tests, not media copies.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), runId = "37998603437";
assert.equal(process.argv.length, 2);
const read = file => readFile(path.join(root, file)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofPath = `evidence/aiff-id3-hosted-cleanup-${runId}.json`;
await assert.rejects(access(path.join(root, proofPath)), { code: "ENOENT" });
const buildBytes = await read(`evidence/aiff-id3-specialist-build-${runId}.json`), build = JSON.parse(buildBytes);
const branch = JSON.parse(await read("evidence/aiff-id3-specialist-build-branch-v2-2026-10-10.json"));
assert.equal(build.status, "actual-private-aiff-id3-build-source-and-wasm-bounds-verified-not-browser-acceptance");
assert.equal(build.run.status, "completed"); assert.equal(build.run.conclusion, "success");
assert.equal(String(build.run.databaseId), runId); assert.equal(build.run.headSha, branch.commit);
assert.equal(branch.commit, "20cf3cb851fd45225754e0a1e42be0343aabeaf1");
assert.equal(build.compiledCMetadataEditsReversedExactly, true); assert.equal(build.actualWasmLimitsIndependentlyVerified, true);
assert.equal(build.downloadRuntimeRemoved, true); assert.equal(build.hostedCleanupStepPassed, true);
assert.equal(build.files.length, 12); assert.equal(build.artifact.name, `private-aiff-id3-specialist-${runId}`);
assert.ok(Number.isSafeInteger(build.artifact.id) && build.artifact.id > 0);
const directory = path.join(root, `work/aiff-id3-specialist-${runId}`);
assert.equal(build.reusableToolDirectory, directory); assert.equal(await realpath(directory), directory);
const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink());
for (const row of build.files) {
  assert.equal(path.basename(row.file), row.file);
  const file = path.join(directory, row.file), stat = await lstat(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(stat.size, row.bytes);
  assert.equal(sha(await readFile(file)), row.sha256, row.file);
}
const runtime = await createOwnedRuntimeScratch("aiff-id3-hosted-cleanup-");
const route = `repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`;
let before, after, deletionPerformed = false;
try {
  const call = async args => (await promisify(execFile)("D:/Program Files/GitHub CLI/gh.exe", args,
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 1048576 })).stdout;
  before = JSON.parse(await call(["api", route])); assert.ok(before.total_count === 0 || before.total_count === 1);
  if (before.total_count === 1) {
    const item = before.artifacts[0];
    for (const field of ["id", "name", "digest", "size_in_bytes"]) assert.equal(item[field], build.artifact[field], field);
    assert.equal(item.workflow_run.head_sha, branch.commit); assert.equal(String(item.workflow_run.id), runId);
    await call(["api", "--method", "DELETE", `repos/tanishqbaweja/fileconverter/actions/artifacts/${item.id}`]);
    deletionPerformed = true;
  }
  after = JSON.parse(await call(["api", route])); assert.equal(after.total_count, 0); assert.deepEqual(after.artifacts, []);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
await writeFile(path.join(root, proofPath), JSON.stringify({ recordedAt: new Date().toISOString(),
  status: "exact-owned-hosted-archive-absent-local-verified-private-tools-retained", buildProofSha256: sha(buildBytes),
  before, after, deletionPerformed, exactArtifactId: build.artifact.id, localToolsVerified: true,
  localToolsBytes: build.reusableToolBytes, localToolsRetainedForBrowserTests: true, ownedRuntimeRemoved: true,
  convertedFilesDeleted: 0, originalReadOrChanged: false, sourceSha256: sha(await readFile(new URL(import.meta.url))),
  browserConversionOrPublicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, deletionPerformed, hostedArtifactsRemaining: after.total_count, localToolsRetained: true }));
