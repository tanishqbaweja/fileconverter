import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { makeMvfMediaComponents, loadMvfMediaComponents } from "../scripts/lib/mvf-arena-media-recipe.mjs";
import { makeMvfMediaCaller } from "../scripts/lib/mvf-arena-media-caller-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
function reverse(recipe) { let source = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) source = source.replace(after, before); return source; }
test("media derivative preserves prior four-case production/independent validator pipeline and verifies current decoder", async () => {
  const source = await read("scripts/lib/ebml-reuse-media-recipe.mjs"), recipe = makeMvfMediaComponents(source, root);
  syntax(recipe.generated); assert.equal(reverse(recipe), source);
  process.env.WITHIN_MVF_ARENA_CONTROL_RECEIPT = "evidence/2026-10-14T22-17-16-644Z-mvf-arena-browser-control-executed-sources.json";
  const components = await loadMvfMediaComponents(root), parts = await components.ebmlMediaParts(root), manifest = components.expectedEbmlManifest(parts);
  assert.equal(parts.native.envelope.sourceCount, 99); assert.equal(Object.keys(parts.baseline.sourcePins).length, 255);
  assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576");
  assert.equal(manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.deepEqual(manifest.mvfArena, parts.native.build.manifest.mvfArena);
  assert.deepEqual(manifest.singleIdle, parts.native.build.manifest.singleIdle);
  assert.equal(manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(manifest.allowMemoryGrowth, false);
  assert.equal(parts.glue.edits.length, 4); assert.equal(parts.glue.nativeWasmChanged, false);
});
test("media caller retains all 255 parent sources and separate bounded additions, no cap relaxation", async () => {
  const source = await read("scripts/qualify-ebml-reuse-media.mjs"), recipe = makeMvfMediaCaller(source, root);
  syntax(recipe.generated); assert.equal(reverse(recipe), source);
  for (const token of ["legacyFiles.length,255", "legacyFiles.length<=256", "supplemental.length<=128", "raw.length<=2097152", "executedQualifierSource",
    "postSourcePins", "await runtime.close()", "-mvf-arena-media-supplement.json", "WITHIN_MVF_ARENA_CONTROL_RECEIPT"])
    assert.ok(recipe.generated.includes(token), token);
});
