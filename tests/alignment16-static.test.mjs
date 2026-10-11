import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeAlignment16StaticCollector } from "../scripts/lib/alignment16-static-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("actual first-malloc static collector reverses exact previous bounded collector and parses without launching it", async () => {
  const source = await readFile(path.join(root, "scripts/audit-attempt-alignment-callsite.mjs"), "utf8"), recipe = makeAlignment16StaticCollector(source, root);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, windowsHide: true, timeout: 5000, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  for (const token of ["fast-malloc-pending", "606d5f", "[709, 2061, 4436, 4471]", "slice.instantiated, false", "8388608", "2097152", "await runtime.close()", "originalVideoRead: false"])
    assert.ok(recipe.generated.includes(token), token);
  for (const [before] of recipe.edits) for (const gate of ["67108864", "--ignore-scripts", "maxBuffer", "Buffer.byteLength(wat)", "gunzipSync"]) assert.ok(!before.includes(gate));
  assert.equal(recipe.mediaConversions, 0); assert.equal(recipe.instantiated, false);
  assert.throws(() => makeAlignment16StaticCollector(source + " ", root));
});
