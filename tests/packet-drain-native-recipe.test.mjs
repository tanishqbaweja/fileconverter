import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { makePacketDrainNativeQualifier } from "../scripts/lib/packet-drain-native-recipe.mjs";
import { makeMvfNativeQualifier } from "../scripts/lib/mvf-arena-native-recipe.mjs";
test("packet-drain native qualifier retains107 parent pins, exact new kernel, typed fresh ABI and unchanged caps", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/qualify-ebml-reuse-native.mjs"), "utf8");
  const recipe = makePacketDrainNativeQualifier(source, root);
  let restored = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, makeMvfNativeQualifier(source, root).generated);
  assert.throws(() => makePacketDrainNativeQualifier(source + "\n", root));
  const parsed = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(parsed.status, 0, parsed.stderr);
  for (const token of ["expectedFiles.length, 116", "expectedFiles.length <= 128", "raw.length <= 2097152", "mpeg2-packet-interleave-build-38671160915.json",
    "readWasmFunctionMetadata(binary", "actualPacketDrain: build.manifest.packetDrain", "drain.generated", "allTwentyToolsMatched", "runtimeBrowserHookQualified: false"])
    assert.ok(recipe.generated.includes(token), token);
  const matcher = recipe.generated.match(/assert\.match\(file, (\/\^.*?\$\/)\);/)[1];
  const allowed = Function("return " + matcher)();
  for (const file of ["scripts/prepare-packet-drain-build-branch.mjs", "scripts/collect-packet-interleave-build.mjs",
    "tests/mpeg2-packet-drain.test.mjs", "media/ffmpeg/mpeg2-packet-drain-source.mjs"])
    assert.ok(allowed.test(file), file);
  for (const file of ["test.mkv", "scripts/unrelated.mjs", "tests/unrelated.test.mjs"]) assert.ok(!allowed.test(file), file);
});
