// Remove exactly the now-redundant owned JSON artifact after local verification.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const input = "evidence/audio-destination-scopes-hosted-verification-2026-10-08.json";
const bytes = await readFile(path.join(root, input)), proof = JSON.parse(bytes);
const reportPath = path.join(root, "evidence/audio-destination-scopes-hosted-cleanup-2026-10-08.json");
await assert.rejects(access(reportPath), { code: "ENOENT" });
assert.equal(proof.status, "verified-small-hosted-destination-scopes-not-memory-or-quality-certification");
assert.equal(proof.runId, 37684741516); assert.equal(proof.artifactId, 11511031377);
assert.equal(proof.executedHarnessValidatorDeclarationEnginePinsVerified, true);
assert.equal(proof.ownedDownloadIndependentlyAbsent, true); assert.equal(proof.cases.length, 8);
const runtime = await createOwnedRuntimeScratch("audio-scope-delete-");
const repo = "repos/tanishqbaweja/fileconverter", endpoint = `${repo}/actions/runs/${proof.runId}/artifacts`;
const call = args => execute("D:/Program Files/GitHub CLI/gh.exe", args, { cwd: root,
  env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
let before, after;
try {
  before = JSON.parse((await call(["api", endpoint])).stdout);
  assert.equal(before.total_count, 1); assert.equal(before.artifacts.length, 1);
  assert.equal(before.artifacts[0].id, proof.artifactId);
  assert.equal(before.artifacts[0].name, `audio-destination-scopes-${proof.runId}`);
  await call(["api", "--method", "DELETE", `${repo}/actions/artifacts/${proof.artifactId}`]);
  after = JSON.parse((await call(["api", endpoint])).stdout);
  assert.equal(after.total_count, 0); assert.deepEqual(after.artifacts, []);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const report = { recordedAt: new Date().toISOString(), status: "verified-owned-hosted-json-artifact-deleted",
  runId: proof.runId, artifactId: proof.artifactId, before, after,
  verificationProof: { path: input, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
  localCompactReportsRetained: true, deletionTargetWasGeneratedJsonOnly: true,
  deletionCanBeRecoveredFromLocalRetainedRawReports: true, ownedRuntimeRemoved: true,
  noOtherArtifactsOrUserFilesDeleted: true, protectedOriginalRead: false };
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: report.status, artifactId: proof.artifactId, remainingRunArtifacts: after.total_count }));
