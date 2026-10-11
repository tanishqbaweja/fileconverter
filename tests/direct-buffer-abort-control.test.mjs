import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { createDirectBufferAllocatorAbortCapture, DIRECT_BUFFER_DECODER_SHA256 } from "../scripts/lib/direct-buffer-allocator-abort-capture.mjs";
import { makeDirectBufferExportControlRecipe, inspectDirectBufferExportControl } from "../scripts/lib/direct-buffer-export-only-control.mjs";
import { makeDirectBufferControlBrowserRecipe } from "../scripts/lib/direct-buffer-control-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const settings = { qualifiedBinarySha256: DIRECT_BUFFER_DECODER_SHA256, actualAllocatorRoot: 1786520,
  avBufferAlloczFunctionIndex: 4187, avMallocFunctionIndex: 4311, builtinMallocFunctionIndex: 4435 };
function heapFixture() {
  const heap = new Uint8Array(33554432), view = new DataView(heap.buffer), set = (at, value) => view.setUint32(at, value, true);
  const allocator = 1786520;
  set(allocator + 12, 1048568); set(allocator + 16, 2097152); set(allocator + 24, 3145728);
  set(3145732, 1048569); set(allocator + 432, 2097152); set(allocator + 472, 2097152); set(allocator + 476, 2097152);
  return { core: { HEAPU8: heap }, set };
}
function syntheticStack(action) {
  const OriginalError = globalThis.Error;
  class SyntheticError extends OriginalError {
    constructor(message) { super(message); this.stack = "SYNTHETIC UNIT ONLY wasm-function[4187] wasm-function[4311] wasm-function[4435]"; }
  }
  globalThis.Error = SyntheticError; try { action(OriginalError); } finally { globalThis.Error = OriginalError; }
}
test("direct-buffer failure observer reads headers once only on qualified fatal path and retains native error", () => syntheticStack(OriginalError => {
  const { core } = heapFixture(), before = core.HEAPU8.slice(); let reads = 0, emits = 0;
  const capture = createDirectBufferAllocatorAbortCapture({ ...settings, getCore: () => { reads++; return core; }, emit: () => { emits++; } });
  assert.equal(reads, 0); assert.equal(capture.report().first, null);
  const fatal = new OriginalError("prior fatal");
  assert.throws(() => capture.withPriorOnAbort(() => { throw fatal; })("synthetic reason"), error => error === fatal);
  capture.onAbort("second ignored"); assert.equal(reads, 1); assert.equal(emits, 1); assert.deepEqual(core.HEAPU8, before);
  const row = capture.report().first; assert.equal(row.allocatorFreeBlocksUnavailable, null);
  assert.equal(row.allocatorFreeBlocks.totalFreeChunkBytes, 1048568); assert.equal(row.qualifiedDirectBufferCallPath, true);
  for (const field of ["failedIndividualAllocationBytes", "heapLiveBytes", "poolRequest"]) assert.equal(row[field], null);
  assert.equal(row.fragmentationCauseProven, false); assert.equal(row.originalFailureCauseProven, false);
  assert.equal(capture.report().nativeErrorSuppressed, false); assert.equal(capture.report().queuedRecords, 0);
}));
test("unqualified paths never read heap; wrong exact core/root/function indices cannot start", () => {
  let reads = 0; const args = { ...settings, getCore: () => { reads++; throw new Error("must not read"); }, emit: () => {} };
  const capture = createDirectBufferAllocatorAbortCapture(args); capture.onAbort("JS-only abort");
  assert.equal(reads, 0); assert.equal(capture.report().first.qualifiedDirectBufferCallPath, false);
  assert.equal(capture.report().first.allocatorFreeBlocks, null); assert.match(capture.report().first.allocatorFreeBlocksUnavailable, /not read/);
  for (const field of Object.keys(settings)) assert.throws(() => createDirectBufferAllocatorAbortCapture({ ...args, [field]: null }));
});
test("corrupt headers remain unavailable, emitter failure never swallows original fatal callback", () => syntheticStack(() => {
  const { core, set } = heapFixture(); set(3145732, 1048571); let previous = 0;
  const capture = createDirectBufferAllocatorAbortCapture({ ...settings, getCore: () => core, emit: () => { throw new Error("synthetic emitter failure"); } });
  capture.withPriorOnAbort(() => { previous++; })("synthetic reason"); assert.equal(previous, 1);
  assert.equal(capture.report().first.allocatorFreeBlocks, null); assert.match(capture.report().first.allocatorFreeBlocksUnavailable, /state inconsistent/);
  assert.match(capture.report().emitFailure, /emitter failure/);
}));
test("actual current-core export-only derivative preserves all original section/code/data/import/memory checks", async () => {
  const source = (await read("scripts/lib/refstruct-export-only-control.mjs")).toString(), recipe = makeDirectBufferExportControlRecipe(source);
  let reverse = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, source); assert.throws(() => makeDirectBufferExportControlRecipe(source + "\n"));
  const runtime = await createOwnedRuntimeScratch("unit-direct-buffer-control-");
  try {
    const generated = recipe.generated.replace('from "./wasm-function-metadata.mjs"', `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/wasm-function-metadata.mjs")).href)}`);
    const file = path.join(runtime.directory, "factory.mjs"); await writeFile(file, generated, { flag: "wx" });
    const factory = await import(pathToFileURL(file).href);
    const binary = await read("work/mpeg2-single-idle-37986418102/within-mpeg2-split.wasm"), control = factory.createDirectBufferExportOnlyControl(binary);
    inspectDirectBufferExportControl(control); assert.equal(sha(binary), DIRECT_BUFFER_DECODER_SHA256);
    assert.equal(control.additions[0].functionIndex, 4187); assert.equal(control.sections.filter(row => row.originalSha256 !== row.outputSha256).length, 1);
    const base = (await read("scripts/check-wasm-abort-capture-origin-checked.mjs")).toString();
    const next = makeDirectBufferControlBrowserRecipe(base, root, path.join(runtime.directory, "control.wasm"), control, "2026-10-11T00-00-00-000Z");
    let backwards = next.generated; for (const [before, after] of next.edits.toReversed()) backwards = backwards.replace(after, before);
    assert.equal(backwards, base);
    const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: next.generated, encoding: "utf8", windowsHide: true });
    assert.equal(syntax.status, 0, syntax.stderr);
    for (const token of ['--headless=new', 'windowsHide: true', 'classifyPrivateRequest(detail, origin)', 'Unchanged2GiB host preflight',
      'allSampledNativeBirthsAbsent', 'runtimeProfileRemoved', 'nativeErrorSuppressed, false', 'syntheticRequestedAllocationBytes',
      'allocatorFreeBlocksUnavailable,null', 'browserConversionsPerformed: 0', 'protectedSourceRead: false']) assert.ok(next.generated.includes(token), token);
    assert.throws(() => makeDirectBufferControlBrowserRecipe(base, root, path.join(root, "not-work/control.wasm"), control, "2026-10-11T00-00-00-000Z"));
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
