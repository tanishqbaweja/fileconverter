import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createBoundedAsyncifyStorage } from "../scripts/lib/bounded-asyncify-storage.mjs";
import { makeAsyncifyStorageGlue } from "../scripts/lib/asyncify-storage-glue-recipe.mjs";

function fixture(malloc) {
  const heap = new Uint8Array(33554432), allocations = [], frees = [];
  const lease = createBoundedAsyncifyStorage({ malloc: malloc ?? (bytes => { allocations.push(bytes); return 1024; }),
    free: pointer => { assert.ok(heap.subarray(pointer, pointer + 262156).every(value => value === 0)); frees.push(pointer); }, heap: () => heap });
  return { lease, heap, allocations, frees };
}
test("one exact startup reservation reused and cleared across1000 sequential suspension leases", () => {
  const { lease, heap, allocations, frees } = fixture(); assert.equal(lease.reserve(), 1024);
  for (let i = 0; i < 1000; i++) {
    assert.equal(lease.acquire(), 1024); assert.ok(heap.subarray(1024, 1024 + 262156).every(value => value === 0));
    heap.fill(255, 1024, 1024 + 262156); lease.release(1024);
    assert.equal(heap[1024], 0); assert.equal(heap[1024 + 262155], 0);
  }
  assert.deepEqual(allocations, [262156]); assert.deepEqual(frees, []);
  assert.equal(lease.metrics().acquisitions, 1000); assert.equal(lease.metrics().maximumLeases, 1);
  lease.close(); lease.close(); assert.deepEqual(frees, [1024]); assert.equal(lease.metrics().retainedBytes, 0);
  assert.throws(() => lease.acquire(), /closed/);
});
test("active close defers free; nested, foreign and duplicate operations fail without losing ownership", () => {
  const { lease, frees } = fixture(); const pointer = lease.acquire();
  assert.throws(() => lease.acquire(), /Nested/); assert.throws(() => lease.release(pointer + 4), /Foreign/);
  lease.close(); assert.deepEqual(frees, []); assert.equal(lease.metrics().activeLeases, 1);
  lease.release(pointer); assert.deepEqual(frees, [pointer]); assert.throws(() => lease.release(pointer), /duplicate/);
  assert.throws(() => lease.reserve(), /closed/);
});
test("allocation rejection/throw and changed heap fail safely; no false lease or frees", () => {
  for (const result of [0, -4, 3, 33554432, NaN]) {
    const { lease, frees } = fixture(() => result); assert.throws(() => lease.acquire(), /Unable/);
    assert.equal(lease.metrics().activeLeases, 0); assert.equal(lease.metrics().allocations, 0); lease.close(); assert.deepEqual(frees, []);
  }
  const { lease } = fixture(() => { throw new Error("native OOM"); }); assert.throws(() => lease.acquire(), /native OOM/);
  assert.equal(lease.metrics().retainedBytes, 0);
  const bad = createBoundedAsyncifyStorage({ malloc: () => assert.fail("must not allocate"), free: () => assert.fail("must not free"), heap: () => new Uint8Array(16777216) });
  assert.throws(() => bad.reserve(), /fixed32MiB/);
});
test("exact audited compiled glue patch reverses fully and retains state machine, stack and native imports", async () => {
  const source = await readFile(new URL("../work/mpeg2-packet-cache-38206263853/within-mpeg2-split.mjs", import.meta.url), "utf8");
  const recipe = makeAsyncifyStorageGlue(source); assert.equal(recipe.edits.length, 4);
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); assert.throws(() => makeAsyncifyStorageGlue(source + "\n"));
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.ok(recipe.generated.includes('if(ENVIRONMENT_IS_PTHREAD){initRuntime();return}'));
  assert.equal(recipe.nativeWasmChanged, false); assert.equal(recipe.stackSizeChanged, false);
});
