import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { chooseLowerCopyDiagnosticBlank, makeLowerCopyDiagnostic } from "../scripts/lib/exclusive-copy-lower-baseline.mjs";
const blank = bytes => ({ stable: true, privateBytes: bytes, minimumElapsedMs: 8000, sampleCount: 5 });
test("storage-only comparison always keeps lower actual stable blank, never inflates the denominator", () => {
  const early = blank(200000000), late = blank(250000000);
  assert.equal(chooseLowerCopyDiagnosticBlank(early, late), early);
  assert.equal(chooseLowerCopyDiagnosticBlank(late, early), early);
  for (const bad of [{}, { ...early, stable: false }, { ...early, minimumElapsedMs: 1 }, { ...early, sampleCount: 4 }])
    assert.throws(() => chooseLowerCopyDiagnosticBlank(bad, late));
});
test("changed storage diagnostic retains full6.414GB fixture, all six copy tests, cleanup and non-acceptance", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/benchmark-exclusive-staged-copy.mjs"), "utf8");
  const recipe = makeLowerCopyDiagnostic(source, root); let restored = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before); assert.equal(restored, source);
  for (const text of ["fixtureBytes: 6414309978", "fullOriginalAcceptance: false", "primaryLimitMiB: 250", "await runtime.close()", "chosenLower: true"])
    assert.ok(recipe.generated.includes(text), text);
});
