// Isolated Git index; never checkout/copy media or change the canonical workflow.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAudioRepeatedCommentBuildWorkflow } from "./lib/audio-repeated-comment-build-workflow.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), sha = b => createHash("sha256").update(b).digest("hex");
const branch = "codex/audio-repeated-comments-20261024", repository = "tanishqbaweja/fileconverter";
const workflowPath = ".github/workflows/reproduce-ffmpeg-nondocker.yml", workflowName = "reproduce-ffmpeg-nondocker.yml";
const receiptPath = path.join(root, "evidence/audio-repeated-comment-build-2026-10-24.json");
assert.equal(process.argv.length, 3); assert.ok(["prepare", "dispatch", "observe"].includes(process.argv[2]));
const runtime = await createOwnedRuntimeScratch("audio-repeated-remote-");
try {
  const call = async (binary, args, env = runtime.env) => (await execute(binary, args, { cwd: root, env,
    windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout.trim();
  const git = (args, env) => call("git", args, env), gh = args => call(process.platform === "win32" ? "D:/Program Files/GitHub CLI/gh.exe" : "gh", args);
  const canonical = await readFile(path.join(root, workflowPath), "utf8"), generated = makeAudioRepeatedCommentBuildWorkflow(canonical);
  const list = async () => JSON.parse(await gh(["run", "list", "--repo", repository, "--workflow", workflowName, "--branch", branch,
    "--event", "workflow_dispatch", "--limit", "10", "--json", "databaseId,headSha,status,conclusion,createdAt,updatedAt,url"]));
  if (process.argv[2] === "prepare") {
    await assert.rejects(access(receiptPath), { code: "ENOENT" });
    assert.equal(await git(["status", "--porcelain"]), "", "Commit scoped work before isolated build preparation");
    assert.equal(await git(["ls-files", "--", "test.mkv"]), "");
    assert.equal(await git(["remote", "get-url", "origin"]), "https://github.com/" + repository + ".git");
    await assert.rejects(git(["show-ref", "--verify", "refs/heads/" + branch]));
    assert.equal(await git(["ls-remote", "origin", "refs/heads/" + branch]), "");
    const parent = await git(["rev-parse", "HEAD"]), main = await git(["ls-remote", "origin", "refs/heads/main"]);
    const env = { ...runtime.env, GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index") };
    await git(["read-tree", parent], env);
    const blobResult = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, env, windowsHide: true,
      input: generated.generated, encoding: "utf8", timeout: 30000, maxBuffer: 65536 });
    assert.equal(blobResult.status, 0, blobResult.stderr); const blob = blobResult.stdout.trim(); assert.match(blob, /^[a-f0-9]{40}$/);
    await git(["update-index", "--add", "--cacheinfo", `100644,${blob},${workflowPath}`], env);
    const tree = await git(["write-tree"], env);
    const commit = await git(["commit-tree", tree, "-p", parent, "-m", "Compile private repeated-comment metadata fix with pinned no-Docker workflow"], env);
    assert.deepEqual((await git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit])).split("\n"), [workflowPath]);
    await git(["update-ref", "refs/heads/" + branch, commit, "0".repeat(40)]);
    await git(["-c", "gc.auto=0", "push", "origin", commit + ":refs/heads/" + branch]);
    assert.equal((await git(["ls-remote", "origin", "refs/heads/" + branch])).split(/\s/)[0], commit);
    assert.equal(await git(["rev-parse", "HEAD"]), parent); assert.equal(await git(["status", "--porcelain"]), "");
    assert.equal(await git(["ls-remote", "origin", "refs/heads/main"]), main);
    assert.equal(await readFile(path.join(root, workflowPath), "utf8"), canonical);
    const report = { recordedAt: new Date().toISOString(), status: "isolated-build-branch-pushed-not-dispatched", branch, parent, commit, tree,
      workflow: { path: workflowPath, canonicalSha256: sha(canonical), generatedSha256: generated.generatedSha256, gitBlob: blob },
      canonicalHeadIndexAndWorkflowUnchanged: true, mainUnchanged: true, remoteVerified: true, noCheckoutOrMediaCopyCreated: true,
      priorComparableBuild: { runId: 39517752087, elapsedSeconds: 497 }, estimatedBuildMinutes: 9,
      browserConversions: 0, publicAcceptance: false, noDocker: true };
    await writeFile(receiptPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify(report));
  } else {
    const receiptBytes = await readFile(receiptPath), receipt = JSON.parse(receiptBytes);
    assert.equal(receipt.branch, branch); assert.match(receipt.commit, /^[a-f0-9]{40}$/);
    const remote = JSON.parse(await gh(["api", "repos/" + repository + "/git/ref/heads/" + branch])); assert.equal(remote.object.sha, receipt.commit);
    assert.equal(receipt.workflow.generatedSha256, generated.generatedSha256);
    if (process.argv[2] === "dispatch") {
      assert.equal(receipt.status, "isolated-build-branch-pushed-not-dispatched");
      assert.equal((await list()).length, 0, "Never dispatch twice or restart after an uncertain observation");
      // Persist intent BEFORE external action. On uncertainty, observe; never blindly redispatch.
      receipt.status = "dispatch-attempt-recorded-observe-before-any-retry"; receipt.dispatchedAt = new Date().toISOString();
      await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
      await gh(["workflow", "run", workflowName, "--repo", repository, "--ref", branch, "-f", "core=within-remux"]);
    }
    const runs = (await list()).filter(run => run.headSha === receipt.commit); assert.ok(runs.length <= 1, "Ambiguous remote run identity");
    if (runs.length) {
      receipt.run = runs[0]; receipt.status = runs[0].status === "completed" ? "build-terminal-" + runs[0].conclusion : "build-confirmed-live";
    }
    receipt.lastObservedAt = new Date().toISOString(); await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt));
  }
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
