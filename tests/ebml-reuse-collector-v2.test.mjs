import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeEbmlReuseCollectorV2 } from "../scripts/lib/ebml-reuse-collector-v2.mjs";
test("collector-only correction removes shadowing without changing any assertion or native source", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/collect-mpeg2-single-idle-build.mjs"), "utf8");
  const recipe = makeEbmlReuseCollectorV2(source, root);
  assert.ok(recipe.generated.includes("const ebml = manifest.ebmlReuse, ebmlCandidateSmoke ="));
  assert.ok(!recipe.generated.includes("const ebml = manifest.ebmlReuse, smoke ="));
  assert.ok(recipe.generated.includes("assert.deepEqual(smoke, manifest.singleIdle.actualSyntheticWasm32Unit)"));
  const [[before, after]] = recipe.edits;
  assert.equal(after.replaceAll("ebmlCandidateSmoke", "smoke"), before);
  assert.equal(recipe.nativeBuildChanged, false); assert.equal(recipe.validationGatesChanged, false);
});
