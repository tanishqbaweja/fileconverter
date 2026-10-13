import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeLargestIdleWorkflow, makeLargestIdleBranchCaller } from "../scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("actual isolated build commit preserves canonical workflow/HEAD/index/main and qualifies exact changed builder", async () => {
  const branch = JSON.parse(await read("evidence/mpeg2-packet-largest-idle-build-branch-2026-10-13.json"));
  assert.equal(branch.branch, "codex/mpeg2-packet-largest-idle-20261013");
  assert.equal(branch.commit, "2748d632c14dc08624c858a77b4a4acaf21f43c1");
  const workflow = (await read(branch.workflow.path)).toString();
  assert.equal(sha(workflow), branch.workflow.canonicalSha256);
  assert.equal(makeLargestIdleWorkflow(workflow), branch.workflow.generatedExactSource);
  assert.equal(sha(branch.workflow.generatedExactSource), branch.workflow.generatedSha256);
  assert.deepEqual(branch.changedTrackedFiles, [branch.workflow.path]);
  for (const key of ["canonicalHeadIndexAndWorkflowUnchanged", "mainUnchanged", "remoteVerified", "noCheckoutOrMediaCopyCreated", "ownedIndexRuntimeRemoved", "noDocker"]) assert.equal(branch[key], true);
  assert.equal(branch.actualBuildStarted, false); assert.equal(branch.publicAcceptance, false);
  await assert.rejects(access(branch.runtimeDirectory), { code: "ENOENT" });
  for (const [file, hash] of Object.entries(branch.sourcePins)) assert.equal(sha(await read(file)), hash, file);
});
test("executed branch wrapper current/pre/post/preimage joins, preserves historical not-dispatched status and owned finally", async () => {
  const receipt = JSON.parse(await read("evidence/packet-largest-idle-branch-executed-sources-2026-10-13.json"));
  assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(receipt.sourcePreimages[file], "base64")), hash, file);
  }
  assert.deepEqual(makeLargestIdleBranchCaller((await read("scripts/prepare-alignment16-build-branch.mjs")).toString(), root), receipt.recipe);
  assert.equal(receipt.ownedWrapperAbsent, true); assert.equal(receipt.actualBuildStarted, false);
  assert.equal(receipt.originalVideoRead, false); assert.equal(receipt.browserConversions, 0); assert.equal(receipt.publicAcceptance, false);
});
