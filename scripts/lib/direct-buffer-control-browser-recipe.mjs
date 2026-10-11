// Reuse the unchanged source-aware privacy, headless birth/close and finally gates.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { DIRECT_BUFFER_DECODER_SHA256 } from "./direct-buffer-allocator-abort-capture.mjs";
export const directBufferControlFiles = ["scripts/check-direct-buffer-abort-control.mjs",
  "scripts/lib/direct-buffer-control-browser-recipe.mjs", "scripts/lib/direct-buffer-export-only-control.mjs",
  "scripts/lib/direct-buffer-allocator-abort-capture.mjs", "scripts/lib/dlmalloc-free-header-inspection.mjs",
  "scripts/lib/refstruct-export-only-control.mjs", "scripts/lib/wasm-function-metadata.mjs",
  "tests/direct-buffer-abort-control.test.mjs", "evidence/mpeg2-single-idle-abort-layout-2026-10-10.json"];
export function makeDirectBufferControlBrowserRecipe(source, root, controlPath, control, stamp) {
  assert.equal(sha(source), "17fbe2c4a2e84cc28881c5bfacd88808de6a118e0d0164e8dd23466d6aaebe04");
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/);
  assert.equal(control.originalSha256, DIRECT_BUFFER_DECODER_SHA256);
  assert.equal(control.onlyExportSectionChanged, true); assert.equal(control.usableForMediaOrAcceptance, false);
  assert.ok(path.relative(path.join(root, "work"), controlPath) && !path.relative(path.join(root, "work"), controlPath).startsWith(".."));
  const worker = `import decoderFactory from "/decoder.mjs";
import {createDirectBufferAllocatorAbortCapture} from "/direct-buffer-allocator-abort-capture.mjs";
let core, actualExports, emitted=null, originalCalls=0;
const capture=createDirectBufferAllocatorAbortCapture({getCore:()=>core,emit:row=>{emitted=row;},
  qualifiedBinarySha256:${JSON.stringify(DIRECT_BUFFER_DECODER_SHA256)},actualAllocatorRoot:1786520,
  avBufferAlloczFunctionIndex:4187,avMallocFunctionIndex:4311,builtinMallocFunctionIndex:4435});
self.onmessage=async event=>{
  try {
    if(event.data==="load") {
      core=await decoderFactory({locateFile:()=>"/decoder.wasm",print:()=>{},printErr:()=>{},
        onAbort:capture.withPriorOnAbort(()=>{originalCalls++;}),
        instantiateWasm(imports,receive){
          WebAssembly.instantiateStreaming(fetch("/decoder.wasm"),imports).then(result=>{
            actualExports=result.instance.exports; receive(result.instance,result.module);
          },error=>self.postMessage({phase:"control-error",message:String(error).slice(0,2048)}));return {};
        }});
      if(core.HEAPU8.byteLength!==33554432)throw new Error("Actual fixed decoder heap changed");
      self.postMessage({phase:"loaded",heapBytes:core.HEAPU8.byteLength,
        shared:core.HEAPU8.buffer instanceof SharedArrayBuffer,originIsolated:self.crossOriginIsolated,
        capture:capture.report(),stackLimit:Error.stackTraceLimit??null});
    }else if(event.data==="synthetic-oom") {
      const beforeLimit=Error.stackTraceLimit??null;let failure=null;
      try{actualExports.control_buffer_allocz(33554432);}catch(error){failure={message:String(error.message).slice(0,1024),stack:String(error.stack).slice(0,8192)};}
      self.postMessage({phase:"terminal",heapBytes:core.HEAPU8.byteLength,originalCalls,capture:capture.report(),emitted,
        beforeLimit,afterLimit:Error.stackTraceLimit??null,failure,syntheticRequestedAllocationBytes:33554432,
        syntheticFunctionCall:"export-only actual compiled av_buffer_allocz",converterInvoked:false});
    }else throw new Error("Unexpected control command");
  }catch(error){self.postMessage({phase:"control-error",message:String(error).slice(0,2048)});}
};`;
  const start = source.indexOf("const workerSource = `"), end = source.indexOf("const files = new Map([");
  assert.ok(start > 0 && end > start); const oldWorker = source.slice(start, end);
  const controlFacts = { ...control, binary: undefined };
  const edits = [
    ['const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;',
      `const root = ${JSON.stringify(root)}, MiB = 1048576;\nconst exportOnlyControl = ${JSON.stringify(controlFacts)};`],
    ['work/mpeg2-split-pipeline-37479749443', 'work/mpeg2-single-idle-37986418102'],
    ['evidence/wasm-abort-capture-control-origin-checked-2026-10-08.json', `evidence/${stamp}-direct-buffer-abort-control.json`],
    [oldWorker, `const workerSource = ${JSON.stringify(worker)};\n`],
    ['["/decoder.wasm", [path.join(candidate, "within-mpeg2-split.wasm"), "application/wasm"]]',
      `["/decoder.wasm", [${JSON.stringify(controlPath)}, "application/wasm"]]`],
    ['  ["/capture.mjs", [path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "text/javascript"]],',
      '  ["/capture.mjs", [path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "text/javascript"]],\n' +
      '  ...["bounded-wasm-abort-capture.mjs","dlmalloc-free-header-inspection.mjs","direct-buffer-allocator-abort-capture.mjs"].map(file=>["/"+file,[path.join(root,"scripts/lib",file),"text/javascript"]]),'],
    ['  assert.equal(terminal.phase, "terminal", JSON.stringify(terminal));',
      `  assert.equal(terminal.phase, "terminal", JSON.stringify(terminal));
  assert.equal(terminal.emitted.qualifiedDirectBufferCallPath,true);
  assert.equal(terminal.emitted.allocatorFreeBlocksUnavailable,null);
  const inventory=terminal.emitted.allocatorFreeBlocks;
  assert.equal(inventory.complete,true);assert.equal(inventory.heapCopied,false);
  assert.equal(inventory.payloadRead,false);assert.equal(inventory.nativeFunctionsCalled,false);
  assert.equal(inventory.allocatorMutated,false);assert.equal(inventory.fragmentationCauseProven,false);
  assert.ok(inventory.headerWordsRead>0&&inventory.headerWordsRead<=32768);
  assert.ok(inventory.freeChunks>0&&inventory.freeChunks<=4096);
  assert.ok(inventory.totalFreeChunkBytes>=inventory.largestFreeChunkBytes);
  assert.ok(inventory.largestFreeChunkBytes<terminal.syntheticRequestedAllocationBytes);
  assert.equal(terminal.emitted.heapLiveBytes,null);assert.equal(terminal.emitted.failedIndividualAllocationBytes,null);
  assert.equal(terminal.emitted.poolRequest,null);`],
    ['  const actual = await readFile(path.join(candidate, "within-mpeg2-split.wasm"));', `  const actual = await readFile(${JSON.stringify(controlPath)});`],
    ['["scripts/check-wasm-abort-capture-origin-checked.mjs",',
      '[' + directBufferControlFiles.map(file => JSON.stringify(file) + ',').join('') + '"scripts/check-wasm-abort-capture-origin-checked.mjs",'],
    ['  result, snapshots, nativeIdentities, failure,', '  exportOnlyControl, result, snapshots, nativeIdentities, failure,'],
    ['"Actual unchanged decoder binary in dedicated Chromium worker, intentional SYNTHETIC32MiB malloc request; no media/converter"',
      '"Synthetic browser-only export-section derivative; actual compiled av_buffer_allocz/code/data/types/imports/memory unchanged; NEVER media converter or acceptance"'],
    ['"This controls only the failure hook and binary-name join. Synthetic malloc is NOT the old106112frame HEVC allocation, its size, live heap or original cause. Snapshot samples are NOT stable blank/continuous peak/250MiB conversion acceptance."',
      '"Direct-buffer synthetic OOM proves only failure-hook/header integration on current core; original HEVC failure size/free headers/retention/fragmentation remain unknown. Synthetic control is never staged for media; snapshots are NOT250MiB acceptance."'],
    ['"wasm-abort-control-"', '"direct-buffer-abort-control-browser-"'],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length - 1, 1, before.slice(0, 128)); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, source, "All source-aware privacy/error/birth/close/cleanup/buffer gates unchanged");
  const imports = [];
  for (const match of generated.matchAll(/from "(\.\/lib\/[^"\r\n]+)"/g)) {
    const after = `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`;
    imports.push([match[0], after]);
  }
  for (const [before, after] of imports) generated = generated.replace(before, after);
  return { generated, generatedSha256: sha(generated), edits: [...edits, ...imports], worker,
    workerSha256: sha(worker), exportOnlyControl: controlFacts, publicAcceptance: false };
}
