import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makePacketCacheWorkflow, makePacketCacheBranchCaller, makePacketCacheCollector } from "./mpeg2-packet-cache-build-recipe.mjs";
function transform(prior, edits) {
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior); return { generated, generatedSha256: sha(generated), edits };
}
export function makePacketCacheStrictWorkflow(source) {
  return transform(makePacketCacheWorkflow(source), [["node media/ffmpeg/build-mpeg2-packet-cache.mjs", "node media/ffmpeg/build-mpeg2-packet-cache-strict.mjs"]]).generated;
}
export { makePacketCacheStrictWorkflow as makeAlignment16Workflow };
export function makePacketCacheStrictBranchCaller(source, root) {
  return transform(makePacketCacheBranchCaller(source, root).generated, [
    ["codex/mpeg2-packet-cache-20261012", "codex/mpeg2-packet-cache-20261012-warning-fix"],
    ["evidence/mpeg2-packet-cache-build-branch-2026-10-12", "evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix"],
    ["packet-cache-git-index-", "packet-cache-strict-git-index-"],
    ['["scripts/prepare-mpeg2-packet-cache-build-branch.mjs", "scripts/lib/mpeg2-packet-cache-build-recipe.mjs",',
      '["scripts/prepare-mpeg2-packet-cache-strict-build-branch.mjs", "scripts/lib/mpeg2-packet-cache-strict-build-recipe.mjs", "scripts/prepare-mpeg2-packet-cache-build-branch.mjs", "scripts/lib/mpeg2-packet-cache-build-recipe.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/mpeg2-packet-cache-build-recipe.mjs")).href, pathToFileURL(path.join(root, "scripts/lib/mpeg2-packet-cache-strict-build-recipe.mjs")).href],
  ]);
}
export function makePacketCacheStrictCollector(source, root) {
  return transform(makePacketCacheCollector(source, root).generated, [["evidence/mpeg2-packet-cache-build-branch-2026-10-12.json", "evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix.json"]]);
}
