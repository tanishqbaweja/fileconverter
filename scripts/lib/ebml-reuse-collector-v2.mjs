// Correct a collector-only lexical shadow. The successful native build and all
// executed source/preimages of the failed collector remain unchanged.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeEbmlReuseCollector } from "./mpeg2-ebml-reuse-build-recipe.mjs";
export function makeEbmlReuseCollectorV2(source, root) {
  const parent = makeEbmlReuseCollector(source, root);
  const start = parent.generated.indexOf("  const ebml = manifest.ebmlReuse, smoke = ebml.actualWasmLibavutil;");
  const end = parent.generated.indexOf("  complete = true;", start);
  assert.ok(start >= 0 && end > start);
  const before = parent.generated.slice(start, end), after = before.replaceAll(/\bsmoke\b/g, "ebmlCandidateSmoke");
  assert.notEqual(after, before); assert.equal(parent.generated.split(before).length, 2);
  const generated = parent.generated.replace(before, after);
  assert.equal(generated.replace(after, before), parent.generated);
  assert.ok(!generated.includes("const ebml = manifest.ebmlReuse, smoke ="));
  return { generated, generatedSha256: sha(generated), edits: [[before, after]],
    parentSha256: parent.generatedSha256, nativeBuildChanged: false, validationGatesChanged: false, publicAcceptance: false };
}
