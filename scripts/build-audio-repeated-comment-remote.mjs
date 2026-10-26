// Isolated Git index; never checkout/copy media or change the canonical workflow.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readdir, realpath, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAudioRepeatedCommentBuildWorkflow } from "./lib/audio-repeated-comment-build-workflow.mjs";
import { makeAudioOggArtworkBuildWorkflow } from "./lib/audio-ogg-artwork-build-workflow.mjs";
import { makeAudioOggArtworkLowerCopyBuildWorkflow } from "./lib/audio-ogg-artwork-lower-copy-build-workflow.mjs";
import { auditAudioMetadataArtifact, validateAudioMetadataArtifactName } from "./lib/audio-metadata-artifact.mjs";
import { makeMp3InputGainBuildWorkflow } from "./lib/mp3-input-gain-build-workflow.mjs";
import { makeMp3QuantizerSearchBuildWorkflow } from "./lib/mp3-quantizer-search-build-workflow.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), sha = b => createHash("sha256").update(b).digest("hex");
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && ["--ogg-artwork", "--ogg-artwork-lower-copy", "--mp3-input-gain", "--mp3-quantizer-search"].includes(process.argv[3])));
const mp3QuantizerSearch = process.argv[3] === "--mp3-quantizer-search";
const mp3InputGain = process.argv[3] === "--mp3-input-gain" || mp3QuantizerSearch;
const lowerCopy = process.argv[3] === "--ogg-artwork-lower-copy", oggArtwork = lowerCopy || mp3InputGain || process.argv[3] === "--ogg-artwork";
const branch = mp3QuantizerSearch ? "codex/mp3-quantizer-search-20261026-v1" : mp3InputGain ? "codex/mp3-input-gain-20261026-v1" : lowerCopy ? "codex/audio-ogg-artwork-lower-copy-20261025-v1"
  : oggArtwork ? "codex/audio-ogg-artwork-20261025-v1" : "codex/audio-repeated-comments-20261024-v3", repository = "tanishqbaweja/fileconverter";
const workflowPath = ".github/workflows/reproduce-ffmpeg-nondocker.yml", workflowName = "reproduce-ffmpeg-nondocker.yml";
const receiptPath = path.join(root, mp3QuantizerSearch ? "evidence/mp3-quantizer-search-build-2026-10-26-v1.json" : mp3InputGain ? "evidence/mp3-input-gain-build-2026-10-26-v1.json" : lowerCopy ? "evidence/audio-ogg-artwork-lower-copy-build-2026-10-25-v1.json"
  : oggArtwork ? "evidence/audio-ogg-artwork-build-2026-10-25-v1.json" : "evidence/audio-repeated-comment-build-2026-10-24-v3.json");
