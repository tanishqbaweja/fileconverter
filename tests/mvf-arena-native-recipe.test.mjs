import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { makeMvfNativeQualifier } from "../scripts/lib/mvf-arena-native-recipe.mjs";
test("MVF native qualifier retains all 93 parent pins and derives typed ABI rather than guessing old indices", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/qualify-ebml-reuse-native.mjs"), "utf8");
  const recipe = makeMvfNativeQualifier(source, root);
  const revised = makeMvfNativeQualifier(source, root, "smoke-warnings");
  assert.ok(revised.generated.includes("mpeg2-mvf-arena-build-branch-2026-10-15-smoke-warnings.json"));
  assert.ok(revised.generated.includes("assert.equal(process.argv.length, 4)"));
  let restored = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, source); assert.throws(() => makeMvfNativeQualifier(source + "\n", root));
  const parsed = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(parsed.status, 0, parsed.stderr);
  for (const token of ["expectedFiles.length, 99", "expectedFiles.length <= 128", "raw.length <= 2097152", "mpeg2-ebml-reuse-build-38608791023.json",
    "readWasmFunctionMetadata(binary", "actualMvfArena: build.manifest.mvfArena", "allTwentyToolsMatched", "runtimeBrowserHookQualified: false"])
    assert.ok(recipe.generated.includes(token), token);
});
