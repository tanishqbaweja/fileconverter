// Git plumbing only: no copied checkout/media, canonical index or HEAD changes.
// All source additions must already be committed before running this script.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeLateSlotBuildWorkflow } from "./lib/late-slot-build-workflow.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const branch = "codex/mpeg2-late-slot-20261008", workflowPath = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
const proofPath = path.join(root, "evidence/mpeg2-late-slot-build-branch-2026-10-08.json");
await assert.rejects(access(proofPath), { code: "ENOENT" });
const git = async (args, env = process.env) => (await execute("git", args, { cwd: root, env, windowsHide: true,
  timeout: 30000, maxBuffer: 65536 })).stdout.trim();
assert.equal(await git(["status", "--porcelain"]), "", "Commit scoped work before preparing isolated build tree");
assert.equal(await git(["ls-files", "--", "test.mkv"]), "", "Never copy/publish protected user fixture");
assert.equal(await git(["remote", "get-url", "origin"]), "https://github.com/tanishqbaweja/fileconverter.git");
await assert.rejects(git(["show-ref", "--verify", `refs/heads/${branch}`]));
assert.equal(await git(["ls-remote", "origin", `refs/heads/${branch}`]), "", "Never overwrite a remote branch");
const parent = await git(["rev-parse", "HEAD"]), mainBefore = await git(["ls-remote", "origin", "refs/heads/main"]);
const source = await readFile(path.join(root, workflowPath), "utf8"), generated = makeLateSlotBuildWorkflow(source);
const runtime = await createOwnedRuntimeScratch("late-slot-git-index-");
let tree, commit, blob, remoteVerified = false;
try {
  const env = { ...runtime.env, GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index") };
  await git(["read-tree", parent], env);
  blob = await new Promise((resolve, reject) => {
    const child = spawn("git", ["hash-object", "-w", "--stdin"], { cwd: root, env, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > 65536) child.kill(); });
    child.stderr.on("data", chunk => { stderr += chunk; if (stderr.length > 65536) child.kill(); });
    const timer = setTimeout(() => child.kill(), 30000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr));
    });
    child.stdin.end(generated);
  });
  assert.match(blob, /^[a-f0-9]{40}$/);
  await git(["update-index", "--add", "--cacheinfo", `100644,${blob},${workflowPath}`], env);
  tree = await git(["write-tree"], env);
  commit = await git(["commit-tree", tree, "-p", parent, "-m", "Run private late-request diagnostic through registered no-Docker workflow"], env);
  assert.deepEqual((await git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit])).split("\n"), [workflowPath]);
  await git(["update-ref", `refs/heads/${branch}`, commit, "0".repeat(40)]);
  await git(["push", "origin", `${commit}:refs/heads/${branch}`]);
  assert.equal((await git(["ls-remote", "origin", `refs/heads/${branch}`])).split(/\s/)[0], commit);
  remoteVerified = true;
  assert.equal(await git(["rev-parse", "HEAD"]), parent);
  assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal(await git(["ls-remote", "origin", "refs/heads/main"]), mainBefore);
  assert.equal(await readFile(path.join(root, workflowPath), "utf8"), source);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const sourcePath = "scripts/prepare-late-slot-build-branch.mjs";
const report = { recordedAt: new Date().toISOString(), status: "isolated-registered-workflow-build-branch-pushed-and-verified-not-dispatched",
  branch, commit, tree, parent, workflow: { path: workflowPath, canonicalSha256: sha(source),
    generatedSha256: sha(generated), generatedExactSource: generated, gitBlob: blob, changedTrackedFiles: [workflowPath] },
  remoteVerified, canonicalHeadAndIndexUnchanged: true, canonicalWorkflowUnchanged: true, mainUnchanged: true,
  noCheckoutOrMediaCopyCreated: true, ownedIndexRuntimeRemoved: true, runtimeDirectory: runtime.directory,
  rationale: "GitHub dispatch requires a workflow registered on default. Use existing registered core=within-mpeg2-aligned-reuse on this source-only isolated branch; its one builder command targets the new diagnostic, with original permissions/retention/cleanup unchanged.",
  sourcePins: { [sourcePath]: sha(await readFile(path.join(root, sourcePath))),
    "scripts/lib/late-slot-build-workflow.mjs": sha(await readFile(path.join(root, "scripts/lib/late-slot-build-workflow.mjs"))) },
  browserConversionsPerformed: 0, protectedSourceRead: false, noDocker: true, actualBuildStarted: false, publicAcceptance: false };
const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 32768);
await writeFile(proofPath, json, { flag: "wx" });
console.log(JSON.stringify({ branch, commit, remoteVerified, cleanup: true, buildStarted: false }));
