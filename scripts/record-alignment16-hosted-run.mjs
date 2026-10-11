// One authoritative observation of the same dispatched run; never redispatch.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAlignment16Workflow } from "./lib/alignment16-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const runId = process.argv[2], revision = process.argv[3] ?? ""; assert.ok(["", "builder-fix"].includes(revision));
assert.equal(process.argv.length, revision ? 4 : 3); assert.match(runId ?? "", /^[0-9]{8,}$/);
const branch = JSON.parse(await readFile(path.join(root, `evidence/mpeg2-alignment16-build-branch-2026-10-11${revision ? "-" + revision : ""}.json`)));
const canonical = await readFile(path.join(root, branch.workflow.path), "utf8");
assert.equal(sha(canonical), branch.workflow.canonicalSha256); assert.equal(makeAlignment16Workflow(canonical), branch.workflow.generatedExactSource);
const runtime = await createOwnedRuntimeScratch("alignment16-run-observation-"); let run, failure = null;
try {
  run = JSON.parse((await execute("D:/Program Files/GitHub CLI/gh.exe", ["run", "view", runId, "--repo", "tanishqbaweja/fileconverter", "--json",
    "databaseId,headSha,createdAt,updatedAt,status,conclusion,jobs,url"], { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 1048576 })).stdout);
  assert.equal(String(run.databaseId), runId); assert.equal(run.headSha, branch.commit);
  assert.ok(["queued", "in_progress", "completed", "waiting", "pending", "requested"].includes(run.status));
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const sourceFiles = ["scripts/record-alignment16-hosted-run.mjs", "scripts/lib/alignment16-build-recipe.mjs", "scripts/prepare-alignment16-build-branch.mjs"];
const sourcePins = {}, sourcePreimages = {};
for (const file of sourceFiles) { const bytes = await readFile(path.join(root, file)); sourcePins[file] = sha(bytes); sourcePreimages[file] = bytes.toString("base64"); }
const recordedAt = new Date().toISOString(), output = `evidence/${recordedAt.replaceAll(/[:.]/g, "-")}-alignment16-hosted-run.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt, runId, revision, failure, run, expectedHead: branch.commit,
  actualSuccessfulBuildVerified: failure === null && run.status === "completed" && run.conclusion === "success", sourcePins, sourcePreimages,
  canonicalWorkflowUnchanged: true, ownedRuntime: runtime.directory, ownedRuntimeRemoved: true, originalVideoRead: false,
  browserConversionsPerformed: 0, allocatorFixVerified: false, publicAcceptance: false, noDocker: true }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, runId, failure, status: run?.status, conclusion: run?.conclusion, headSha: run?.headSha }));
