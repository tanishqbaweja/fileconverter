import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeLargestIdleExportRecipe, makeLargestIdleControlBrowserFactory, makeLargestIdleControlCaller } from "../scripts/lib/packet-largest-idle-control-recipe.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
import { readAllocationAttemptSnapshot, ALLOCATION_ATTEMPT_SLOT } from "../scripts/lib/packet-largest-idle-attempt-abort-capture.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("fresh export/browser/caller retain exact native, private ownership, hidden browser and full79-source envelope gates", async () => {
  for (const recipe of [makeLargestIdleExportRecipe(await read("scripts/lib/refstruct-export-only-control.mjs")),
    makeLargestIdleControlBrowserFactory(await read("scripts/lib/direct-buffer-control-browser-recipe.mjs")),
    makeLargestIdleControlCaller(await read("scripts/check-allocation-attempt-abort-control.mjs"), root)]) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
  }
  const binary = await readFile(path.join(root, "work/mpeg2-packet-largest-idle-38327579000/within-mpeg2-split.wasm"));
  const entries = readWasmFunctionMetadata(binary, new Set(["mpeg2_packets", "av_malloc", "__wrap_posix_memalign", "sbrk"]));
  assert.deepEqual(Object.fromEntries(entries.map(row => [row.name, row.functionIndex])), { av_malloc: 4313, sbrk: 4442, mpeg2_packets: 4471, __wrap_posix_memalign: 4473 });
});
test("new observer recognizes compiled packet path without pretending direct/pool qualification;16-word pending snapshot guards unchanged", async () => {
  const source = await read("scripts/lib/packet-largest-idle-composite-abort-capture.mjs");
  for (const gate of ["[4471, 4313, 4473, 4442].every(has)", "directPath || poolPath || packetPath", "qualifiedPacketCallPath: packetPath", "maximumAllocatorHeaderWords: 32768", "maximumAllocatorFreeChunks: 4096", "noNativeCallsAtAbort: true", "noPayloadRead: true"])
    assert.ok(source.includes(gate), gate);
  const heap = new Uint8Array(33554432), words = new Uint32Array(heap.buffer, ALLOCATION_ATTEMPT_SLOT, 16);
  words.set([1095519281,1,1,1,16,314088,0,0,0,0,0,0,0,0,0,0]);
  const core = { HEAPU8: heap, withinAllocatorAttemptAddress: ALLOCATION_ATTEMPT_SLOT, withinAllocatorAttemptWords: 16 };
  assert.equal(readAllocationAttemptSnapshot(core).failedIndividualAllocationBytes, 314088);
  words[3] = 6; assert.throws(() => readAllocationAttemptSnapshot(core));
});
