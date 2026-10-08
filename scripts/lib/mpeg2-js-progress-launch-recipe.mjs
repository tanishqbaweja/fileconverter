// Preserve actual failed launcher bytes; only schema-safe path/preflight binding.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export function makeBoundJsProgressLauncher(source, root) {
  assert.equal(createHash("sha256").update(source).digest("hex"),
    "6596fb04dc7f7bc2dc90c288688f25723a0344c5b7bd2a81c240614572d78386");
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
    ['`${stamp}-js-progress-post-cancel-blink.json.gz`', '`${stamp}-js-progress-partial-blink-trace.json.gz`'],
    ['  "scripts/mpeg2-js-progress-original.mjs", "scripts/lib/mpeg2-js-progress-recipe.mjs",',
      '  "scripts/mpeg2-js-progress-original-bound.mjs", "scripts/lib/mpeg2-js-progress-launch-recipe.mjs", "tests/mpeg2-js-progress-launch.test.mjs", "scripts/mpeg2-js-progress-original.mjs", "scripts/lib/mpeg2-js-progress-recipe.mjs",'],
    ['  const generated = make("file:///owned/trace-helper.mjs"); check(generated);',
      `  const generated = make("file:///owned/trace-helper.mjs"); check(generated);
  const preparedHelper = makePartialBlinkAttribution(await read("scripts/lib/bounded-renderer-attribution.mjs"), root,
    path.join(root,"outputs/reports",\`\${stamp}-js-progress-partial-blink-trace.json.gz\`));
  check(preparedHelper);`],
  ];
  let result = source;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only output schema/provenance/helper preflight changed; all codec/source/host/memory/quality/cleanup gates intact");
  return result;
}
