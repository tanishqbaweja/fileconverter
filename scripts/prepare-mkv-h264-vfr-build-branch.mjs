// Install one isolated workflow through a temporary Git index, never a checkout.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { h264VfrBuildRef } from "../media/ffmpeg/mkv-h264-vfr-candidate.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const gitExe = process.env.WITHIN_GIT_EXECUTABLE ?? "git", workflow = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
const output = "evidence/mkv-h264-vfr-build-branch-2026-11-14.json";
const git = async (args, env = process.env) => (await execute(gitExe, args, { cwd: root, env,
  windowsHide: true, timeout: 30000, maxBuffer: 65536 })).stdout.trim();
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
assert.equal(await git(["status", "--porcelain"]), "", "Commit the scoped candidate source first");
assert.equal(await git(["ls-files", "--", "test.mkv"]), "");
assert.equal(await git(["remote", "get-url", "origin"]), "https://github.com/tanishqbaweja/fileconverter.git");
assert.equal(await git(["ls-remote", "origin", `refs/heads/${h264VfrBuildRef}`]), "", "Never overwrite a remote candidate");
await assert.rejects(git(["show-ref", "--verify", `refs/heads/${h264VfrBuildRef}`]));
const parent = await git(["rev-parse", "HEAD"]), main = await git(["ls-remote", "origin", "refs/heads/main"]);
const original = await readFile(path.join(root, workflow)), replacement = await readFile(path.join(root, "media/ffmpeg/mkv-edit-list-nondocker.yml"));
const runtime = await createOwnedRuntimeScratch("mkv-vfr-git-index-");
let commit, tree;
try {
  const env = { ...runtime.env, GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index") };
  await git(["read-tree", parent], env);
  const blob = spawnSync(gitExe, ["hash-object", "-w", "--stdin"], { cwd: root, env, input: replacement,
    windowsHide: true, encoding: "utf8", timeout: 30000, maxBuffer: 65536 });
  assert.equal(blob.status, 0, blob.stderr);
  await git(["update-index", "--add", "--cacheinfo", `100644,${blob.stdout.trim()},${workflow}`], env);
  tree = await git(["write-tree"], env);
  commit = await git(["commit-tree", tree, "-p", parent, "-m", "Compile isolated bounded H.264 VFR timestamp candidate without Docker"], env);
  assert.deepEqual((await git(["diff", "--name-only", parent, commit])).split("\n"), [workflow]);
  await git(["update-ref", `refs/heads/${h264VfrBuildRef}`, commit, "0".repeat(40)]);
  await git(["push", "origin", `${commit}:refs/heads/${h264VfrBuildRef}`]);
  assert.equal((await git(["ls-remote", "origin", `refs/heads/${h264VfrBuildRef}`])).split(/\s/)[0], commit);
  assert.equal(await git(["rev-parse", "HEAD"]), parent);
  assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal(await git(["ls-remote", "origin", "refs/heads/main"]), main);
  assert.deepEqual(await readFile(path.join(root, workflow)), original);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
await writeFile(path.join(root, output), JSON.stringify({ status: "isolated-h264-vfr-build-branch-pushed-not-dispatched",
  branch: h264VfrBuildRef, parent, commit, tree, changedTrackedFiles: [workflow], workflowSha256: sha(replacement),
  canonicalHeadIndexWorkflowUnchanged: true, mainUnchanged: true, ownedIndexRuntimeRemoved: true,
  remoteVerified: true, mediaInputs: 0, noDocker: true, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, branch: h264VfrBuildRef, commit }));
