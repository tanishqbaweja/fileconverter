import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { selectMpeg2Allocator, verifyMpeg2AllocatorSymbols } from "../media/ffmpeg/mpeg2-allocator-selection.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("Private allocator is explicit, default unchanged, and emmalloc-only telemetry cannot claim dlmalloc readings", () => {
  assert.equal(selectMpeg2Allocator(), "emmalloc"); assert.equal(selectMpeg2Allocator("dlmalloc"), "dlmalloc");
  assert.equal(selectMpeg2Allocator("emmalloc", true), "emmalloc");
  for (const bad of ["none", "mimalloc", "", null, 1]) assert.throws(() => selectMpeg2Allocator(bad));
  assert.throws(() => selectMpeg2Allocator("dlmalloc", true), /cannot measure/);
  assert.throws(() => selectMpeg2Allocator("emmalloc", "1"), /boolean/);
});
test("Allocator fingerprint checks actual emitted symbols and refuses mismatches or malformed maps", async () => {
  const em = "0:0:emmalloc_malloc\n1:1:emmalloc_free\n2:2:emmalloc_memalign\n";
  const dl = "0:dlmalloc\n1:dlfree\n2:dlmemalign\n";
  assert.equal(verifyMpeg2AllocatorSymbols("emmalloc", em).length, 3);
  assert.equal(verifyMpeg2AllocatorSymbols("dlmalloc", dl).length, 3);
  assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", em), /fingerprint/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("emmalloc", dl), /fingerprint/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", em + dl), /fingerprint/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("emmalloc", "0:emmalloc_malloc\n"), /fingerprint/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", "not a map"), /Malformed/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", "x".repeat(1024 * 1024 + 1)), /Bounded/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", "0:malloc\n1:free\n2:tmalloc_large\n"),
    /selected=dlmalloc; required=.*; observed=\["free","malloc","tmalloc_large"\]; observedCount=3; truncated=false/);
  const many = Array.from({ length: 30 }, (_, index) => `${index}:dl${"x".repeat(200)}${index}`).join("\n");
  assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", many), (error) => {
    assert.match(error.message, /observedCount=30; truncated=true/);
    assert.ok(error.message.length < 3600);
    return true;
  });
  const manifest = await read("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /verifyMpeg2AllocatorSymbols\(nativeAllocator/);
  assert.match(manifest, /"within-mpeg2.wasm", "within-mpeg2.mjs.symbols"/);
});
test("Observed SDK6.0.4 LTO allocator aliases require both dlmalloc-specific routines and all three builtin aliases", async () => {
  const evidence = JSON.parse(await read("evidence/mpeg2-dlmalloc-emitted-fingerprint-2026-10-06.json"));
  const names = evidence.actualEmittedAllocatorRelatedSymbols;
  assert.equal(evidence.observedCount, names.length); assert.equal(evidence.truncated, false);
  const map = (values) => values.map((name, index) => `${index}:${index}:${name}`).join("\n");
  const required = ["dispose_chunk", "dlposix_memalign", "emscripten_builtin_free",
    "emscripten_builtin_malloc", "emscripten_builtin_realloc"];
  assert.deepEqual(verifyMpeg2AllocatorSymbols("dlmalloc", map(names)), required);
  for (const removed of required)
    assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", map(names.filter((name) => name !== removed))), /fingerprint/);
  const em = ["emmalloc_malloc", "emmalloc_free", "emmalloc_memalign"];
  assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", map([...names, ...em])), /fingerprint/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("emmalloc", map([...names, ...em])), /fingerprint/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("emmalloc", map([...em, "dlposix_memalign"])), /fingerprint/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", map([...names, "emmalloc_future"])), /fingerprint/);
  assert.throws(() => verifyMpeg2AllocatorSymbols("dlmalloc", map(required.slice(2))), /fingerprint/);
});
test("One allocation strategy reaches all compiled lifecycle gates without changing protected codec/kernel or memory limits", async () => {
  const recipe = await read("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.equal(recipe.split('"-sMALLOC=${CANDIDATE_ALLOCATOR}"').length, 4);
  assert.match(recipe, /WITHIN_MPEG2_ALLOCATOR:-emmalloc/);
  assert.match(recipe, /-sINITIAL_MEMORY=33554432/); assert.match(recipe, /-sMAXIMUM_MEMORY=33554432/);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0/);
  assert.match(recipe, /mpeg2-allocator-selection.mjs/);
  const kernel = await read("media/ffmpeg/mpeg2-candidate.c");
  assert.equal(createHash("sha256").update(kernel).digest("hex"), "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0");
  const exec = promisify(execFile), bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  for (const [allocator, diagnostic, message] of [["none", "0", /must be emmalloc or dlmalloc/],
    ["dlmalloc", "1", /cannot measure dlmalloc/]]) {
    await assert.rejects(exec(bash, ["media/ffmpeg/build-mpeg2-candidate.sh"], {
      env: { ...process.env, WITHIN_MPEG2_ALLOCATOR: allocator, WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC: diagnostic },
      windowsHide: true,
    }), message);
  }
});
