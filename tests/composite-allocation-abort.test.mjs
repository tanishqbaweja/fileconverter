import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createCompositeAllocationAbortCapture, COMPOSITE_POOL_SLOT } from "../scripts/lib/composite-allocation-abort-capture.mjs";
import { ALLOCATION_ATTEMPT_DECODER_SHA256, ALLOCATION_ATTEMPT_ROOT, ALLOCATION_ATTEMPT_SLOT } from "../scripts/lib/allocation-attempt-abort-capture.mjs";
import { makeCompositeAllocationAbortAdapter } from "../scripts/lib/composite-allocation-abort-adapter.mjs";
import { makeLateAllocatorAbortAdapter } from "../scripts/lib/mpeg2-late-allocator-abort-adapter.mjs";
import { makeFullBitrateAbortAdapter } from "../scripts/lib/encoder-plane-bitrate-full-recipe.mjs";
import { makeCompositeAllocationControlBrowserFactory, makeCompositeAllocationControlCaller } from "../scripts/lib/composite-allocation-control-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), text = async file => (await read(file)).toString();
const json = async file => JSON.parse(await read(file));
function fixture() {
  const heap = new Uint8Array(33554432), view = new DataView(heap.buffer), set = (at, value) => view.setUint32(at, value, true);
  set(ALLOCATION_ATTEMPT_ROOT + 12, 1048568); set(ALLOCATION_ATTEMPT_ROOT + 16, 2097152);
  set(ALLOCATION_ATTEMPT_ROOT + 24, 3145728); set(3145732, 1048569);
  set(ALLOCATION_ATTEMPT_ROOT + 432, 2097152); set(ALLOCATION_ATTEMPT_ROOT + 472, 2097152); set(ALLOCATION_ATTEMPT_ROOT + 476, 2097152);
  [1095519281, 1, 23, 1, 16, 1597463].forEach((word, i) => set(ALLOCATION_ATTEMPT_SLOT + i * 4, word));
  [0x52504631, 1, 82, 1, 8192, 33554432, 16, 33554448, 0, 0, 0, 0, 4, 1, 0, 0]
    .forEach((word, i) => set(COMPOSITE_POOL_SLOT + i * 4, word));
  return { core: { HEAPU8: heap, withinAllocatorAttemptAddress: ALLOCATION_ATTEMPT_SLOT, withinAllocatorAttemptWords: 16,
    withinRefstructAbortSnapshotAddress: COMPOSITE_POOL_SLOT, withinRefstructAbortSnapshotWords: 16 }, set };
}
function syntheticStack(indices, action) {
  const OriginalError = globalThis.Error;
  class SyntheticError extends OriginalError {
    constructor(message) { super(message); this.stack = "SYNTHETIC UNIT ONLY " + indices.map(i => `wasm-function[${i}]`).join(" "); }
  }
  globalThis.Error = SyntheticError;
  try { action(OriginalError); } finally { globalThis.Error = OriginalError; }
}
const direct = [4188, 4312, 4471, 4441], pool = [4380, 4312];
const capture = (core, emit = () => {}) => createCompositeAllocationAbortCapture({
  getCore: () => core, emit, qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256 });
