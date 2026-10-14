import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { makeAlignment16Workflow, makeReallocBranchCaller, makeReallocCollector } from "../scripts/lib/mpeg2-realloc-build-recipe.mjs";
import { makeLargestIdleWorkflow, makeLargestIdleBranchCaller, makeLargestIdleCollector } from "../scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function reverse(recipe) { let value = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) value = value.replace(after, before); return value; }
function syntax(text) { const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: text, encoding: "utf8", windowsHide: true, timeout: 5000 }); assert.equal(r.status, 0, r.stderr); }
test("isolated workflow changes only selected private core builder; branch retains canonical/media/main/index protection", async () => {
  const workflow = await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"), changed = makeAlignment16Workflow(workflow);
  assert.equal(changed.replace("node media/ffmpeg/build-mpeg2-realloc-attempt.mjs", "node media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), makeLargestIdleWorkflow(workflow));
  const source = await read("scripts/prepare-alignment16-build-branch.mjs"), next = makeReallocBranchCaller(source, root);
  assert.equal(reverse(next), makeLargestIdleBranchCaller(source, root).generated); syntax(next.generated);
  for (const token of ["codex/mpeg2-realloc-attempt-20261014", "mainUnchanged: true", "canonicalHeadIndexAndWorkflowUnchanged: true",
    "noCheckoutOrMediaCopyCreated: true", "git([\"ls-files\", \"--\", \"test.mkv\"])", "runtime.close()", "windowsHide: true"])
    assert.ok(next.generated.includes(token), token);
});
test("collector retains old artifact/heap/source/encoder/lifetime gates and requires actual realloc constructor/alias controls", async () => {
  const source = await read("scripts/collect-mpeg2-single-idle-build.mjs"), next = makeReallocCollector(source, root);
  assert.equal(reverse(next), makeLargestIdleCollector(source, root).generated); syntax(next.generated);
  for (const token of ["work/mpeg2-realloc-attempt-${runId}", "realloc.slotBytes, 64", "realloc.actualWasmLibavutil.passed, 6",
    "realloc.actualWasmLibavutil.constructorBindingVerified, true", "realloc.actualWasmLibavutil.aliasContentPreserved, true", "heapLimitsChanged",
    "browserFailurePathQualified", "fullOriginalCompleted", "runtime.close()", "initialPages: 512, maximumPages: 512"])
    assert.ok(next.generated.includes(token), token);
});
