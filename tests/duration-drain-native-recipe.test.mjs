import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { makeDurationDrainNativeQualifier } from "../scripts/lib/duration-drain-native-recipe.mjs";
import { makePacketDrainNativeQualifier } from "../scripts/lib/packet-drain-native-recipe.mjs";
test("duration native qualifier retains all116 parents plus10 files, actual rational unit and fresh typed ABI", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/qualify-ebml-reuse-native.mjs"), "utf8");
  const recipe = makeDurationDrainNativeQualifier(source, root);
  let restored = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, makePacketDrainNativeQualifier(source, root).generated);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.throws(() => makeDurationDrainNativeQualifier(source + "\n", root));
  for (const token of ["expectedFiles.length, 126", "expectedFiles.length <= 128", "raw.length <= 2097152", "mpeg2-packet-drain-build-38673138419.json",
    "readWasmFunctionMetadata(binary", "actualDurationBoundary: build.manifest.packetDurationBoundary", "duration.iterations, 126000",
    "allTwentyToolsMatched", "runtimeBrowserHookQualified: false", "build.manifest.packetDrain.onlyQueueDrainAdded, false"])
    assert.ok(recipe.generated.includes(token), token);
  const matcher = recipe.generated.match(/assert\.match\(file, (\/\^.*?\$\/)\);/)[1];
  const allowed = Function("return " + matcher)();
  for (const file of ["scripts/prepare-duration-drain-build-branch.mjs", "scripts/collect-duration-drain-build.mjs", "tests/mpeg2-duration-drain.test.mjs"])
    assert.ok(allowed.test(file), file);
  assert.ok(!allowed.test("scripts/unrelated.mjs")); assert.ok(!allowed.test("test.mkv"));
});
