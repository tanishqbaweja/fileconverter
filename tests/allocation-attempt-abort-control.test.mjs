import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { createAllocationAttemptAbortCapture, readAllocationAttemptSnapshot, ALLOCATION_ATTEMPT_DECODER_SHA256,
  ALLOCATION_ATTEMPT_ROOT, ALLOCATION_ATTEMPT_SLOT } from "../scripts/lib/allocation-attempt-abort-capture.mjs";
import { makeAllocationAttemptExportRecipe, makeAllocationAttemptBrowserFactory } from "../scripts/lib/allocation-attempt-control-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function fixture() {
  const heap = new Uint8Array(33554432), view = new DataView(heap.buffer), set = (at, value) => view.setUint32(at, value, true), at = ALLOCATION_ATTEMPT_ROOT;
  set(at + 12, 1048568); set(at + 16, 2097152); set(at + 24, 3145728); set(3145732, 1048569);
  set(at + 432, 2097152); set(at + 472, 2097152); set(at + 476, 2097152);
  [1095519281, 1, 23, 1, 16, 1597463].forEach((value, i) => set(ALLOCATION_ATTEMPT_SLOT + i * 4, value));
  return { core: { HEAPU8: heap, withinAllocatorAttemptAddress: ALLOCATION_ATTEMPT_SLOT, withinAllocatorAttemptWords: 16 },
    setWord: (index, value) => set(ALLOCATION_ATTEMPT_SLOT + index * 4, value), set };
}
function syntheticStack(action) {
  const OriginalError = globalThis.Error;
  class SyntheticError extends OriginalError {
    constructor(message) { super(message); this.stack = "SYNTHETIC UNIT ONLY wasm-function[4188] wasm-function[4312] wasm-function[4471] wasm-function[4441]"; }
  }
  globalThis.Error = SyntheticError; try { action(OriginalError); } finally { globalThis.Error = OriginalError; }
}
test("native-slot parser reads16 words; fast malloc size is known, aligned fallback internal malloc size stays unknown", () => {
  const { core, setWord } = fixture(), first = readAllocationAttemptSnapshot(core);
  assert.equal(first.wordsRead, 16); assert.equal(first.slotBytes, 64); assert.equal(first.failedIndividualAllocationBytes, 1597463);
  assert.equal(first.phase, "fast-malloc-pending"); assert.equal(first.allocatorInternalChunkBytes, null);
  setWord(3, 4); setWord(7, 2200008); setWord(9, 8); setWord(10, 1);
  const fallback = readAllocationAttemptSnapshot(core);
  assert.equal(fallback.wrapperRequestedBytes, 1597463); assert.equal(fallback.failedIndividualAllocationBytes, null);
  assert.equal(fallback.phase, "upstream-alignment-pending"); assert.equal(fallback.freshUnexposedPointerFreed, true);
  setWord(13, 1); assert.throws(() => readAllocationAttemptSnapshot(core), /schema\/state/);
});
test("qualified failure reads current scalar/header state once; previous fatal remains thrown; no normal sampling", () => syntheticStack(OriginalError => {
  const { core } = fixture(); let reads = 0, emitted = 0;
  const capture = createAllocationAttemptAbortCapture({ qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256,
    getCore: () => { reads++; return core; }, emit: () => { emitted++; } });
  assert.equal(reads, 0); assert.equal(capture.report().first, null);
  const fatal = new OriginalError("unchanged prior native fatal");
  assert.throws(() => capture.withPriorOnAbort(() => { throw fatal; })("synthetic reason"), error => error === fatal);
  capture.onAbort("second ignored"); assert.equal(reads, 1); assert.equal(emitted, 1);
  const row = capture.report().first;
  assert.equal(row.failedIndividualAllocationBytes, 1597463); assert.equal(row.allocationAttemptUnavailable, null);
  assert.equal(row.allocatorFreeBlocksUnavailable, null); assert.equal(row.allocatorFreeBlocks.totalFreeChunkBytes, 1048568);
  assert.equal(row.heapLiveBytes, null); assert.equal(row.originalFailureCauseProven, false);
  assert.equal(Object.isFrozen(row.allocationAttempt.words), true); assert.equal(capture.report().maximumRecords, 1);
}));
test("unqualified stack never reads heap; invalid constructor binding, C slot or allocator remain honestly unavailable", () => {
  let reads = 0;
  const unqualified = createAllocationAttemptAbortCapture({ qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256,
    getCore: () => { reads++; return fixture().core; }, emit: () => {} });
  unqualified.onAbort("not a real qualified Wasm stack"); assert.equal(reads, 0);
  assert.equal(unqualified.report().first.failedIndividualAllocationBytes, null);
  assert.throws(() => createAllocationAttemptAbortCapture({ qualifiedBinarySha256: "wrong", getCore: () => {}, emit: () => {} }), TypeError);
  syntheticStack(() => {
    const { core, setWord, set } = fixture(); setWord(0, 0);
    const broken = createAllocationAttemptAbortCapture({ qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256, getCore: () => core, emit: () => {} });
    broken.onAbort("synthetic invalid slot"); assert.equal(broken.report().first.allocationAttempt, null);
    assert.equal(broken.report().first.allocatorFreeBlocks, null);
    setWord(0, 1095519281); set(ALLOCATION_ATTEMPT_ROOT + 16, 0);
    const headers = createAllocationAttemptAbortCapture({ qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256,
      getCore: () => core, emit: () => { throw new Error("synthetic emission failure"); } });
    headers.onAbort("synthetic bad headers"); assert.equal(headers.report().first.failedIndividualAllocationBytes, 1597463);
    assert.equal(headers.report().first.allocatorFreeBlocks, null); assert.notEqual(headers.report().emitFailure, null);
    core.withinAllocatorAttemptAddress++; assert.throws(() => readAllocationAttemptSnapshot(core), /binding/);
  });
});
test("actual current-core export-only control and generated headless driver retain original non-export/IO/privacy/cleanup gates", async () => {
  const runtime = await createOwnedRuntimeScratch("attempt-browser-recipe-unit-");
  const imports = source => source.replace(/from "(\.\/[^"\r\n]+)"/g, (_, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", file)).href)}`);
  try {
    const exportRecipe = makeAllocationAttemptExportRecipe(await read("scripts/lib/refstruct-export-only-control.mjs"));
    const exportFile = path.join(runtime.directory, "export.mjs"); await writeFile(exportFile, imports(exportRecipe.generated), { flag: "wx" });
    const factory = await import(pathToFileURL(exportFile).href);
    const binary = await readFile(path.join(root, "work/mpeg2-allocation-attempt-38138821153/within-mpeg2-split.wasm"));
    const control = factory.createAllocationAttemptExportOnlyControl(binary);
    assert.equal(control.originalSha256, ALLOCATION_ATTEMPT_DECODER_SHA256); assert.equal(control.onlyExportSectionChanged, true);
    assert.equal(control.additions[0].functionIndex, 4188);
    assert.ok(control.sections.filter(row => row.id !== 7).every(row => row.originalSha256 === row.outputSha256));
    const browserRecipe = makeAllocationAttemptBrowserFactory(await read("scripts/lib/direct-buffer-control-browser-recipe.mjs"));
    const browserFile = path.join(runtime.directory, "browser.mjs"); await writeFile(browserFile, imports(browserRecipe.generated), { flag: "wx" });
    const browserFactory = await import(pathToFileURL(browserFile).href);
    const driver = browserFactory.makeAllocationAttemptControlBrowserRecipe(await read("scripts/check-wasm-abort-capture-origin-checked.mjs"),
      root, path.join(runtime.directory, "control.wasm"), control, "2026-10-11T00-00-00-000Z");
    assert.equal(sha(driver.generated), driver.generatedSha256);
    const checked = spawnSync(process.execPath, ["--check", "--input-type=module"],
      { input: driver.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(checked.status, 0, checked.stderr);
    for (const token of ["--headless=new", "windowsHide: true", "classifyPrivateRequest(detail, origin)",
      "Unchanged2GiB host preflight", "allSampledNativeBirthsAbsent", "runtimeProfileRemoved", "failedIndividualAllocationBytes,33554432",
      "originalCalls, 1", "primaryMemoryAcceptance: false", "browserConversionsPerformed: 0"])
      assert.ok(driver.generated.includes(token), token);
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
