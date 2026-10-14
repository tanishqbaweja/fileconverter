// Capture one terminal hosted build failure, bounded logs, and exact sources.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 3); const runId = process.argv[2]; assert.match(runId, /^[0-9]{8,}$/);
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("mvf-arena-build-failure-");
const execute = promisify(execFile), gh = "D:/Program Files/GitHub CLI/gh.exe", repo = "tanishqbaweja/fileconverter";
const call = async args => (await execute(gh, args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 4 * 1048576 })).stdout;
let run, logs, artifactCount;
try {
  run = JSON.parse(await call(["run", "view", runId, "--repo", repo, "--json", "databaseId,headSha,status,conclusion,jobs,url"]));
  assert.equal(String(run.databaseId), runId); assert.equal(run.status, "completed"); assert.equal(run.conclusion, "failure");
  logs = await call(["run", "view", runId, "--repo", repo, "--log-failed"]);
  artifactCount = JSON.parse(await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`])).total_count;
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const raw = Buffer.from(logs), compressed = gzipSync(raw); assert.deepEqual(gunzipSync(compressed), raw);
const archivePath = `outputs/reports/mvf-arena-build-failure-${runId}.log.gz`;
await writeFile(path.join(root, archivePath), compressed, { flag: "wx" });
const failures = logs.split("\n").filter(line => /error:|AssertionError|Assertion failed|failed:|assertion|Aborted|RuntimeError/.test(line)).slice(-40);
const file = "scripts/record-mvf-arena-build-failure.mjs", bytes = await readFile(path.join(root, file));
const output = `evidence/mvf-arena-build-failure-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), run, failures, artifactCount,
  logArchive: { path: archivePath, bytes: compressed.length, sha256: sha(compressed), restoredBytes: raw.length, restoredSha256: sha(raw) },
  cleanupStep: run.jobs.flatMap(job => job.steps).find(step => step.name === "Remove repository-local build data"),
  ownedRuntimeAbsent: true, originalRead: false, browserConversions: 0, publicAcceptance: false,
  ownSource: { file, sha256: sha(bytes), preimage: bytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, failures, logArchiveBytes: compressed.length, artifactCount }));
