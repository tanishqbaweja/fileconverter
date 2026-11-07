import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const historicalRoot = "file:///H:/Github%20Repositories/fileconverter/";
const originalImports = ["vp9-original-startup", "mpeg2-original-gate"];
const imports = {
  http: [...originalImports, "vp9-allocation-failure"],
  allocation: [...originalImports, "small-vp9-fidelity", "small-matroska-stored-timing", "vp9-recovery-qualification", "platform-vp9-terminal"],
};

// Syntax-only ancestry verification can compare a new checkout to the old
// checkout. Execution must still match the historical parent byte for byte.
export function assertReviewedVp9RecipeParent(candidate, archived, root, kind, checkOnly) {
  if (!checkOnly || candidate === archived) return assert.equal(candidate, archived);
  assert.ok(Object.hasOwn(imports, kind));
  assert.ok(path.isAbsolute(root));
  for (const stem of imports[kind]) {
    const file = `scripts/lib/${stem}.mjs`;
    const current = ` from ${JSON.stringify(pathToFileURL(path.join(root, file)).href)};`;
    const historical = ` from ${JSON.stringify(historicalRoot + file)};`;
    assert.equal(candidate.split(current).length, 2, file);
    assert.equal(archived.split(historical).length, 2, file);
    candidate = candidate.replace(current, () => historical);
  }
  assert.equal(candidate, archived);
}
