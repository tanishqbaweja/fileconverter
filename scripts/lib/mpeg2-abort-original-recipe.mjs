// Failure-only served adapter derivative; no core, quality, I/O or gate changes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeFlexOriginalDriver } from "./mpeg2-flex-original-recipe.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const ABORT_HELPER_SHA256 = "8726ca6eaba04736fa97f5f3b0483548d92550464c331b3397e3b383728a391e";
export const SPLIT_STAGER_SHA256 = "2526f8900924e062659bfe1dabc185a81e7d1c668dce0a8a8e4007da8ee6ca60";
export function extractPinnedSplitAdapter(stager) {
  assert.equal(sha(stager), SPLIT_STAGER_SHA256);
  const start = "const adapter = `", end = "`;\nconst replacing = ";
  assert.equal(stager.split(start).length, 2); assert.equal(stager.split(end).length, 2);
  const adapter = stager.slice(stager.indexOf(start) + start.length, stager.indexOf(end));
  assert.ok(Buffer.byteLength(adapter) < 16384); return adapter;
}
export function makeAbortSplitAdapter(adapter, helper) {
  assert.equal(sha(helper), ABORT_HELPER_SHA256, "Only actually browser-tested helper bytes");
  assert.equal(helper.split("export function ").length, 2);
  const prefix = helper.replace("export function ", "function ") + "\n";
  const patches = [
    ['  let encoder, session, core, maximumMediaAvioWriteBytes = 0;', `  let encoder, session, core, maximumMediaAvioWriteBytes = 0;
  const emitAbort = row => console.debug("WITHIN_BOUNDED_WASM_ABORT " + JSON.stringify(row));
  const decoderAbort = createBoundedWasmAbortCapture({role: "decoder", emit: emitAbort});
  const encoderAbort = createBoundedWasmAbortCapture({role: "encoder", emit: emitAbort});`],
    ['encoderFactory({ locateFile:', 'encoderFactory({ onAbort: encoderAbort.withPriorOnAbort(undefined), locateFile:'],
    ['core = await decoderFactory({...options, withinBridge, withinSplit: session,',
      'core = await decoderFactory({...options, withinBridge, withinSplit: session,\n      onAbort: decoderAbort.withPriorOnAbort(options.onAbort),'],
  ];
  let result = adapter;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of [...patches].reverse()) { assert.equal(reversed.split(after).length, 2, after); reversed = reversed.replace(after, before); }
  assert.equal(reversed, adapter, "Only explicit inactive-until-failure observers");
  return prefix + result;
}
export function makeAbortOriginalDriver(source, root, resolvePackage, adapter, helper) {
  const prior = makeFlexOriginalDriver(source, root, resolvePackage);
  const changedAdapter = makeAbortSplitAdapter(adapter, helper);
  const route = `  await context.route(url => url.origin === origin &&
    ["/engines/remux/within-remux.mjs", "/engines/remux/within-mpeg4.mjs", "/engines/remux/within-direct.mjs"].includes(url.pathname), async route => {
    try {
      assert.equal(route.request().method(), "GET"); assert.equal(route.request().postData(), null);
      const response = await route.fetch(), actual = await response.text();
      assert.equal(response.status(), 200); assert.ok(Buffer.byteLength(actual) < 16384);
      assert.equal(createHash("sha256").update(actual).digest("hex"), ${JSON.stringify(sha(adapter))}, "Exact served original adapter");
      assert.ok(abortDiagnostic.staticAssets.length < 16);
      abortDiagnostic.staticAssets.push({url:route.request().url(),beforeSha256:${JSON.stringify(sha(adapter))},
        afterSha256:${JSON.stringify(sha(changedAdapter))},beforeBytes:Buffer.byteLength(actual),afterBytes:${Buffer.byteLength(changedAdapter)}});
      await route.fulfill({response,body:${JSON.stringify(changedAdapter)}});
    } catch(error) { abortDiagnostic.interceptionError = String(error).slice(0,1024); await route.abort("failed"); }
  });
  page.on("console", message => {
    const text = message.text(), prefix = "WITHIN_BOUNDED_WASM_ABORT ";
    if(!text.startsWith(prefix)) return;
    try {
      assert.ok(text.length <= 65536); assert.ok(abortDiagnostic.records.length < 8);
      const row = JSON.parse(text.slice(prefix.length));
      assert.ok(["decoder","encoder"].includes(row.role));
      assert.ok(typeof row.reason === "string" && row.reason.length <= 512);
      assert.ok(typeof row.stack === "string" && row.stack.length <= 8192);
      assert.equal(row.failedIndividualAllocationBytes,null); assert.equal(row.heapLiveBytes,null);
      abortDiagnostic.records.push(row);
    } catch(error) { abortDiagnostic.captureError = String(error).slice(0,1024); }
  });
  await page.goto("about:blank");`;
  const patches = [
    ['let startupSettlement = null;', `const abortDiagnostic = {records:[],maximumRecords:8,queuedRecords:0,staticAssets:[],
  interceptionError:null,captureError:null,noNormalNativeCalls:true,noForcedGc:true,noDebuggerPause:true,
  syntheticMallocInvoked:false,originalFailureCause:null,publicAcceptance:false,acceptanceWithheldForDiagnostic:true};
let startupSettlement = null;`],
    ['await page.goto("about:blank");\n  startupSettlement =', route + '\n  startupSettlement ='],
    ['    await observer.through(Date.now());\n    const conversionAt =',
      '    assert.equal(abortDiagnostic.interceptionError,null);\n    assert.ok(abortDiagnostic.staticAssets.length > 0);\n    await observer.through(Date.now());\n    const conversionAt ='],
    ['const sourceFiles = ["scripts/mpeg2-flex-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-abort-original-memory.mjs", "scripts/lib/mpeg2-abort-original-recipe.mjs", "scripts/lib/bounded-wasm-abort-capture.mjs", "scripts/check-wasm-abort-capture-origin-checked.mjs", "evidence/wasm-abort-capture-control-origin-checked-2026-10-08.json", "scripts/mpeg2-flex-original-memory.mjs",'],
    ['nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, failure,',
      'nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, abortDiagnostic, failure,'],
    ['-private-mpeg2-flex-original-native-100ms', '-private-mpeg2-abort-original-native-100ms'],
    ['"mpeg2-flex-original-runtime-"', '"mpeg2-abort-original-runtime-"'],
    ['Full protected original with measured equivalent dynamic-control flex CSS ONLY;',
      'Full protected original with measured equivalent dynamic-control flex CSS plus failure-only bounded onAbort stacks;'],
    ['  assert.deepEqual(forbiddenRequests, []);',
      '  assert.deepEqual(forbiddenRequests, []);\n  assert.equal(abortDiagnostic.captureError,null);\n  assert.equal(abortDiagnostic.interceptionError,null);'],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of [...patches].reverse()) { assert.equal(reversed.split(after).length, 2, after); reversed = reversed.replace(after, before); }
  assert.equal(reversed, prior, "All original-input/codec/quality/validation/repeat/primary-memory/cleanup gates identical");
  // No new Wasm, allocator sampling, synthetic malloc or worker polling.
  return result;
}