test("one bounded direct capture reads current C slot, not pool; fatal callback remains exactly once and heap unchanged", () => syntheticStack(direct, OriginalError => {
  const { core } = fixture(), before = sha(core.HEAPU8); let gets = 0, emits = 0, priorCalls = 0;
  const observer = createCompositeAllocationAbortCapture({ getCore: () => { gets++; return core; }, emit: () => { emits++; },
    qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256 });
  assert.equal(gets, 0); assert.equal(observer.report().captureStarted, false);
  const fatal = new OriginalError("unchanged native fatal");
  assert.throws(() => observer.withPriorOnAbort(() => { priorCalls++; throw fatal; })("synthetic reason"), error => error === fatal);
  observer.onAbort("duplicate ignored");
  assert.equal(gets, 1); assert.equal(emits, 1); assert.equal(priorCalls, 1); assert.equal(sha(core.HEAPU8), before);
  const row = observer.report().first;
  assert.equal(row.failedIndividualAllocationBytes, 1597463); assert.equal(row.validatedScalarWords, 16);
  assert.equal(row.allocationAttemptUnavailable, null); assert.equal(row.latePoolRequest, null);
  assert.equal(row.allocatorFreeBlocks.totalFreeChunkBytes, 1048568); assert.equal(row.allocatorFreeBlocks.headerWordsRead, 44);
  assert.equal(row.allocatorFreeBlocksUnavailable, null); assert.equal(row.heapLiveBytes, null);
  assert.equal(row.originalFailureCauseProven, false); assert.equal(row.stackLimitRestored, true);
  assert.equal(observer.report().maximumRecords, 1); assert.equal(observer.report().nativeErrorSuppressed, false);
}));
test("remapped pool path retains exact original pool request semantics and new root; stale direct slot never read", () => syntheticStack(pool, () => {
  const { core, set } = fixture(); set(ALLOCATION_ATTEMPT_SLOT, 0);
  const observer = capture(core); observer.onAbort("synthetic pool"); const row = observer.report().first;
  assert.equal(row.qualifiedPoolCallPath, true); assert.equal(row.qualifiedDirectBufferCallPath, false);
  assert.equal(row.latePoolRequest.sequence, 82); assert.equal(row.latePoolRequest.liveEntriesBeforeRequest, 0);
  assert.equal(row.latePoolRequest.failedIndividualAllocationBytes, 33554448); assert.equal(row.failedIndividualAllocationBytes, 33554448);
  assert.equal(row.allocationAttempt, null); assert.equal(row.wrapperRequestedBytes, null);
  assert.equal(row.allocatorFreeBlocksUnavailable, null); assert.equal(row.actualAllocatorRoot, 1786648);
  assert.equal(row.actualPoolSlotAddress, 1918800); assert.equal(row.validatedScalarWords, 16);
}));
test("old or irrelevant native indices never read heap; missing binary qualification cannot start", () => {
  for (const indices of [[4379, 4311], [4187, 4311, 4470, 4440], [4188, 4312]]) syntheticStack(indices, () => {
    let gets = 0;
    const observer = createCompositeAllocationAbortCapture({ getCore: () => { gets++; throw new Error("not allowed"); },
      emit: () => {}, qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256 });
    observer.onAbort("synthetic unrelated"); assert.equal(gets, 0);
    assert.equal(observer.report().first.failedIndividualAllocationBytes, null);
    assert.equal(observer.report().first.allocatorFreeBlocks, null);
  });
  assert.throws(() => createCompositeAllocationAbortCapture({ getCore: () => {}, emit: () => {}, qualifiedBinarySha256: "old core" }), TypeError);
});
test("invalid pending slots cannot authorize headers; unavailable headers/emitter never hide genuine request or prior callback", () => {
  syntheticStack(direct, () => {
    const { core, set } = fixture(); set(ALLOCATION_ATTEMPT_SLOT, 0);
    let observer = capture(core); observer.onAbort("synthetic invalid slot");
    assert.equal(observer.report().first.allocationAttempt, null); assert.equal(observer.report().first.allocatorFreeBlocks, null);
    set(ALLOCATION_ATTEMPT_SLOT, 1095519281); set(ALLOCATION_ATTEMPT_ROOT + 16, 0); let prior = 0;
    observer = capture(core, () => { throw new Error("synthetic emitter failure"); });
    observer.withPriorOnAbort(() => { prior++; })("synthetic corrupt headers"); assert.equal(prior, 1);
    assert.equal(observer.report().first.failedIndividualAllocationBytes, 1597463);
    assert.equal(observer.report().first.allocatorFreeBlocks, null); assert.notEqual(observer.report().emitFailure, null);
    set(ALLOCATION_ATTEMPT_SLOT + 3 * 4, 4); set(ALLOCATION_ATTEMPT_SLOT + 7 * 4, 2200008);
    set(ALLOCATION_ATTEMPT_SLOT + 9 * 4, 8); set(ALLOCATION_ATTEMPT_SLOT + 10 * 4, 1);
    observer = capture(core); observer.onAbort("synthetic fallback");
    assert.equal(observer.report().first.wrapperRequestedBytes, 1597463);
    assert.equal(observer.report().first.failedIndividualAllocationBytes, null);
  });
  syntheticStack(pool, () => {
    const { core } = fixture(); core.withinRefstructAbortSnapshotAddress = 1918608;
    const observer = capture(core); observer.onAbort("synthetic stale binding");
    assert.equal(observer.report().first.latePoolRequest, null); assert.equal(observer.report().first.allocatorFreeBlocks, null);
  });
});
test("actual qualified decoder/map bind both current slots and remapped getter (not a real pool fatal or conversion)", async () => {
  const receipt = await json("evidence/2026-10-11T12-49-19-512Z-allocation-attempt-abort-control-executed-sources.json");
  assert.equal(sha(await read(receipt.layout.binary.path)), ALLOCATION_ATTEMPT_DECODER_SHA256);
  const map = await read(receipt.layout.map.path); assert.equal(sha(map), receipt.layout.map.sha256);
  assert.match(map.toString(), /1d4750\s+0\s+40\s+within_refstruct_abort_words/);
  assert.match(map.toString(), /1d4710\s+0\s+40\s+within_allocator_attempt_words/);
  assert.match(map.toString(), /1b4318\s+0\s+1f0\s+_gm_/);
  const build = await json("evidence/mpeg2-allocation-attempt-build-38138821153.json");
  const file = build.files.find(row => row.file === "within-mpeg2-split.mjs.symbols");
  const symbols = await read("work/mpeg2-allocation-attempt-38138821153/within-mpeg2-split.mjs.symbols");
  assert.equal(sha(symbols), file.sha256); assert.match(symbols.toString(), /^4380:av_refstruct_pool_get$/m);
});
test("composite served adapter exactly reverses to measured 4Mbps bytes without encoder/IO/quality/fatal changes", async () => {
  const previous = makeLateAllocatorAbortAdapter({ stager: await text("scripts/stage-mpeg2-split-direct.mjs"),
    stackHelper: await text("scripts/lib/bounded-wasm-abort-capture.mjs"),
    snapshotHelper: await text("scripts/lib/late-refstruct-abort-snapshot.mjs"), poolHelper: await text("scripts/lib/late-pool-abort-capture.mjs"),
    allocatorHelper: await text("scripts/lib/late-pool-allocator-abort-capture.mjs"), freeHeaderHelper: await text("scripts/lib/dlmalloc-free-header-inspection.mjs"),
    controlProof: await json("evidence/late-pool-abort-control-2026-10-08.json"),
    allocatorControlProof: await json("evidence/late-pool-allocator-abort-control-2026-10-08.json"),
    layoutProof: await json("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json") }).adapter;
  const args = { previousAdapter: makeFullBitrateAbortAdapter(previous).adapter,
    attemptHelper: await text("scripts/lib/allocation-attempt-abort-capture.mjs"),
    compositeHelper: await text("scripts/lib/composite-allocation-abort-capture.mjs"),
    controlProofBytes: await read("evidence/2026-10-11T12-49-19-512Z-allocation-attempt-abort-control.json") };
  const recipe = makeCompositeAllocationAbortAdapter(args);
  let reversed = recipe.adapter.slice(recipe.prefix.length);
  for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, args.previousAdapter); assert.ok(recipe.adapterBytes < 32768);
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.adapter, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.equal(recipe.publicAcceptance, false); assert.equal(recipe.fullOriginalAcceptance, false);
  for (const token of ["mapped[9] = 4000000", "decoderAbort.withPriorOnAbort(options.onAbort)", "createMpeg2SplitSession", "withinBridge", "openNativeEncoder"])
    assert.ok(recipe.adapter.includes(token), token);
  assert.throws(() => makeCompositeAllocationAbortAdapter({ ...args, previousAdapter: args.previousAdapter + "\n" }));
  assert.throws(() => makeCompositeAllocationAbortAdapter({ ...args, attemptHelper: args.attemptHelper + "\n" }));
  assert.throws(() => makeCompositeAllocationAbortAdapter({ ...args, controlProofBytes: Buffer.from("{}") }));
});
test("generated composite browser/caller keep all existing memory/privacy/birth/close/source guards and reversible edits", async () => {
  const caller = await text("scripts/check-allocation-attempt-abort-control.mjs");
  const recipe = makeCompositeAllocationControlCaller(caller, root);
  let reversed = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replaceAll(after, before);
  for (const [before, after] of recipe.initialEdits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, caller);
  assert.ok(recipe.generated.includes(`const root = ${JSON.stringify(root)}, read = file => readFile(path.join(root, file));`));
  for (const token of ["files.length <= 128", "bytes.length <= 2097152", "inspectStressHostMemory", "assert.equal(receipt.postSourcePins[file], hash, file)", "poolSlot.address, 1918800"])
    assert.ok(recipe.generated.includes(token), token);
  const factory = makeCompositeAllocationControlBrowserFactory(await text("scripts/lib/direct-buffer-control-browser-recipe.mjs"));
  const runtime = await createOwnedRuntimeScratch("composite-browser-recipe-unit-");
  try {
    const absolute = factory.generated.replace(/from "(\.\/[^"\r\n]+)"/g,
      (_, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", file)).href)}`);
    const file = path.join(runtime.directory, "factory.mjs"); await writeFile(file, absolute, { flag: "wx" });
    const { makeAllocationAttemptControlBrowserRecipe, allocationAttemptControlFiles } = await import(pathToFileURL(file).href);
    for (const source of allocationAttemptControlFiles) await access(path.join(root, source));
    const proof = await json("evidence/2026-10-11T12-49-19-512Z-allocation-attempt-abort-control.json");
    const driver = makeAllocationAttemptControlBrowserRecipe(await text("scripts/check-wasm-abort-capture-origin-checked.mjs"),
      root, path.join(runtime.directory, "CONTROL-ONLY.wasm"), proof.exportOnlyControl, "2026-10-11T00-00-00-000Z");
    assert.match(driver.worker, /createCompositeAllocationAbortCapture/);
    for (const token of ["--headless=new", "windowsHide: true", "classifyPrivateRequest(detail, origin)", "Unchanged2GiB host preflight",
      "allSampledNativeBirthsAbsent", "runtimeProfileRemoved", "originalCalls, 1", "primaryMemoryAcceptance: false", "browserConversionsPerformed: 0"])
      assert.ok(driver.generated.includes(token), token);
    for (const source of [driver.generated, recipe.generated]) {
      const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
      assert.equal(checked.status, 0, checked.stderr);
    }
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
