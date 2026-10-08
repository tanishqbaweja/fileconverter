import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { makeLateSlotBuildWorkflow, LATE_SLOT_WORKFLOW_BEFORE, LATE_SLOT_WORKFLOW_AFTER } from "../scripts/lib/late-slot-build-workflow.mjs";
const root = new URL("../", import.meta.url);
test("registered workflow shim reverses byte-exactly and changes only private aligned builder", async () => {
  const source = await readFile(new URL(".github/workflows/reproduce-ffmpeg-nondocker.yml", root), "utf8");
  const generated = makeLateSlotBuildWorkflow(source);
  assert.equal(generated.replace(LATE_SLOT_WORKFLOW_AFTER, LATE_SLOT_WORKFLOW_BEFORE), source);
  assert.throws(() => makeLateSlotBuildWorkflow(source + "\n"));
  assert.throws(() => makeLateSlotBuildWorkflow(generated));
  for (const required of ["cancel-in-progress: false", "retention-days: 1", "if: always()", "contents: read"])
    assert.ok(generated.includes(required));
  assert.equal(generated.match(/node media\/ffmpeg\/build-mpeg2-late-refstruct\.mjs/g).length, 1);
});
test("branch preparation cannot change canonical HEAD/index/workflow or publish protected media", async () => {
  const source = await readFile(new URL("scripts/prepare-late-slot-build-branch.mjs", root), "utf8");
  assert.ok(source.includes('GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index")'));
  assert.ok(source.includes('["ls-files", "--", "test.mkv"]'));
  assert.ok(source.includes('[workflowPath]'));
  assert.ok(source.includes('"0".repeat(40)'));
  assert.ok(source.includes('assert.equal(await git(["rev-parse", "HEAD"]), parent)'));
  assert.ok(source.includes('finally { await runtime.close()'));
  assert.doesNotMatch(source, /git\(\["(?:checkout|switch|reset|worktree)"|--force|readFile\([^\n]*test\.mkv/);
});
test("actual isolated build branch retains one changed workflow and removes its own index scratch", async () => {
  const proof = JSON.parse(await readFile(new URL("evidence/mpeg2-late-slot-build-branch-2026-10-08.json", root)));
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const canonical = await readFile(new URL(proof.workflow.path, root), "utf8");
  assert.equal(sha(canonical), proof.workflow.canonicalSha256);
  assert.equal(proof.workflow.generatedExactSource, makeLateSlotBuildWorkflow(canonical));
  assert.equal(sha(proof.workflow.generatedExactSource), proof.workflow.generatedSha256);
  assert.deepEqual(proof.workflow.changedTrackedFiles, [".github/workflows/reproduce-ffmpeg-nondocker.yml"]);
  for (const field of ["remoteVerified", "canonicalHeadAndIndexUnchanged", "canonicalWorkflowUnchanged",
    "mainUnchanged", "noCheckoutOrMediaCopyCreated", "ownedIndexRuntimeRemoved", "noDocker"])
    assert.equal(proof[field], true);
  assert.equal(proof.protectedSourceRead, false); assert.equal(proof.browserConversionsPerformed, 0);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await readFile(new URL(file, root))), hash);
  await assert.rejects(access(proof.runtimeDirectory), { code: "ENOENT" });
});
