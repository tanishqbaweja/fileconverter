// Fresh exact-head namespace only. Keep original build/failure receipts intact.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeReallocBranchCaller as parentBranch, makeReallocCollector as parentCollector } from "./mpeg2-realloc-build-recipe.mjs";
export { makeAlignment16Workflow } from "./mpeg2-realloc-build-recipe.mjs";
function edit(parent, edits) {
  let generated = parent.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, parent.generated);
  return { generated, generatedSha256: sha(generated), edits, parentGeneratedSha256: sha(parent.generated), publicAcceptance: false };
}
export function makeReallocBranchCaller(source, root) {
  return edit(parentBranch(source, root), [
    ["codex/mpeg2-realloc-attempt-20261014", "codex/mpeg2-realloc-attempt-20261014-recursion-fix"],
    ["evidence/mpeg2-realloc-attempt-build-branch-2026-10-14", "evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix"],
    ["realloc-attempt-git-index-", "realloc-recursive-git-index-"],
    ['["scripts/prepare-mpeg2-realloc-build-branch.mjs",', '["scripts/prepare-mpeg2-realloc-recursive-build-branch.mjs", "scripts/lib/mpeg2-realloc-recursive-build-recipe.mjs", "scripts/prepare-mpeg2-realloc-build-branch.mjs",'],
  ]);
}
export function makeReallocCollector(source, root) {
  return edit(parentCollector(source, root), [["evidence/mpeg2-realloc-attempt-build-branch-2026-10-14.json",
    "evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json"]]);
}
