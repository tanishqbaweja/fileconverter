// Exact old bounded collector, new actual first-malloc identity/body selection.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export function makeAlignment16StaticCollector(source, root) {
  assert.equal(sha(source), "a421052465d21760867f43337d92b80c0849f032b5ad86d7635ecce0f7075d61");
  const edits = [];
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm))
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`), 1]);
  edits.push(
    ['root = path.resolve(import.meta.dirname, "..")', `root = ${JSON.stringify(path.resolve(root))}`, 1],
    ["2026-10-11T14-01-14-330Z-allocation-attempt-original-full-terminal-analysis", "2026-10-11T18-50-12-867Z-alignment16-original-full-terminal-analysis", 1],
    ["upstream-alignment-pending", "fast-malloc-pending", 1],
    ["work/mpeg2-allocation-attempt-38138821153", "work/mpeg2-alignment16-38161556498", 1],
    ["9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039", "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014", 1],
    ['new Set(["__wrap_posix_memalign", "emscripten_builtin_malloc"])', 'new Set(["__wrap_posix_memalign", "emscripten_builtin_malloc", "avcodec_default_get_buffer2", "alloc_frame"])', 1],
    ["[4436, 4471]", "[709, 2061, 4436, 4471]", 1],
    ["attempt-alignment-static-", "alignment16-malloc-static-", 1],
    ["606e5c", "606d5f", 2],
    ["-attempt-alignment-selected-functions", "-alignment16-malloc-selected-functions", 1],
    ["actual-upstream-fatal-malloc-callsite-retained-not-fix", "actual-first-malloc-callsite-retained-not-fix", 1],
    ["-attempt-alignment-static.json", "-alignment16-malloc-static.json", 1],
  );
  let generated = source;
  for (const [before, after, count] of edits) { assert.equal(generated.split(before).length - 1, count, before); generated = generated.replaceAll(before, after); }
  let reverse = generated;
  for (const [before, after, count] of edits.toReversed()) { assert.equal(reverse.split(after).length - 1, count, after); reverse = reverse.replaceAll(after, before); }
  assert.equal(reverse, source, "No collector/tool/archive/privacy/cleanup bounds changed");
  return { generated, generatedSha256: sha(generated), previousSourceSha256: sha(source), edits,
    instantiated: false, originalVideoRead: false, mediaConversions: 0, runtimeFixProven: false };
}
