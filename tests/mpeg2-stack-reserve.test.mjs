import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mpeg2StackReserveAdapter } from "../scripts/lib/mpeg2-stack-reserve-adapter.mjs";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
test("Guarded private stack-reserve trial changes no native kernel, codec settings or fixed32 memory", async () => {
  const recipe = await read("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /-sASYNCIFY_STACK_SIZE=262144/);
  assert.match(recipe, /-sSTACK_SIZE=262144 -sSTACK_OVERFLOW_CHECK=2/);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=33554432" "-sMAXIMUM_MEMORY=33554432"/);
  assert.match(recipe, /-sASSERTIONS=1/);
  assert.match(recipe, /_emscripten_stack_get_base/); assert.match(recipe, /_emscripten_stack_get_end/);
  assert.equal(createHash("sha256").update(await read("media/ffmpeg/mpeg2-candidate.c")).digest("hex"),
    "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0");
  const manifest = await read("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /Generated Asyncify reserve differs/);
  assert.match(manifest, /entry.name === "__handle_stack_overflow"/);
  assert.match(manifest, /entry.name === "__set_stack_limits"/);
  assert.match(manifest, /stackReserveAdapterSha256/);
});
test("Both private browser adapters check actual native bounds and reject malformed guarded manifests", async () => {
  const good = { nativeStackBytes: 262144, asyncifyStackBytes: 262144,
    stackOverflowCheck: 2, compiledStackOverflowHandler: true };
  const adapter = mpeg2StackReserveAdapter(good);
  assert.match(adapter, /core._emscripten_stack_get_base\(\) - core._emscripten_stack_get_end\(\)/);
  assert.match(adapter, /nativeStackBytes !== 262144/);
  assert.match(adapter, /reserved-not-high-water-not-acceptance/);
  assert.doesNotMatch(adapter, /width\s*=|height\s*=|qmax|qmin|memory.grow|malloc|arrayBuffer/);
  for (const bad of [{ ...good, nativeStackBytes: 1048576 }, { ...good, stackOverflowCheck: 1 },
    { ...good, asyncifyStackBytes: 4096 }, { ...good, compiledStackOverflowHandler: false }])
    assert.throws(() => mpeg2StackReserveAdapter(bad));
  assert.equal(mpeg2StackReserveAdapter({}), "");
  for (const file of ["scripts/stage-mpeg2-artwork-candidate.mjs", "scripts/stage-mpeg2-large-candidate.mjs"])
    assert.match(await read(file), /mpeg2StackReserveAdapter\(manifest\)/);
  const harness = await read("scripts/mpeg2-protected-memory.mjs");
  assert.match(harness, /manifest.stackReserveAdapterSha256/);
  assert.match(harness, /run.incrementalPrivateMiB <= 250/);
});
