import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("repair dispatch explicitly selects the private switch rather than workflow default all", async () => {
  const source = await readFile(new URL("../scripts/dispatch-scaled-properties-build.mjs", import.meta.url), "utf8");
  assert.match(source, /"-f", "core=within-mpeg2-aligned-reuse"/);
  assert.match(source, /assert.equal\(remote.object.sha, branch.commit\)/);
  assert.match(source, /qualifiedRepairedCore: false/); assert.match(source, /windowsHide: true/);
  assert.match(source, /await runtime.close\(\)/); assert.doesNotMatch(source, /core=all/);
});
