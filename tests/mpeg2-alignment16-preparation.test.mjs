import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { makeAlignment16SdkSource, SDK_DLMALLOC_SOURCE_SHA256, patchAlignment16Sdk } from "../media/ffmpeg/mpeg2-alignment16-sdk.mjs";
import { makeAlignment16Recipe } from "../media/ffmpeg/mpeg2-alignment16-recipe.mjs";
import { makeAllocationAttemptRecipe } from "../media/ffmpeg/mpeg2-allocation-attempt-recipe.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Builder } from "../media/ffmpeg/mpeg2-alignment16-builder-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("official pinned6.0.4 allocator body stays byte-exact under supported16-byte override; incorrect source refuses before mutation", async () => {
  const response = await fetch("https://raw.githubusercontent.com/emscripten-core/emscripten/6.0.4/system/lib/dlmalloc.c", { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok); const source = await response.text(); assert.ok(Buffer.byteLength(source) <= 300000); assert.equal(sha(source), SDK_DLMALLOC_SOURCE_SHA256);
  const recipe = makeAlignment16SdkSource(source); assert.equal(recipe.generated.slice(recipe.prefix.length), source);
  assert.equal(recipe.alignment, 16); assert.equal(recipe.upstreamBodyUnchanged, true); assert.equal(recipe.heapLimitsRaised, false);
  assert.throws(() => makeAlignment16SdkSource(source + "\n"));
  if (process.platform !== "linux") await assert.rejects(patchAlignment16Sdk(root, path.join(root, "work/alignment16-builder-UNIT/sdk-state.json")));
});
test("actual outer-builder generation preserves nested root literals and reverses each declaration/import edit", async () => {
  const prior = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), "utf8"), recipe = makeAlignment16Builder(prior, root);
  assert.equal(prior.split('path.resolve(import.meta.dirname, "../..")').length, 3, "Regression fixture has BOTH declaration and nested literal");
  assert.ok(recipe.generated.includes('const root = ' + JSON.stringify(root)));
  assert.ok(recipe.generated.includes("['path.resolve(import.meta.dirname"));
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior); assert.throws(() => makeAlignment16Builder(prior + "\n", root));
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, windowsHide: true, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
});
test("execute actual nested generation only: import origins bind real media sources, not outer scratch; no SDK/compiler/spawn", async () => {
  const source = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), "utf8"), outer = makeAlignment16Builder(source, root).generated;
  const start = outer.indexOf("const prior = await readFile("), end = outer.indexOf("const runtime = await createOwnedRuntimeScratch(");
  assert.ok(start > 0 && end > start); const preparation = outer.slice(start, end);
  assert.ok(!preparation.includes("spawn(")); assert.ok(!preparation.includes("writeFile("));
  assert.ok(preparation.includes('path.resolve(root, "media/ffmpeg", file)'));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const nested = await new AsyncFunction("root", "readFile", "assert", "sha", "path", "pathToFileURL", preparation + "\nreturn generated;")(root, readFile, assert, sha, path, pathToFileURL);
  const imports = [...nested.matchAll(/^import [^\n]+ from "([^"]+)";/gm)].map(match => match[1]);
  assert.equal(imports.length, 9);
  for (const specifier of imports) {
    assert.ok(specifier.startsWith("node:") || specifier.startsWith("file:"), specifier);
    if (specifier.startsWith("file:")) { await access(new URL(specifier)); assert.ok(!specifier.includes("alignment16-builder-")); }
  }
  const expected = pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-single-idle-source.mjs")).href;
  assert.ok(imports.includes(expected));
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: nested, windowsHide: true, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
});
test("decoder-only recipe restores SDK BEFORE unchanged encoder and reverses every unrelated conversion/native contract gate", async () => {
  const source = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-split-pipeline.sh"), "utf8"), old = makeAllocationAttemptRecipe(source), generated = makeAlignment16Recipe(source);
  const restore = 'node "${SCRIPT_DIR}/mpeg2-alignment16-sdk.mjs" restore "${WITHIN_ALIGNMENT16_SDK_STATE:?}"\n';
  assert.ok(generated.indexOf(restore) < generated.indexOf('bash "${SCRIPT_DIR}/build-mpeg2-split-encoder.sh"'));
  const start = generated.indexOf("# Real Wasm allocator contract;"), end = generated.indexOf("# Compile the preserved production AVIO/kernel", start);
  assert.ok(start >= 0 && end > start); assert.equal(generated.slice(0, start) + generated.slice(end).replace(restore, ""), old);
  for (const token of ["-sINITIAL_MEMORY=33554432", "-sMAXIMUM_MEMORY=33554432", "-sALLOW_MEMORY_GROWTH=0", "-sMALLOC=dlmalloc", "allocation-attempt-smoke", "single-idle-smoke"]) assert.ok(generated.includes(token), token);
  for (const file of ["build-mpeg2-alignment16.mjs", "mpeg2-alignment16-sdk.mjs", "mpeg2-alignment16-recipe.mjs"]) {
    const checked = spawnSync(process.execPath, ["--check", path.join(root, "media/ffmpeg", file)], { windowsHide: true, encoding: "utf8" }); assert.equal(checked.status, 0, checked.stderr);
  }
});
