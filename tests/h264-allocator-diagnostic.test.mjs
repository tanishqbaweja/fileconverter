import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { instrumentH264Allocator } from "../scripts/lib/h264-allocator-instrumentation.mjs";
import { candidateDirectory, verifyCandidateRecipe } from "../scripts/lib/h264-candidate-selection.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("native allocator instrumentation changes only two diagnostic calls around an exact pinned codec kernel", async () => {
  const kernel = await read("media/ffmpeg/h264-candidate.c"), header = await read("media/ffmpeg/h264-allocator-diagnostic.h");
  const generated = instrumentH264Allocator(kernel, header);
  assert.equal(generated.slice(header.length + 1).replace(/ {2,4}h264_allocator_snapshot\(input.position, output.size\);\n/g, ""), kernel);
  assert.throws(() => instrumentH264Allocator(kernel + "\n", header), /exact unchanged/);
  assert.match(header, /count >= 256/); assert.match(header, /2500000/);
  assert.match(header, /size_t buckets\[32\]/);
  assert.match(header, /emmalloc_free_dynamic_memory\(\)/);
  assert.match(header, /emmalloc_compute_free_dynamic_memory_fragmentation_map/);
  assert.doesNotMatch(header, /\bmalloc\(|\bfree\(|malloc_trim\(|memcpy\(/);
});
test("private diagnostic stays opt-in, bounded and separate from public/default speed claims", async () => {
  const recipe = await read("media/ffmpeg/build-h264-candidate.sh"), generator = await read("media/ffmpeg/make-h264-candidate.mjs");
  assert.match(recipe, /WITHIN_H264_ALLOCATOR_DIAGNOSTIC:-0/);
  assert.match(generator, /diagnostic === "1" \? instrumentH264Allocator/);
  assert.match(await read("scripts/h264-private-memory.mjs"), /allocatorSamples.length < 768/);
  assert.match(await read("scripts/h264-private-memory.mjs"), /Allocator diagnostics cannot be a short speed trial/);
  assert.match(candidateDirectory("owned", "h264-allocator-candidate-output"), /h264-allocator-candidate-output$/);
  assert.match(await read("scripts/stage-h264-candidate.mjs"), /manifest.allocatorDiagnostic/);
});
test("retained proven SAD tool still verifies its historical build recipe after diagnostic recipe changes", async () => {
  const result = await verifyCandidateRecipe(path.resolve(import.meta.dirname, ".."),
    "da0db1b5a51ab346d43aaff7fb2f537ef26075ac8686e564763a6b5cb294bb8d", "f".repeat(64));
  assert.equal(result.commit, "5084bd6831e648a0227193b126329ea1d70d1ee6");
});
