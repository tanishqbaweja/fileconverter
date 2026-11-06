// Exact-head terminal inspection. No media conversion and no implicit re-dispatch.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 3); const attempt = process.argv[2]; assert.match(attempt, /^[1-9]\d?$/);
const suffix = attempt === "1" ? "" : "-attempt" + attempt;
const originalWidth=Number(attempt)>=5,prefix=originalWidth?"2026-11-06-webcodecs-vp9-original":"2026-11-01-webcodecs-vp9";
const root = path.resolve(import.meta.dirname, ".."), repo = "tanishqbaweja/fileconverter", execute = promisify(execFile);
const dispatch = JSON.parse(await readFile(path.join(root, "evidence/"+prefix+"-build-dispatch" + suffix + ".json")));
const branch = JSON.parse(await readFile(path.join(root, "evidence/"+prefix+"-build-branch" + suffix + ".json")));
assert.equal(dispatch.head, branch.commit); assert.equal(dispatch.branch, branch.branch);
const runId = dispatch.run.databaseId; assert.ok(Number.isSafeInteger(runId));
const output = path.join(root, "evidence/"+prefix+`-build-${runId}-terminal.json`);
await assert.rejects(access(output), { code: "ENOENT" });
const runtime = await createOwnedRuntimeScratch("webcodecs-vp9-inspection-");
const report = { runId, head: branch.commit, branch: branch.branch, url: `https://github.com/${repo}/actions/runs/${runId}`,
  publicAcceptance: false, browserConversions: 0, completeChromiumMemoryMeasured: false, speedGainProven: false };
try {
  const gh = async (args, maxBuffer = 1048576) => (await execute(process.env.WITHIN_GH_EXECUTABLE ?? "gh", args,
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer })).stdout;
  const run = JSON.parse(await gh(["api", `repos/${repo}/actions/runs/${runId}`]));
  assert.equal(run.head_sha, branch.commit);assert.equal(run.run_attempt,1);
  if(run.status!=="completed") {report.status=run.status;report.exactHeadVerified=true;}
  else {
  const jobs = JSON.parse(await gh(["api", `repos/${repo}/actions/runs/${runId}/jobs`]));
  assert.equal(jobs.jobs.length, 1); const job = jobs.jobs[0]; assert.equal(job.name, "build");
  assert.ok(job.steps.some(x => x.name === "Compile real FFmpeg encoder plug-in and verify static native contract"));
  report.conclusion = run.conclusion; report.job = { id: job.id, startedAt: job.started_at, completedAt: job.completed_at,
    steps: job.steps.map(x => ({ name: x.name, conclusion: x.conclusion })) };
  const log = await gh(["run", "view", String(runId), "--repo", repo, "--job", String(job.id), "--log"], 16777216);
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  report.log = { bytes: Buffer.byteLength(log), sha256: sha(log), errorLines: log.split(/\r?\n/)
    .filter(line => /error:|curl: \(|AssertionError|ERR_ASSERTION|error\]|undefined symbol|Unknown option|strictly equal|ReferenceError:|compiler test failed/.test(line)).slice(0, 40).map(x => x.slice(0, 1024)),
    configureProbeFailuresMayBeExpected: true };
  const unit = /# tests (\d+)/.exec(log), pass = /# pass (\d+)/.exec(log), fail = /# fail (\d+)/.exec(log);
  report.focusedTests = unit && pass && fail ? { tests: Number(unit[1]), pass: Number(pass[1]), fail: Number(fail[1]) } : null;
  report.sdkInstalled = job.steps.find(x => x.name === "Install pinned SDK locally without Docker")?.conclusion === "success";
  report.cleanupStepsPassed = ["Remove disposable owned build and SDK data", "Remove owned runtime scratch"]
    .every(name => job.steps.find(x => x.name === name)?.conclusion === "success");
  report.buildAcceptance = run.conclusion === "success";
  if (run.conclusion === "success") {
    const artifacts = JSON.parse(await gh(["api", `repos/${repo}/actions/runs/${runId}/artifacts`]));
    const selected = artifacts.artifacts.filter(x => x.name === `private-webcodecs-vp9-${runId}`); assert.equal(selected.length, 1);
    assert.equal(selected[0].workflow_run.head_sha, branch.commit); assert.equal(selected[0].expired, false);
    report.artifact = { id: selected[0].id, name: selected[0].name, bytes: selected[0].size_in_bytes,
      digest: selected[0].digest, expiresAt: selected[0].expires_at, nativeContractIndependentlyCollected: false };
    report.status = "compiled-hosted-success-requires-native-artifact-and-browser-qualification";
  } else report.status = "failed-private-source-build-retained-not-conversion-acceptance";
  }
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); report.ownedInspectionRuntimeRemoved = true;
}
if(report.conclusion!==undefined)await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output:report.conclusion!==undefined?output:null,runId,head:report.head,status: report.status, conclusion: report.conclusion, focusedTests: report.focusedTests, errors: report.log?.errorLines,
  cleanupStepsPassed: report.cleanupStepsPassed, artifact: report.artifact }));
