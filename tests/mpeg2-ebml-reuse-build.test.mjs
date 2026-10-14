import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeAlignment16Workflow, makeEbmlReuseBranchCaller, makeEbmlReuseCollector } from "../scripts/lib/mpeg2-ebml-reuse-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}
test("workflow/isolated-index branch selects only EBML candidate without changing canonical workflow or protected media", async () => {
  const workflow = makeAlignment16Workflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.ok(workflow.includes("node media/ffmpeg/build-mpeg2-ebml-reuse.mjs"));
  assert.ok(workflow.includes("within-mpeg2-aligned-reuse"));
  const recipe = makeEbmlReuseBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root);
  syntax(recipe.generated);
  for (const token of ["codex/mpeg2-ebml-reuse-20261014", "mpeg2-ebml-reuse-build-branch-2026-10-14", "GIT_INDEX_FILE",
    "ls-files", "test.mkv", "windowsHide: true", "runtime.close()", "mainUnchanged: true"])
    assert.ok(recipe.generated.includes(token));
});
test("collector retains all real native parent controls and adds honest changed-policy/lifecycle gates", async () => {
  const recipe = makeEbmlReuseCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root);
  syntax(recipe.generated);
  for (const token of ["work/mpeg2-ebml-reuse-${runId}", "manifest.ebmlReuse", "smoke.reuseIterations, 200000",
    "smoke.candidatePayloadAllocationCalls, 1", "ebml.allocatorPolicyChanged, true", "actualWasmLibavutil.passed, 6",
    "fullOriginalCompleted", "completeChromiumMemoryAcceptance", "publicAcceptance"])
    assert.ok(recipe.generated.includes(token), token);
});
