// One exact hosted-run liveness receipt before ETA wait; never dispatch/retry.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
assert.equal(process.argv.length, 3); const runId = process.argv[2]; assert.match(runId, /^[0-9]{8,}$/);
const root = path.resolve(import.meta.dirname, ".."), own = "scripts/record-realloc-build-wait.mjs";
const branchPath = "evidence/mpeg2-realloc-attempt-build-branch-2026-10-14.json", branchBytes = await readFile(path.join(root, branchPath)), branch = JSON.parse(branchBytes);
assert.equal(branch.branch, "codex/mpeg2-realloc-attempt-20261014"); assert.equal(branch.remoteVerified, true); assert.equal(branch.originalRead, false);
assert.ok(branch.workflow.generatedExactSource.includes("node media/ffmpeg/build-mpeg2-realloc-attempt.mjs"));
const { stdout } = await promisify(execFile)("D:/Program Files/GitHub CLI/gh.exe", ["run", "view", runId, "--repo", "tanishqbaweja/fileconverter",
  "--json", "databaseId,headSha,status,conclusion,createdAt,updatedAt,jobs,url"],
  { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 262144 });
const run = JSON.parse(stdout); assert.equal(String(run.databaseId), runId); assert.equal(run.headSha, branch.commit);
assert.equal(run.status, "in_progress"); assert.equal(run.conclusion, "");
const ownBytes = await readFile(path.join(root, own)), now = Date.now(), waitMs = 720000;
const proof = { recordedAt: new Date(now).toISOString(), status: "exact-hosted-build-confirmed-live-not-qualification",
  run, branch: { path: branchPath, sha256: sha(branchBytes), head: branch.commit },
  explicitlyDispatchedCore: "within-mpeg2-aligned-reuse", noDuplicateDispatch: true, noDocker: true,
  estimatedBuildMinutes: [10,14], estimateBasis: "Previous actual largest-idle native build580s/job632s; two bounded controls add small work, no guaranteed duration.",
  waitMs, plannedObservationAfter: new Date(now + waitMs).toISOString(), waitMechanism: "one interruptible ETA-length sleep; no rapid agent polling",
  browserConversions: 0, originalRead: false, originalFailureRequestProven: false, publicAcceptance: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
const output = `evidence/realloc-build-${runId}-wait-plan.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, runId, head: run.headSha, status: run.status, waitMs, plannedObservationAfter: proof.plannedObservationAfter }));
