// Exact derivative of the qualified browser verifier. Never mutate its sources
// or reuse the old binary's slot addresses. Media acceptance remains separate.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export const MVF_DECODER_SHA256 = "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576";
export const MVF_TOOL_DIRECTORY = "work/mpeg2-mvf-arena-38643550000";
export function makeMvfBrowserComponents(source, root) {
  assert.equal(sha(source), "39247cae67a79e07044c95a15c7652f82ffee3407bb9abf442ee84b6b01e97c0");
  const oldLayout = `assert.deepEqual(proof.layout, { _gm_: { address: 1786760, bytes: 496 }, within_allocator_attempt_words: { address: 1918848, bytes: 64 },
    within_realloc_attempt_words: { address: 1918912, bytes: 64 }, within_refstruct_abort_words: { address: 1918976, bytes: 64 } });`;
  const newLayout = `assert.deepEqual(proof.layout, { _gm_: { address: 1786904, bytes: 496 }, within_allocator_attempt_words: { address: 1918992, bytes: 64 },
    within_realloc_attempt_words: { address: 1919056, bytes: 64 }, within_refstruct_abort_words: { address: 1919120, bytes: 64 } });
  assert.deepEqual(proof.actualMvfArena, build.manifest.mvfArena);
  assert.equal(build.manifest.mvfArena.actualRefstructSha256, "63afbc9523bd362388abe0dbad6202229985bd58f5606882b883e0da80cea202");
  assert.equal(build.manifest.mvfArena.actualHevcSha256, "57206d9004a90785a8209dc6b0ed2418088d99ebd4d19b0b19e5f543404efade");
  assert.equal(build.manifest.mvfArena.actualWasmLifecycle.ownedAllocationsBalanced, true);`;
  const oldReader = 'if (file === "realloc-attempt-abort-capture.mjs") edits.push([previousSha, EBML_DECODER_SHA256]);';
  const newReader = `if (file === "realloc-attempt-abort-capture.mjs") {
      edits.push([previousSha, EBML_DECODER_SHA256]);
      edits.push(["REALLOC_SLOT = 1918912, REALLOC_ALLOCATOR_ROOT = 1786760",
        "REALLOC_SLOT = " + native.proof.layout.within_realloc_attempt_words.address + ", REALLOC_ALLOCATOR_ROOT = " + native.proof.layout._gm_.address]);
    }
    if (file === "realloc-aligned-attempt-snapshot.mjs")
      edits.push(["REALLOC_ALIGNED_SLOT = 1918848", "REALLOC_ALIGNED_SLOT = " + native.proof.layout.within_allocator_attempt_words.address]);
    if (file === "realloc-allocation-abort-capture.mjs")
      edits.push(["REALLOC_POOL_SLOT = 1918976", "REALLOC_POOL_SLOT = " + native.proof.layout.within_refstruct_abort_words.address]);`;
  const edits = [
    ["7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25", MVF_DECODER_SHA256],
    ["work/mpeg2-ebml-reuse-38608791023", MVF_TOOL_DIRECTORY],
    ["evidence/ebml-reuse-native-38608791023.json", "evidence/mvf-arena-native-38643550000.json"],
    ["evidence/mpeg2-ebml-reuse-build-38608791023.json", "evidence/mpeg2-mvf-arena-build-38643550000.json"],
    ["evidence/mpeg2-ebml-reuse-build-branch-2026-10-14.json", "evidence/mpeg2-mvf-arena-build-branch-2026-10-15-smoke-warnings.json"],
    ["assert.equal(proof.sourceCount, 93)", "assert.equal(proof.sourceCount, 99)"],
    ["sourceCount: 93", "sourceCount: 99"],
    ["realloc-attempt|ebml-reuse", "realloc-attempt|ebml-reuse|mvf-arena"],
    [oldLayout, newLayout], [oldReader, newReader],
  ];
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm))
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", match[1])).href)}`)]);
  return exactPatch(source, edits);
}
export async function loadMvfBrowserComponents(root) {
  const recipe = makeMvfBrowserComponents(await readFile(path.join(root, "scripts/lib/ebml-reuse-browser-components.mjs"), "utf8"), root);
  const components = await import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
  return { ...components, recipe };
}
