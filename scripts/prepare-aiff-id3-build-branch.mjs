// Isolated Git index/tree only. No checkout, media copy, canonical workflow/index/HEAD changes.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAiffId3BuildWorkflow } from "./lib/aiff-id3-build-workflow.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const branch = "codex/aiff-id3-specialist-20261010", workflowPath = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
assert.ok(process.argv.length === 2 || process.argv.length === 3);
const previousBranchCommit = process.argv[2] ?? null;
if (previousBranchCommit) assert.equal(previousBranchCommit, "4cb9284053124b38c434a3f50822bc1ddd908a1c", "Only the attested failed build branch may be advanced");
const proofPath = previousBranchCommit ? "evidence/aiff-id3-specialist-build-branch-v2-2026-10-10.json" : "evidence/aiff-id3-specialist-build-branch-2026-10-10.json";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
await assert.rejects(access(path.join(root, proofPath)), { code: "ENOENT" });
const git = async (args, env = process.env) => (await execute("git", args, { cwd: root,
  env: { ...env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" }, windowsHide: true,
  timeout: 30000, maxBuffer: 65536 })).stdout.trim();
assert.equal(await git(["status", "--porcelain"]), "", "Commit scoped source work first");
assert.equal(await git(["ls-files", "--", "test.mkv"]), "", "Never publish the protected fixture");
assert.equal(await git(["remote", "get-url", "origin"]), "https://github.com/tanishqbaweja/fileconverter.git");
if (previousBranchCommit) {
  assert.equal(await git(["rev-parse", `refs/heads/${branch}`]), previousBranchCommit);
  assert.equal((await git(["ls-remote", "origin", `refs/heads/${branch}`])).split(/\s/)[0], previousBranchCommit);
} else {
  await assert.rejects(git(["show-ref", "--verify", `refs/heads/${branch}`]));
  assert.equal(await git(["ls-remote", "origin", `refs/heads/${branch}`]), "", "Never overwrite remote branch");
}
const parent = await git(["rev-parse", "HEAD"]), main = await git(["ls-remote", "origin", "refs/heads/main"]);
const source = await readFile(path.join(root, workflowPath), "utf8"), generated = makeAiffId3BuildWorkflow(source);
const runtime = await createOwnedRuntimeScratch("aiff-id3-git-index-");
let tree, commit, blob;
try {
  const env = { ...runtime.env, GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index") };
  await git(["read-tree", parent], env);
  const result = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, env, windowsHide: true,
    input: generated, encoding: "utf8", timeout: 30000, maxBuffer: 65536 });
  assert.equal(result.status, 0, result.stderr); blob = result.stdout.trim(); assert.match(blob, /^[a-f0-9]{40}$/);
  await git(["update-index", "--add", "--cacheinfo", `100644,${blob},${workflowPath}`], env);
  tree = await git(["write-tree"], env);
  commit = await git(["commit-tree", tree, "-p", parent, ...(previousBranchCommit ? ["-p", previousBranchCommit] : []),
    "-m", "Compile private metadata-only AIFF ID3 specialist without Docker"], env);
  assert.deepEqual((await git(["diff", "--name-only", parent, commit])).split("\n"), [workflowPath]);
  await git(["update-ref", `refs/heads/${branch}`, commit, previousBranchCommit ?? "0".repeat(40)]);
  await git(["-c", "gc.auto=0", "push", "origin", `${commit}:refs/heads/${branch}`]);
  assert.equal((await git(["ls-remote", "origin", `refs/heads/${branch}`])).split(/\s/)[0], commit);
  assert.equal(await git(["rev-parse", "HEAD"]), parent); assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal(await git(["ls-remote", "origin", "refs/heads/main"]), main);
  assert.equal(await readFile(path.join(root, workflowPath), "utf8"), source);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const files = ["scripts/prepare-aiff-id3-build-branch.mjs", "scripts/lib/aiff-id3-build-workflow.mjs", "media/ffmpeg/build-aiff-id3-specialist.mjs",
  "media/ffmpeg/aiff-id3-build-recipe.mjs", "media/ffmpeg/aiff-id3-build-manifest.mjs", "media/ffmpeg/aiff-id3-specialist-source.mjs", "media/ffmpeg/make-aiff-id3-specialist.mjs", "tests/aiff-id3-build-recipe.test.mjs"];
const report = { recordedAt: new Date().toISOString(), status: "isolated-aiff-id3-build-branch-pushed-not-dispatched",
  branch, parent, previousBranchCommit, commit, tree, workflow: { path: workflowPath, canonicalSha256: sha(source), generatedSha256: sha(generated),
    generatedExactSource: generated, gitBlob: blob }, changedTrackedFiles: [workflowPath],
  canonicalHeadIndexAndWorkflowUnchanged: true, mainUnchanged: true, remoteVerified: true,
  noCheckoutOrMediaCopyCreated: true, ownedIndexRuntimeRemoved: true, runtimeDirectory: runtime.directory,
  rationale: "Existing registered within-aiff dispatch on an isolated branch compiles the private changed-source candidate, not the published binary. SDK/security/always cleanup and default all-core reproduction stay unchanged.",
  sourcePins: Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(path.join(root, file)))]))),
  actualBuildStarted: false, browserConversionsPerformed: 0, protectedSourceRead: false, noDocker: true, publicAcceptance: false };
await writeFile(path.join(root, proofPath), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, branch, commit, remoteVerified: true, actualBuildStarted: false }));
