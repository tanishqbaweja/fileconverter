import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { makeHevcPlaneExportRecipe, makeHevcPlaneControlBrowserFactory, makeHevcPlaneControlCaller, HEVC_PLANE_DECODER_SHA256 } from "../scripts/lib/hevc-plane-control-recipe.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function parse(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("new observers retain byte-exact bounded reads/slots and differ only in real binary identity/function indices/import", async () => {
  const old = await read("scripts/lib/alignment16-attempt-abort-capture.mjs");
  const expected = old.replace("417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014", HEVC_PLANE_DECODER_SHA256)
    .replaceAll("4312", "4313").replaceAll("4436", "4437").replaceAll("4471", "4472").replaceAll("4441", "4442");
  const actual = await read("scripts/lib/hevc-plane-attempt-abort-capture.mjs"); assert.equal(actual.trimEnd(), expected.trimEnd()); parse(actual);
  const composite = await read("scripts/lib/hevc-plane-composite-abort-capture.mjs");
  const prior = (await read("scripts/lib/alignment16-composite-abort-capture.mjs")).replace("./alignment16-attempt-abort-capture.mjs", "./hevc-plane-attempt-abort-capture.mjs")
    .replaceAll("4312", "4313").replaceAll("4471", "4472").replaceAll("4441", "4442").replaceAll("4380", "4381");
  assert.equal(composite.trimEnd(), prior.trimEnd()); parse(composite);
});
test("actual new binary typed names prove shifted indices; derivations reverse exactly and preserve128/2MiB/privacy/cleanup/export-only gates", async () => {
  const indices = { av_buffer_allocz: 4188, av_malloc: 4313, emscripten_builtin_malloc: 4437, __wrap_posix_memalign: 4472, sbrk: 4442, av_refstruct_pool_get: 4381 };
  const binary = await readFile(path.join(root, "work/mpeg2-hevc-planes-38183370743/within-mpeg2-split.wasm"));
  for (const row of readWasmFunctionMetadata(binary, new Set(Object.keys(indices)))) assert.equal(row.functionIndex, indices[row.name]);
  const recipes = [makeHevcPlaneExportRecipe(await read("scripts/lib/refstruct-export-only-control.mjs")),
    makeHevcPlaneControlBrowserFactory(await read("scripts/lib/direct-buffer-control-browser-recipe.mjs")),
    makeHevcPlaneControlCaller(await read("scripts/check-allocation-attempt-abort-control.mjs"), root)];
  for (const recipe of recipes) { parse(recipe.generated); assert.equal(recipe.publicAcceptance, false); }
  for (const gate of ["files.length <= 128", "bytes.length <= 2097152", "await runtime.close()", "allCodeDataTypesImportsTablesMemoryExact", "syntheticOnly"])
    assert.ok((recipes[0].generated + recipes[2].generated).includes(gate), gate);
  assert.ok(recipes[2].generated.includes("sbrk: 4442, av_refstruct_pool_get: 4381"));
  assert.ok(recipes[1].generated.includes("hevc-plane-composite-abort-capture.mjs"));
});
