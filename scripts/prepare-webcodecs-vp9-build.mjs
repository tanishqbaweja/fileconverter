// Isolated Git index only: no second checkout/media copies and no default-branch mutation.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const branch = "codex/webcodecs-vp9-source-20261101", workflowPath = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
const output = path.join(root, "evidence/2026-11-01-webcodecs-vp9-build-branch.json");
await assert.rejects(access(output), { code: "ENOENT" });
const runtime = await createOwnedRuntimeScratch("webcodecs-vp9-git-index-");
const git = async (args, env = runtime.env) => (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", args,
  { cwd: root, env, windowsHide: true, timeout: 60000, maxBuffer: 131072 })).stdout.trim();
let report;
try {
  assert.equal(await git(["status", "--porcelain"]), "", "Commit scoped work first");
  assert.equal(await git(["ls-files", "--", "test.mkv"]), "");
  assert.equal(await git(["remote", "get-url", "origin"]), "https://github.com/tanishqbaweja/fileconverter.git");
  await assert.rejects(git(["show-ref", "--verify", `refs/heads/${branch}`]));
  assert.equal(await git(["ls-remote", "origin", `refs/heads/${branch}`]), "", "Never overwrite an existing build branch");
  const parent = await git(["rev-parse", "HEAD"]), main = await git(["ls-remote", "origin", "refs/heads/main"]);
  const source = await readFile(path.join(root, workflowPath), "utf8");
  const generated = await readFile(path.join(root, ".github/workflows/webcodecs-vp9-nondocker.yml"), "utf8");
  const env = { ...runtime.env, GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index") };
  await git(["read-tree", parent], env);
  const hashed = spawnSync(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["hash-object", "-w", "--stdin"],
    { cwd: root, env, windowsHide: true, input: generated, encoding: "utf8", timeout: 30000 });
  assert.equal(hashed.status, 0, hashed.stderr); const blob = hashed.stdout.trim(); assert.match(blob, /^[a-f0-9]{40}$/);
  await git(["update-index", "--add", "--cacheinfo", `100644,${blob},${workflowPath}`], env);
  const tree = await git(["write-tree"], env);
  const commit = await git(["commit-tree", tree, "-p", parent, "-m", "Compile private WebCodecs VP9 through registered workflow"], env);
  assert.deepEqual((await git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit])).split("\n"), [workflowPath]);
  await git(["update-ref", `refs/heads/${branch}`, commit, "0".repeat(40)]);
  await git(["-c", "gc.auto=0", "push", "origin", `${commit}:refs/heads/${branch}`]);
  assert.equal((await git(["ls-remote", "origin", `refs/heads/${branch}`])).split(/\s/)[0], commit);
  assert.equal(await git(["rev-parse", "HEAD"]), parent); assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal(await git(["ls-remote", "origin", "refs/heads/main"]), main);
  assert.equal(await readFile(path.join(root, workflowPath), "utf8"), source);
  const sha = x => createHash("sha256").update(x).digest("hex");
  report = { recordedAt: new Date().toISOString(), branch, parent, commit, tree, registeredWorkflowPath: workflowPath,
    canonicalWorkflowSha256: sha(source), generatedWorkflowSha256: sha(generated), generatedWorkflowSource: generated,
    changedTrackedFiles: [workflowPath], mainUnchanged: true, canonicalHeadIndexWorkflowUnchanged: true,
    remoteVerified: true, checkoutOrMediaCopiesCreated: false, actualBuildStarted: false, publicAcceptance: false };
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
report.ownedIndexRuntimeRemoved = true;
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ branch, commit: report.commit, output, remoteVerified: true, actualBuildStarted: false }));
