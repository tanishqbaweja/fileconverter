// No copied checkout/media; only isolated index and one registered workflow blob.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeSingleIdleBuildWorkflow } from "./lib/single-idle-build-workflow.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const branch = "codex/mpeg2-single-idle-20261010", workflowPath = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
const output = "evidence/mpeg2-single-idle-build-branch-2026-10-10.json";
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const git = async (args, env = process.env) => (await execute("git", args, { cwd: root, env, windowsHide: true,
  timeout: 30000, maxBuffer: 65536 })).stdout.trim();
assert.equal(await git(["status", "--porcelain"]), "", "Commit scoped source work first");
assert.equal(await git(["ls-files", "--", "test.mkv"]), "", "Never copy/publish protected fixture");
assert.equal(await git(["remote", "get-url", "origin"]), "https://github.com/tanishqbaweja/fileconverter.git");
await assert.rejects(git(["show-ref", "--verify", `refs/heads/${branch}`]));
assert.equal(await git(["ls-remote", "origin", `refs/heads/${branch}`]), "", "Never overwrite remote branch");
const parent = await git(["rev-parse", "HEAD"]), main = await git(["ls-remote", "origin", "refs/heads/main"]);
const source = await readFile(path.join(root, workflowPath), "utf8"), generated = makeSingleIdleBuildWorkflow(source);
const runtime = await createOwnedRuntimeScratch("single-idle-git-index-");
let tree, commit, blob;
try {
  const env = { ...runtime.env, GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index") };
  await git(["read-tree", parent], env);
  const result = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, env, windowsHide: true,
    input: generated, encoding: "utf8", timeout: 30000, maxBuffer: 65536 });
  assert.equal(result.status, 0, result.stderr); blob = result.stdout.trim(); assert.match(blob, /^[a-f0-9]{40}$/);
  await git(["update-index", "--add", "--cacheinfo", `100644,${blob},${workflowPath}`], env);
  tree = await git(["write-tree"], env);
  commit = await git(["commit-tree", tree, "-p", parent, "-m", "Build private bounded HEVC single-idle candidate through registered workflow"], env);
  assert.deepEqual((await git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit])).split("\n"), [workflowPath]);
  await git(["update-ref", `refs/heads/${branch}`, commit, "0".repeat(40)]);
  await git(["-c", "gc.auto=0", "push", "origin", `${commit}:refs/heads/${branch}`]);
  assert.equal((await git(["ls-remote", "origin", `refs/heads/${branch}`])).split(/\s/)[0], commit);
  assert.equal(await git(["rev-parse", "HEAD"]), parent); assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal(await git(["ls-remote", "origin", "refs/heads/main"]), main);
  assert.equal(await readFile(path.join(root, workflowPath), "utf8"), source);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const report = { recordedAt: new Date().toISOString(), status: "single-idle-isolated-build-branch-pushed-not-dispatched",
  branch, parent, commit, tree, workflow: { path: workflowPath, canonicalSha256: sha(source), generatedSha256: sha(generated), generatedExactSource: generated, gitBlob: blob },
  changedTrackedFiles: [workflowPath], canonicalHeadIndexAndWorkflowUnchanged: true, mainUnchanged: true,
  remoteVerified: true, noCheckoutOrMediaCopyCreated: true, ownedIndexRuntimeRemoved: true, runtimeDirectory: runtime.directory,
  rationale: "Reuse registered within-mpeg2-aligned-reuse dispatch on isolated branch, changing only its builder command. Default branch need not change; permissions/cleanup unchanged.",
  sourcePins: Object.fromEntries(await Promise.all(["scripts/prepare-single-idle-build-branch.mjs", "scripts/lib/single-idle-build-workflow.mjs"].map(async file => [file, sha(await readFile(path.join(root, file)))]))),
  actualBuildStarted: false, browserConversionsPerformed: 0, originalRead: false, noDocker: true, publicAcceptance: false };
await writeFile(path.join(root, output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, branch, commit, remoteVerified: true, buildStarted: false }));
