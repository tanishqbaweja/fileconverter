// Observe one known run; this script never dispatches or restarts a build.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAlignment16Workflow } from "./lib/jspi-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), runId = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(runId, /^[0-9]{8,}$/);
const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-jspi-build-branch-2026-10-18.json")));
const canonical = await readFile(path.join(root, branch.workflow.path), "utf8");
assert.equal(sha(canonical), branch.workflow.canonicalSha256); assert.equal(makeAlignment16Workflow(canonical), branch.workflow.generatedExactSource);
const runtime = await createOwnedRuntimeScratch("jspi-run-observation-"); let run;
try {
  const { stdout } = await promisify(execFile)("D:/Program Files/GitHub CLI/gh.exe", ["run", "view", runId, "--repo", "tanishqbaweja/fileconverter", "--json",
    "databaseId,headSha,createdAt,updatedAt,status,conclusion,jobs,url"], { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 1048576 });
  run = JSON.parse(stdout); assert.equal(String(run.databaseId), runId); assert.equal(run.headSha, branch.commit);
  assert.ok(["queued", "in_progress", "completed", "waiting", "pending", "requested"].includes(run.status));
} finally { await runtime.close(); }
const sources = {};
for (const file of ["scripts/record-jspi-hosted-run.mjs", "scripts/lib/jspi-build-recipe.mjs"]) {
  const bytes = await readFile(path.join(root, file)); sources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const recordedAt = new Date().toISOString(), output = `evidence/${recordedAt.replaceAll(/[:.]/g, "-")}-jspi-hosted-run.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt, runId, run, expectedHead: branch.commit, sources,
  actualSuccessfulBuildVerified: run.status === "completed" && run.conclusion === "success", canonicalWorkflowUnchanged: true,
  ownedRuntimeRemoved: true, noDocker: true, originalVideoRead: false, browserConversionsPerformed: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, runId, status: run.status, conclusion: run.conclusion, headSha: run.headSha,
  steps: run.jobs.flatMap(job => job.steps.filter(step => step.status === "in_progress").map(step => step.name)) }));
