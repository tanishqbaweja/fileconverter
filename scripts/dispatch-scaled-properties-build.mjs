// Explicit private core selection: the workflow's default `all` is NOT this gate.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), repo = "tanishqbaweja/fileconverter";
const receiptPath = path.join(root, "evidence/mpeg2-scaled-properties-dispatch-2026-10-24.json");
await assert.rejects(access(receiptPath), { code: "ENOENT" });
const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-scaled-properties-build-branch-2026-10-24.json")));
assert.equal(branch.branch, "codex/mpeg2-scaled-properties-20261024"); assert.match(branch.commit, /^[a-f0-9]{40}$/);
assert.ok(branch.workflow.generatedExactSource.includes('elif test "${{ inputs.core }}" = within-mpeg2-aligned-reuse; then'));
assert.ok(branch.workflow.generatedExactSource.includes("node media/ffmpeg/build-mpeg2-scaled-properties.mjs"));
const runtime = await createOwnedRuntimeScratch("scaled-properties-dispatch-");
try {
  const gh = "D:/Program Files/GitHub CLI/gh.exe";
  const call = async args => (await execute(gh, args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout;
  const remote = JSON.parse(await call(["api", `repos/${repo}/git/ref/heads/${branch.branch}`])); assert.equal(remote.object.sha, branch.commit);
  const list = async () => JSON.parse(await call(["run", "list", "--repo", repo, "--branch", branch.branch, "--limit", "10", "--json", "databaseId,headSha,status,conclusion,event,createdAt,url"]));
  const before = new Set((await list()).map(run => run.databaseId)), dispatchedAt = new Date().toISOString();
  // Never omit this selector: workflow `all` does not compile this private core.
  const args = ["workflow", "run", "reproduce-ffmpeg-nondocker.yml", "--repo", repo, "--ref", branch.branch,
    "-f", "core=within-mpeg2-aligned-reuse"];
  await call(args);
  let selected;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 10000));
    const runs = (await list()).filter(run => !before.has(run.databaseId) && run.headSha === branch.commit && run.event === "workflow_dispatch");
    assert.ok(runs.length <= 1, "Do not guess between concurrent dispatches");
    if (runs.length) { selected = runs[0]; break; }
  }
  const receipt = { recordedAt: new Date().toISOString(), dispatchedAt, args, branch: branch.branch, head: branch.commit,
    requestedCore: "within-mpeg2-aligned-reuse", run: selected ?? null, buildAcceptance: false, browserConversions: 0, publicAcceptance: false,
    priorWrongScope: { runId: "40048810064", actualInput: "all (workflow default)", conclusion: "success",
      privateArtifacts: 0, qualifiedRepairedCore: false, collectorRejectedBeforeDownload: true } };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(receipt));
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
