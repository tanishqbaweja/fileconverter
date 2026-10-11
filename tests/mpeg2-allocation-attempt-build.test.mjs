import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeAllocationAttemptWorkflow, makeAllocationAttemptCollector } from "../scripts/lib/allocation-attempt-build-recipe.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("registered isolated workflow changes only builder command, preserves permissions/upload bounds/finally cleanup", async () => {
  const source = await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"), generated = makeAllocationAttemptWorkflow(source);
  assert.equal(generated.replace("node media/ffmpeg/build-mpeg2-allocation-attempt.mjs", "node media/ffmpeg/build-mpeg2-aligned-reuse.mjs"), source);
  assert.throws(() => makeAllocationAttemptWorkflow(source + "\n"));
  for (const token of ["contents: read", "retention-days: 1", "if: always()", "cancel-in-progress: false"]) assert.ok(generated.includes(token), token);
  assert.doesNotMatch(generated, /docker run|setup-docker|container:/);
});
test("collector keeps all original run/artifact/code/source/lifecycle/cleanup gates and adds the actual64-byte slot contract", async () => {
  const source = await read("scripts/collect-mpeg2-single-idle-build.mjs"), recipe = makeAllocationAttemptCollector(source, root);
  let reversed = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); assert.equal(sha(recipe.generated), recipe.generatedSha256);
  assert.throws(() => makeAllocationAttemptCollector(source + "\n", root));
  for (const token of ['assert.equal(run.headSha, branch.commit)', 'assert.equal(run.conclusion, "success")',
    'constants.COPYFILE_EXCL', 'current.ino, identity.ino', 'assert.equal(smoke.sequentialFreshAllocations, 1)',
    'assert.equal(attempt.passed, 9)', 'assert.equal(manifest.allocationAttempt.slotBytes, 64)',
    'within_bind_allocator_attempt_slot', 'initialPages: 512, maximumPages: 512, shared: true']) assert.ok(recipe.generated.includes(token), token);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"],
    { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
});
test("preparer never overwrites a branch or changes current/main tree; invalid collector IDs fail before storage/network", async () => {
  const source = await read("scripts/prepare-allocation-attempt-build-branch.mjs");
  for (const token of ["GIT_INDEX_FILE", 'await git(["read-tree", parent]', 'commit-tree',
    'assert.equal(await git(["ls-files", "--", "test.mkv"]), ""', 'refs/heads/main', '"0".repeat(40)',
    'assert.equal(await git(["status", "--porcelain"]), ""', 'windowsHide: true']) assert.ok(source.includes(token), token);
  for (const invalid of ["../test.mkv", "bad-job"]) {
    const child = spawnSync(process.execPath, ["scripts/collect-mpeg2-allocation-attempt-build.mjs", invalid],
      { cwd: root, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(child.status, 1); assert.match(child.stderr, /AssertionError/);
  }
});
test("native synthetic control preserves exact13 sources/preimages and cannot stand in for real Wasm/browser/video acceptance", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-11T11-58-21-033Z-allocation-attempt-native-control.json"));
  assert.equal(proof.status, "passed-synthetic-native-dispatch-not-wasm-or-media");
  assert.equal(proof.failure, null); assert.equal(proof.smoke.passed, 9); assert.equal(proof.smoke.slotBytes, 64);
  assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.protectedSourceRead, false);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.originalFailureCauseProven, false);
  assert.equal(proof.scratchRemoved, true); await assert.rejects(access(proof.ownedRuntime), { code: "ENOENT" });
  assert.equal(Object.keys(proof.sourcePins).length, 13); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(proof.preimages[file], "base64")), hash, file);
  }
  assert.equal(sha(proof.generatedRecipe), proof.generatedRecipeSha256);
});
