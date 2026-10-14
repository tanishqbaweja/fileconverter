import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeReallocBranchCaller, makeReallocCollector } from "../scripts/lib/mpeg2-realloc-recursive-build-recipe.mjs";
import { makeReallocBranchCaller as parentBranch, makeReallocCollector as parentCollector } from "../scripts/lib/mpeg2-realloc-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function reverse(recipe) { let text = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) text = text.replace(after, before); return text; }
function syntax(text) { const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: text, encoding: "utf8", windowsHide: true, timeout: 5000 }); assert.equal(result.status, 0, result.stderr); }
test("fresh corrected branch reverses to original namespace with all canonical/media/remote/main/owned protections", async () => {
  const source = await read("scripts/prepare-alignment16-build-branch.mjs"), recipe = makeReallocBranchCaller(source, root);
  assert.equal(reverse(recipe), parentBranch(source, root).generated); syntax(recipe.generated);
  for (const token of ["codex/mpeg2-realloc-attempt-20261014-recursion-fix", "canonicalHeadIndexAndWorkflowUnchanged: true", "mainUnchanged: true", "noCheckoutOrMediaCopyCreated: true", "windowsHide: true", "runtime.close()"])
    assert.ok(recipe.generated.includes(token), token);
  for (const file of ["scripts/prepare-mpeg2-realloc-recursive-build-branch.mjs", "scripts/lib/mpeg2-realloc-recursive-build-recipe.mjs"]) assert.ok(recipe.generated.includes(file), file);
});
test("collector differs only by exact corrected branch receipt and still requires ten dispatch/six actual alias/constructor gates", async () => {
  const source = await read("scripts/collect-mpeg2-single-idle-build.mjs"), recipe = makeReallocCollector(source, root);
  assert.equal(reverse(recipe), parentCollector(source, root).generated); syntax(recipe.generated);
  for (const token of ["2026-10-14-recursion-fix.json", "realloc.actualWasmSyntheticDispatch.passed, 10", "outerMetadataPreservedAcrossRecursion, true", "realloc.actualWasmLibavutil.passed, 6", "aliasContentPreserved, true", "constructorBindingVerified, true", "heapLimitsChanged", "publicAcceptance"])
    assert.ok(recipe.generated.includes(token), token);
});
