// Remove only the exact now-redundant owned hosted archive after local verification.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { verifySingleIdleBuildEvidence } from "./lib/single-idle-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const proofPath = "evidence/mpeg2-single-idle-hosted-cleanup-37986418102.json";
await assert.rejects(access(path.join(root, proofPath)), { code: "ENOENT" });
const buildBytes = await read("evidence/mpeg2-single-idle-build-37986418102.json"), build = JSON.parse(buildBytes);
const branch = JSON.parse(await read("evidence/mpeg2-single-idle-build-branch-2026-10-10.json"));
verifySingleIdleBuildEvidence(build, branch);
for (const row of build.files) assert.equal(sha(await read(`work/mpeg2-single-idle-37986418102/${row.file}`)), row.sha256, row.file);
assert.equal(build.artifact.id, 11643347901); assert.equal(build.artifact.name, "private-mpeg2-aligned-reuse-37986418102");
const runtime = await createOwnedRuntimeScratch("single-idle-hosted-cleanup-");
const runRoute = "repos/tanishqbaweja/fileconverter/actions/runs/37986418102/artifacts";
let before, after, deletionPerformed = false;
try {
  const call = async args => (await promisify(execFile)("D:/Program Files/GitHub CLI/gh.exe", args,
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 1048576 })).stdout;
  before = JSON.parse(await call(["api", runRoute]));
  assert.ok(before.total_count === 0 || before.total_count === 1);
  if (before.total_count === 1) {
    const item = before.artifacts[0];
    for (const field of ["id", "name", "digest", "size_in_bytes"]) assert.equal(item[field], build.artifact[field], field);
    assert.equal(item.workflow_run.head_sha, branch.commit); assert.equal(item.workflow_run.id, 37986418102);
    await call(["api", "--method", "DELETE", "repos/tanishqbaweja/fileconverter/actions/artifacts/11643347901"]);
    deletionPerformed = true;
  }
  after = JSON.parse(await call(["api", runRoute])); assert.equal(after.total_count, 0); assert.deepEqual(after.artifacts, []);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
await writeFile(path.join(root, proofPath), JSON.stringify({ recordedAt: new Date().toISOString(), status: "exact-hosted-artifact-absent-local-tools-verified-retained",
  buildProofSha256: sha(buildBytes), before, after, deletionPerformed, exactArtifactId: 11643347901,
  localToolsVerified: true, localToolsBytes: build.reusableToolBytes, localToolsRetainedForBrowserStress: true,
  ownedRuntimeRemoved: true, convertedFilesDeleted: 0, originalReadOrChanged: false,
  sourceSha256: sha(await readFile(new URL(import.meta.url))), publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, deletionPerformed, hostedArtifactsRemaining: after.total_count, localToolsRetained: true }));
