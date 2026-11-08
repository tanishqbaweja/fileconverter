import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { baseRecipeSha256, deriveMkvEditListBuildRecipe, sha256 } from "../media/ffmpeg/mkv-edit-list-build-recipe.mjs";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";

const read = name => readFile(new URL(`../${name}`, import.meta.url));

test("The unpublished recipe reverses exactly and edits the direct-only link, not the all-core link", async () => {
  const bytes = await read("media/ffmpeg/reproduce-nondocker.sh");
  const result = deriveMkvEditListBuildRecipe(bytes);
  assert.equal(sha256(bytes), baseRecipeSha256);
  assert.equal(result.exactReversal, true);
  assert.equal(result.generatedSha256, sha256(result.generated));
  assert.equal(result.generated.split(" --prepare ").length, 2);
  assert.match(result.generated, /requested_core=within-direct\n/);
  assert.match(result.generated, /--prepare .*\n  WITHIN_BUILD_CORE_FILTER=within-direct \.\/build-remux\.sh\n/);
  assert.match(result.generated, /WITHIN_BUILD_CORE_FILTER=within-direct \.\/build-remux\.sh\nelif \[\[ "\$\{requested_core\}" == "within-direct"/);
  assert.doesNotMatch(result.generated, /comparison_files=/);
  assert.throws(() => deriveMkvEditListBuildRecipe(Buffer.concat([bytes, Buffer.from("# changed\n")])), /Exact released/);
});

test("The hosted template is isolated, preserves the release, and never runs media conversion", async () => {
  const template = (await read("media/ffmpeg/mkv-edit-list-nondocker.yml")).toString();
  assert.match(template, /github\.ref == 'refs\/heads\/codex\/mkv-edit-list-native-20261108'/);
  assert.match(template, /emsdk" install 6\.0\.4/);
  assert.match(template, /git diff --exit-code HEAD -- public\/engines/);
  assert.match(template, /retention-days: 1/);
  assert.match(template, /if: always\(\)[\s\S]+ci-owned-runtime\.mjs cleanup/);
  assert.doesNotMatch(template, /test\.mkv|\bdocker (?:build|run)\b|\bdeploy\b/i);
  const wasm = await read("public/engines/remux/within-direct.wasm");
  assert.ok(WebAssembly.validate(wasm));
  assert.equal(sha256(wasm), "306d44ccae312668190f6e43c6e51867981e75868c6c45a7267f1b24e3ce30d0");
  assert.deepEqual(readWasmMemoryLimits(wasm), [{ imported: true, initialPages: 384, maximumPages: 1024, shared: true }]);
  const glue = (await read("public/engines/remux/within-direct.mjs")).toString();
  assert.match(glue, /\bwithin-direct\.wasm\b/);
  assert.match(glue, /\b_within_remux\b/);
});
