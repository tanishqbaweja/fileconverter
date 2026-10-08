import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
