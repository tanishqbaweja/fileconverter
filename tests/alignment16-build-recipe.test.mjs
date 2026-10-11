import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { makeAlignment16Workflow, makeAlignment16Collector } from "../scripts/lib/alignment16-build-recipe.mjs";
import { makeAllocationAttemptWorkflow } from "../scripts/lib/allocation-attempt-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("private registered no-Docker workflow changes only actual builder; original file never mutated", async () => {
  const source = await readFile(path.join(root, ".github/workflows/reproduce-ffmpeg-nondocker.yml"), "utf8"), generated = makeAlignment16Workflow(source);
  assert.equal(generated.replace("node media/ffmpeg/build-mpeg2-alignment16.mjs", "node media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), makeAllocationAttemptWorkflow(source));
  assert.throws(() => makeAlignment16Workflow(source + "\n"));
});
test("collector retains exact source, actual 13-case contracts, fixed heap/encoder gates, owned cleanup and no acceptance", async () => {
  const source = await readFile(path.join(root, "scripts/collect-mpeg2-single-idle-build.mjs"), "utf8"), recipe = makeAlignment16Collector(source, root);
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.ok(reversed.includes("assert.equal(manifest.allocationAttempt[key], false)"));
  for (const token of ["alignment.passed, 13", "maximumPages: 512", "8b2fd64d", "COPYFILE_EXCL", "await runtime.close()", "allocatorPolicyChanged, true"])
    assert.ok(recipe.generated.includes(token), token);
  assert.throws(() => makeAlignment16Collector(source + "\n", root));
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
});
