// Exact isolated branch/one-shot dispatch/live-or-terminal inspection. No media.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.ok(process.argv.length === 3 || process.argv.length === 4);
const action = process.argv[2], attempt = process.argv[3] ?? "1";
assert.ok(["prepare", "dispatch", "inspect"].includes(action)); assert.match(attempt, /^[1-9]$/);
const suffix = attempt === "1" ? "" : "-attempt" + attempt;
const root = path.resolve(import.meta.dirname, ".."), repo = "tanishqbaweja/fileconverter", execute = promisify(execFile);
const prefix = "evidence/2026-11-05-vp9-duration-build", branchName = "codex/vp9-duration-source-20261105" + suffix;
const branchFile = path.join(root, prefix + "-branch" + suffix + ".json"), dispatchFile = path.join(root, prefix + "-dispatch" + suffix + ".json");
const workflowPath = ".github/workflows/reproduce-ffmpeg-nondocker.yml", sha = value => createHash("sha256").update(value).digest("hex");
const runtime = await createOwnedRuntimeScratch("vp9-duration-control-");
const env = { ...runtime.env, GH_PROMPT_DISABLED: "true", GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
const gitExe = process.env.WITHIN_GIT_EXECUTABLE ?? "git", ghExe = process.env.WITHIN_GH_EXECUTABLE ?? "gh";
const run = async (command, args, customEnv = env, maxBuffer = 262144) => (await execute(command, args,
  { cwd: root, env: customEnv, windowsHide: true, timeout: 60000, maxBuffer })).stdout.trim();
const git = args => run(gitExe, args), gh = (args, maxBuffer) => run(ghExe, args, env, maxBuffer);
const list = async () => JSON.parse(await gh(["run", "list", "--repo", repo, "--branch", branchName, "--limit", "10", "--json",
  "databaseId,headSha,status,conclusion,event,createdAt,url,workflowName"]));
const save = (file, value, flag = "wx") => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag });
try {
  if (action === "prepare") {
    await assert.rejects(access(branchFile), { code: "ENOENT" });
    assert.equal(await git(["status", "--porcelain"]), "", "Commit scoped work before creating the isolated build branch");
    assert.equal(await git(["ls-files", "--", "test.mkv"]), "");
    assert.equal(await git(["remote", "get-url", "origin"]), "https://github.com/" + repo + ".git");
    await assert.rejects(git(["show-ref", "--verify", "refs/heads/" + branchName]));
    assert.equal(await git(["ls-remote", "origin", "refs/heads/" + branchName]), "");
    const parent = await git(["rev-parse", "HEAD"]), main = await git(["ls-remote", "origin", "refs/heads/main"]);
    const canonical = await readFile(path.join(root, workflowPath)), selected = await readFile(path.join(root, ".github/workflows/vp9-duration-nondocker.yml"));
    const indexEnv = { ...env, GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index") };
    await run(gitExe, ["read-tree", parent], indexEnv);
    const hashed = spawnSync(gitExe, ["hash-object", "-w", "--stdin"], { cwd: root, env: indexEnv,
      windowsHide: true, input: selected, encoding: "utf8", timeout: 30000, maxBuffer: 65536 });
    assert.equal(hashed.status, 0, hashed.stderr); const blob = hashed.stdout.trim(); assert.match(blob, /^[a-f0-9]{40}$/);
    await run(gitExe, ["update-index", "--add", "--cacheinfo", "100644," + blob + "," + workflowPath], indexEnv);
    const tree = await run(gitExe, ["write-tree"], indexEnv), commit = await git(["commit-tree", tree, "-p", parent, "-m", "Build private VP9 packet duration through registered workflow"]);
    assert.deepEqual((await git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit])).split("\n"), [workflowPath]);
    await git(["update-ref", "refs/heads/" + branchName, commit, "0".repeat(40)]);
    await git(["-c", "gc.auto=0", "push", "origin", commit + ":refs/heads/" + branchName]);
    assert.equal((await git(["ls-remote", "origin", "refs/heads/" + branchName])).split(/\s/)[0], commit);
    assert.equal(await git(["rev-parse", "HEAD"]), parent); assert.equal(await git(["status", "--porcelain"]), "");
    assert.equal(await git(["ls-remote", "origin", "refs/heads/main"]), main); assert.equal(sha(await readFile(path.join(root, workflowPath))), sha(canonical));
    const report = { recordedAt: new Date().toISOString(), branch: branchName, parent, commit, tree, remoteVerified: true,
      canonicalWorkflowSha256: sha(canonical), generatedWorkflowSha256: sha(selected), generatedWorkflowSource: selected.toString(),
      mainUnchanged: true, checkoutIndexWorkflowUnchanged: true, mediaCopiesCreated: false, actualBuildStarted: false, publicAcceptance: false };
    await save(branchFile, report); console.log(JSON.stringify({ output: branchFile, branch: branchName, commit, actualBuildStarted: false }));
  } else {
    const branch = JSON.parse(await readFile(branchFile)); assert.equal(branch.branch, branchName); assert.equal(branch.remoteVerified, true);
    if (action === "dispatch") {
      await assert.rejects(access(dispatchFile), { code: "ENOENT" });
      const report = { recordedAt: new Date().toISOString(), branch: branchName, head: branch.commit,
        status: "dispatch-intent-recorded", dispatchMayHaveOccurred: false, run: null, publicAcceptance: false };
      await save(dispatchFile, report);
      try {
        assert.equal(JSON.parse(await gh(["api", `repos/${repo}/git/ref/heads/${branchName}`])).object.sha, branch.commit);
        assert.deepEqual(await list(), [], "Existing run requires inspection, never duplicate dispatch");
        report.dispatchMayHaveOccurred = true; report.dispatchedAt = new Date().toISOString(); await save(dispatchFile, report, "w");
        await gh(["workflow", "run", "reproduce-ffmpeg-nondocker.yml", "--repo", repo, "--ref", branchName]);
        const matches = (await list()).filter(row => row.headSha === branch.commit && row.event === "workflow_dispatch");
        assert.ok(matches.length <= 1); report.run = matches[0] ?? null;
        report.status = report.run ? "accepted-exact-run-discovered" : "accepted-awaiting-exact-run-discovery";
      } catch (error) { report.status = "inspection-required-do-not-redispatch"; report.error = String(error); process.exitCode = 1; }
      await save(dispatchFile, report, "w"); console.log(JSON.stringify(report));
    } else {
      const dispatch = JSON.parse(await readFile(dispatchFile)); assert.equal(dispatch.head, branch.commit);
      if (!dispatch.run) {
        const matches = (await list()).filter(row => row.headSha === branch.commit && row.event === "workflow_dispatch");
        assert.equal(matches.length, 1, "Do not infer terminal state or restart from unavailable discovery");
        dispatch.run = matches[0]; dispatch.runDiscoveredAt = new Date().toISOString(); await save(dispatchFile, dispatch, "w");
      }
      const runId = dispatch.run.databaseId;
      const [current, jobs] = await Promise.all([gh(["api", `repos/${repo}/actions/runs/${runId}`]), gh(["api", `repos/${repo}/actions/runs/${runId}/jobs`])]);
      const jobRun = JSON.parse(current), jobRows = JSON.parse(jobs).jobs; assert.equal(jobRun.head_sha, branch.commit);
      assert.equal(jobRun.run_attempt, 1); assert.ok(jobRows.length <= 1);
      if (jobRows.length) { assert.equal(jobRows[0].name, "build"); assert.ok(jobRows[0].steps.some(row => row.name === "Compile private duration core with unchanged codecs and memory limits")); }
      const report = { acquiredAt: new Date().toISOString(), runId, head: branch.commit, branch: branchName, status: jobRun.status,
        conclusion: jobRun.conclusion, url: `https://github.com/${repo}/actions/runs/${runId}`, exactHeadAndStepsVerified: jobRows.length === 1,
        job: jobRows[0] ? { id: jobRows[0].id, startedAt: jobRows[0].started_at, completedAt: jobRows[0].completed_at,
          steps: jobRows[0].steps.map(row => ({ name: row.name, status: row.status, conclusion: row.conclusion })) } : null,
        workflowDisplayNameNotSelectionProof: true, publicAcceptance: false, browserConversions: 0 };
      if (jobRun.status === "completed") {
        report.cleanupStepsPassed = ["Remove disposable owned build and SDK data", "Remove owned runtime scratch"]
          .every(name => jobRows[0]?.steps.find(row => row.name === name)?.conclusion === "success");
        if (jobRun.conclusion === "success") {
          const artifacts = JSON.parse(await gh(["api", `repos/${repo}/actions/runs/${runId}/artifacts`]));
          const matches = artifacts.artifacts.filter(row => row.name === `private-vp9-duration-${runId}`); assert.equal(matches.length, 1);
          const artifact = matches[0]; assert.equal(artifact.workflow_run.head_sha, branch.commit); assert.equal(artifact.expired, false);
          report.artifact = { id: artifact.id, name: artifact.name, bytes: artifact.size_in_bytes, digest: artifact.digest, expiresAt: artifact.expires_at };
        } else {
          const log = await gh(["run", "view", String(runId), "--repo", repo, "--job", String(jobRows[0].id), "--log"], 16777216);
          report.errorLines = log.split(/\r?\n/).filter(line => /error:|AssertionError|ERR_ASSERTION|curl: \(|ReferenceError|compiler test failed/.test(line)).slice(0, 30).map(line => line.slice(0, 1024));
          report.log = { bytes: Buffer.byteLength(log), sha256: sha(log) };
        }
        await save(path.join(root, prefix + `-${runId}-terminal.json`), report);
      }
      console.log(JSON.stringify(report));
    }
  }
} finally { await runtime.close(); }