assert.ok(["prepare", "dispatch", "observe", "collect"].includes(process.argv[2]));
const runtime = await createOwnedRuntimeScratch("audio-repeated-remote-");
try {
  const call = async (binary, args, env = runtime.env) => (await execute(binary, args, { cwd: root, env,
    windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout.trim();
  const git = (args, env) => call("git", args, env), gh = args => call(process.platform === "win32" ? "D:/Program Files/GitHub CLI/gh.exe" : "gh", args);
  const canonical = await readFile(path.join(root, workflowPath), "utf8"), generated = (mp3QuantizerSearch ? makeMp3QuantizerSearchBuildWorkflow : mp3InputGain ? makeMp3InputGainBuildWorkflow : lowerCopy ? makeAudioOggArtworkLowerCopyBuildWorkflow
    : oggArtwork ? makeAudioOggArtworkBuildWorkflow : makeAudioRepeatedCommentBuildWorkflow)(canonical);
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
      priorComparableBuild: lowerCopy || mp3InputGain ? { runId: 40156938341, elapsedSeconds: 310 } : { runId: 39517752087, elapsedSeconds: 497 }, estimatedBuildMinutes: lowerCopy || mp3InputGain ? 6 : 9,
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
    if (process.argv[2] === "collect") {
      assert.equal(receipt.run?.status, "completed"); assert.equal(receipt.run.conclusion, "success");
      const runId = String(receipt.run.databaseId); assert.match(runId, /^[0-9]{8,}$/);
      const detail = JSON.parse(await gh(["run", "view", runId, "--repo", repository, "--json", "headSha,status,conclusion,jobs"]));
      assert.equal(detail.headSha, receipt.commit); assert.equal(detail.jobs.length, 1);
      for (const name of ["Retain private bounded audio metadata candidate", "Remove repository-local build data"])
        assert.equal(detail.jobs[0].steps.find(step => step.name === name)?.conclusion, "success");
      const listing = JSON.parse(await gh(["api", `repos/${repository}/actions/runs/${runId}/artifacts`]));
      assert.equal(listing.total_count, 1); const artifact = listing.artifacts[0];
      assert.equal(artifact.name, "private-audio-metadata-" + runId); assert.equal(artifact.expired, false);
      assert.equal(artifact.workflow_run.head_sha, receipt.commit); assert.equal(String(artifact.workflow_run.id), runId);
      assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 16 * 1048576);
      const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 64 * 1048576);
      const download = path.join(runtime.directory, "tools"), cache = path.join(root, "work", (mp3QuantizerSearch ? "mp3-quantizer-search-" : mp3InputGain ? "mp3-input-gain-" : lowerCopy ? "audio-ogg-artwork-lower-copy-" : oggArtwork ? "audio-ogg-artwork-" : "audio-repeated-metadata-") + runId);
      await assert.rejects(access(cache), { code: "ENOENT" });
      await gh(["run", "download", runId, "--repo", repository, "--name", artifact.name, "--dir", download]);
      const names = await readdir(download); assert.equal(names.length, mp3QuantizerSearch ? 21 : mp3InputGain ? 19 : 16); let total = 0;
      for (const file of names) {
        validateAudioMetadataArtifactName(file); const info = await lstat(path.join(download, file));
        assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 16 * 1048576); total += info.size;
      }
      assert.ok(total <= 24 * 1048576);
      const audit = await auditAudioMetadataArtifact(download); assert.ok(audit.core.upstreamCommentPatch);
      assert.deepEqual(names.toSorted(), ["build-manifest.json", ...Object.keys(audit.artifactPins)].toSorted());
      for (const [file, expected] of Object.entries(audit.buildSourcePins)) {
        const { stdout } = await execute("git", ["show", `${receipt.commit}:${file}`], { cwd: root, env: runtime.env,
          windowsHide: true, encoding: "buffer", timeout: 30000, maxBuffer: 2097152 });
        assert.equal(sha(stdout), expected, "Immutable dispatched source: " + file);
      }
      let identity, complete = false;
      try {
        await mkdir(cache); identity = await lstat(cache, { bigint: true }); assert.equal(await realpath(cache), cache);
        for (const file of names) await copyFile(path.join(download, file), path.join(cache, file), constants.COPYFILE_EXCL);
        const retained = await auditAudioMetadataArtifact(cache); assert.equal(retained.manifestSha256, audit.manifestSha256);
        receipt.collected = { directory: path.relative(root, cache).replaceAll(path.sep, "/"), bytes: total,
          manifestSha256: audit.manifestSha256, buildSourcePins: Object.keys(audit.buildSourcePins).length,
          artifactPins: Object.keys(audit.artifactPins).length, upstream: audit.core.upstreamCommentPatch,
          immutableExecutedSourcesVerified: true, hostedCleanupPassed: true, publicAcceptance: false };
        receipt.status = "compiled-artifact-audited-browser-repair-unverified";
        await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n"); complete = true;
      } finally {
        if (identity && !complete) {
          assert.equal(path.dirname(cache), path.join(root, "work")); const current = await lstat(cache, { bigint: true });
          assert.ok(current.isDirectory() && !current.isSymbolicLink()); assert.equal(await realpath(cache), cache);
          assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino); await rm(cache, { recursive: true });
        }
      }
    }
    console.log(JSON.stringify(receipt));
  }
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
