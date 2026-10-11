// Delete only the source-bound remote disposable artifact after verified local retention.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), runId = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(runId ?? "", /^[0-9]{8,}$/);
const output = `evidence/mpeg2-allocation-attempt-hosted-cleanup-${runId}.json`;
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const proofBytes = await readFile(path.join(root, `evidence/mpeg2-allocation-attempt-build-${runId}.json`)), proof = JSON.parse(proofBytes);
assert.equal(proof.status, "actual-allocation-attempt-build-unit-verified-not-browser-acceptance");
assert.equal(String(proof.run.databaseId), runId); assert.equal(proof.run.conclusion, "success");
assert.equal(proof.hostedCleanupStepPassed, true); assert.equal(proof.downloadRuntimeRemoved, true);
assert.equal(proof.artifact.name, `private-mpeg2-aligned-reuse-${runId}`);
const cache = path.join(root, `work/mpeg2-allocation-attempt-${runId}`);
assert.equal(proof.reusableToolDirectory, cache);
for (const row of proof.files) {
  const bytes = await readFile(path.join(cache, row.file));
  assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256, row.file);
}
const runtime = await createOwnedRuntimeScratch("allocation-attempt-remote-clean-");
const execute = promisify(execFile), repo = "tanishqbaweja/fileconverter";
const call = async args => (await execute("D:/Program Files/GitHub CLI/gh.exe", args,
  { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 })).stdout;
let before, after;
try {
  before = JSON.parse(await call(["api", `repos/${repo}/actions/artifacts/${proof.artifact.id}`]));
  assert.equal(before.id, proof.artifact.id); assert.equal(before.name, proof.artifact.name);
  assert.equal(before.workflow_run.id, proof.run.databaseId); assert.equal(before.workflow_run.head_sha, proof.run.headSha);
  assert.equal(before.size_in_bytes, proof.artifact.size_in_bytes); assert.equal(before.expired, false);
  await call(["api", "--method", "DELETE", `repos/${repo}/actions/artifacts/${before.id}`]);
  after = JSON.parse(await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`]));
  assert.equal(after.total_count, 0); assert.deepEqual(after.artifacts, []);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const report = { recordedAt: new Date().toISOString(), status: "source-bound-disposable-hosted-artifact-deleted-local-tools-retained",
  runId, proofSha256: sha(proofBytes), artifactBefore: before, artifactCountAfter: after.total_count,
  localToolsRetained: cache, localToolBytes: proof.reusableToolBytes,
  recoverability: "Verified reusable local tools remain; no user files or converted media deleted",
  ownedRuntimeRemoved: true, publicAcceptance: false, browserConversionsPerformed: 0 };
await writeFile(path.join(root, output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, artifactDeleted: before.id, artifactCountAfter: 0,
  reusableLocalToolBytes: proof.reusableToolBytes, browserConversionsPerformed: 0 }));
