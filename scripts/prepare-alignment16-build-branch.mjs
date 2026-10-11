// Isolated index/tree; no checkout copies, protected media or canonical mutation.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAlignment16Workflow } from "./lib/alignment16-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
assert.equal(process.argv.length, 2);
const branch = "codex/mpeg2-alignment16-20261011", workflowPath = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
const output = "evidence/mpeg2-alignment16-build-branch-2026-10-11.json";
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const git = async (args, env = process.env) => (await execute("git", args, { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 65536 })).stdout.trim();
assert.equal(await git(["status", "--porcelain"]), "", "Commit scoped work first");
assert.equal(await git(["ls-files", "--", "test.mkv"]), "");
assert.equal(await git(["remote", "get-url", "origin"]), "https://github.com/tanishqbaweja/fileconverter.git");
await assert.rejects(git(["show-ref", "--verify", `refs/heads/${branch}`]));
assert.equal(await git(["ls-remote", "origin", `refs/heads/${branch}`]), "");
const parent = await git(["rev-parse", "HEAD"]), main = await git(["ls-remote", "origin", "refs/heads/main"]);
const source = await readFile(path.join(root, workflowPath), "utf8"), generated = makeAlignment16Workflow(source);
const runtime = await createOwnedRuntimeScratch("alignment16-git-index-"); let tree, commit, blob;
try {
  const env = { ...runtime.env, GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index") };
  await git(["read-tree", parent], env);
  const hashed = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, env, windowsHide: true, input: generated, encoding: "utf8", timeout: 30000, maxBuffer: 65536 });
  assert.equal(hashed.status, 0, hashed.stderr); blob = hashed.stdout.trim(); assert.match(blob, /^[a-f0-9]{40}$/);
  await git(["update-index", "--add", "--cacheinfo", `100644,${blob},${workflowPath}`], env);
  tree = await git(["write-tree"], env);
  commit = await git(["commit-tree", tree, "-p", parent, "-m", "Build decoder-only alignment16 candidate with unchanged fixed heaps and encoder"], env);
  assert.deepEqual((await git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit])).split("\n"), [workflowPath]);
  await git(["update-ref", `refs/heads/${branch}`, commit, "0".repeat(40)]);
  await git(["-c", "gc.auto=0", "push", "origin", `${commit}:refs/heads/${branch}`]);
  assert.equal((await git(["ls-remote", "origin", `refs/heads/${branch}`])).split(/\s/)[0], commit);
  assert.equal(await git(["rev-parse", "HEAD"]), parent); assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal(await git(["ls-remote", "origin", "refs/heads/main"]), main);
  assert.equal(await readFile(path.join(root, workflowPath), "utf8"), source);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const sourcePins = Object.fromEntries(await Promise.all(["scripts/prepare-alignment16-build-branch.mjs", "scripts/lib/alignment16-build-recipe.mjs"].map(async file => [file, sha(await readFile(path.join(root, file)))])));
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), status: "alignment16-private-build-branch-pushed-not-dispatched", branch, parent, commit, tree,
  workflow: { path: workflowPath, canonicalSha256: sha(source), generatedSha256: sha(generated), generatedExactSource: generated, gitBlob: blob },
  changedTrackedFiles: [workflowPath], canonicalHeadIndexAndWorkflowUnchanged: true, mainUnchanged: true, remoteVerified: true,
  noCheckoutOrMediaCopyCreated: true, ownedIndexRuntimeRemoved: true, sourcePins, runtimeDirectory: runtime.directory,
  actualBuildStarted: false, browserConversionsPerformed: 0, originalRead: false, noDocker: true, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, branch, commit, remoteVerified: true }));
