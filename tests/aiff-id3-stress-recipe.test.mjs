import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeAiffId3StressRecipe } from "../scripts/lib/aiff-id3-stress-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/memory-profile.mjs"), "utf8");
test("Private stress derivative preserves all old gates and adds exact births/privacy/AIFF art and tighter heap cap", () => {
  const recipe = makeAiffId3StressRecipe(source, root, path.join(root, "work/aiff-test-recipe-not-created"));
  for (const token of ["headless=new", "windowsHide: true", "peak complete Chromium process-tree private memory", "<= 250",
    "decoded-pcm-sha256", "aiffCancellation", "networkPrivacy", "mp3Output || flacOutput || aiffOutput", "Refusing reused or unrelated PID cleanup",
    "Refusing replaced/unowned directory cleanup", "32 * 1024 * 1024", "owned-identity-absent"])
    assert.ok(recipe.generated.includes(token), token);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, windowsHide: true, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  assert.ok(recipe.generated.includes('"blank-baseline",'));
  assert.ok(recipe.generated.includes("90_000"));
  assert.ok(recipe.generated.includes("source.artwork && (mp3Output || flacOutput || aiffOutput) ? 1 : 0"));
  assert.ok(recipe.generated.includes("sourceAttachedPictureCount > preservedArtworkCount"));
  assert.ok(recipe.generated.includes('sourceHasSubtitle &&'));
  assert.ok(recipe.generated.includes('sourceHasAttachment &&'));
  assert.ok(recipe.generated.includes("Blank Chromium private-memory baseline is unavailable or unstable; no last-sample fallback."));
  assert.throws(() => makeAiffId3StressRecipe(source + "\n", root, path.join(root, "work/example")));
  assert.throws(() => makeAiffId3StressRecipe(source, root, path.join(root, "outputs/example")));
});
