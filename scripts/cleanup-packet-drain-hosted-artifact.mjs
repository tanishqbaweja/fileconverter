// Remove only the independently verified hosted duplicate; retain browser tools.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 3); const runId = process.argv[2]; assert.match(runId, /^[0-9]{8,}$/);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const build = JSON.parse(await read(`evidence/mpeg2-packet-drain-build-${runId}.json`));
const proof = JSON.parse(await read(`evidence/packet-drain-native-${runId}.json`));
assert.equal(proof.nativeLifecyclePassed, true); assert.equal(proof.executedHead, build.run.headSha);
assert.equal(build.run.conclusion, "success"); assert.equal(build.files.length, 20);
for (const row of build.files) assert.equal(sha(await read(`work/mpeg2-packet-drain-${runId}/${row.file}`)), row.sha256);
const runtime = await createOwnedRuntimeScratch("packet-drain-artifact-cleanup-"), execute = promisify(execFile);
const gh = "D:/Program Files/GitHub CLI/gh.exe", repo = "tanishqbaweja/fileconverter";
const call = async args => (await execute(gh, args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 1048576 })).stdout;
let before, after;
try {
  before = JSON.parse(await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`]));
  assert.equal(before.total_count, 1); const artifact = before.artifacts[0]; assert.equal(artifact.id, build.artifact.id);
  assert.equal(artifact.name, `private-mpeg2-aligned-reuse-${runId}`); assert.equal(String(artifact.workflow_run.id), runId);
  assert.equal(artifact.workflow_run.head_sha, build.run.headSha);
  await call(["api", "--method", "DELETE", `repos/${repo}/actions/artifacts/${artifact.id}`]);
  after = JSON.parse(await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`])); assert.equal(after.total_count, 0);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const own = "scripts/cleanup-packet-drain-hosted-artifact.mjs", bytes = await read(own);
const output = `evidence/packet-drain-hosted-artifact-cleanup-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), runId, deletedArtifact: before.artifacts[0],
  remainingHostedArtifacts: after.total_count, allTwentyLocalToolsVerifiedAndRetained: true, localToolBytes: build.reusableToolBytes,
  retentionReason: "Changed private core needed for production-browser media fidelity and full-original qualification; remove when superseded.",
  ownedRuntimeAbsent: true, originalRead: false, browserConversions: 0, publicAcceptance: false,
  ownSource: { path: own, sha256: sha(bytes), preimage: bytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, deletedArtifactId: build.artifact.id, remainingHostedArtifacts: 0 }));
