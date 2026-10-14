// Reuse exact audited Chrome birth/privacy/normal-close/finally orchestration.
// Only control worker/exports/diagnostic assertions/owned identity change.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { REALLOC_DECODER_SHA256 } from "./realloc-attempt-abort-capture.mjs";
export const REALLOC_CONTROL_FILES = ["scripts/check-realloc-abort-control.mjs", "scripts/lib/realloc-control-browser-recipe.mjs",
  "scripts/lib/realloc-attempt-abort-capture.mjs", "scripts/lib/realloc-composite-abort-capture.mjs", "scripts/lib/realloc-export-only-control.mjs",
  "scripts/lib/realloc-native-envelope.mjs", "tests/realloc-abort-control.test.mjs"];
export function makeReallocControlBrowserRecipe(source, root, controlPath, control, stamp) {
  assert.equal(sha(source), "17fbe2c4a2e84cc28881c5bfacd88808de6a118e0d0164e8dd23466d6aaebe04");
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/); assert.equal(control.originalSha256, REALLOC_DECODER_SHA256);
  assert.equal(control.onlyExportSectionChanged, true); assert.equal(control.allCodeDataTypesImportsTablesMemoryExact, true); assert.equal(control.usableForMediaOrAcceptance, false);
  const relative = path.relative(path.join(root, "work"), controlPath); assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const worker = `import decoderFactory from "/decoder.mjs";
import {createReallocAbortCapture} from "/realloc-composite-abort-capture.mjs";
let core,actualExports,emitted=null,originalCalls=0;
const capture=createReallocAbortCapture({getCore:()=>core,emit:row=>{emitted=row;},qualifiedBinarySha256:${JSON.stringify(REALLOC_DECODER_SHA256)}});
self.onmessage=async event=>{
  try{
    if(event.data==="load"){
      core=await decoderFactory({locateFile:()=>"/decoder.wasm",print:()=>{},printErr:()=>{},
        onAbort:capture.withPriorOnAbort(()=>{originalCalls++;}),
        instantiateWasm(imports,receive){WebAssembly.instantiateStreaming(fetch("/decoder.wasm"),imports).then(result=>{
          actualExports=result.instance.exports;receive(result.instance,result.module);
        },error=>self.postMessage({phase:"control-error",message:String(error).slice(0,2048)}));return {};}});
      self.postMessage({phase:"loaded",heapBytes:core.HEAPU8.byteLength,shared:core.HEAPU8.buffer instanceof SharedArrayBuffer,
        originIsolated:self.crossOriginIsolated,capture:capture.report(),stackLimit:Error.stackTraceLimit??null,
        runtimeSlotAddress:core.withinReallocAttemptAddress,runtimeSlotWords:core.withinReallocAttemptWords});
    }else if(event.data==="synthetic-oom"){
      const beforeLimit=Error.stackTraceLimit??null;let failure=null;
      const pointer=actualExports.control_malloc(4);
      if(!Number.isInteger(pointer)||pointer<=0||pointer+4>core.HEAPU8.byteLength)throw new Error("Owned four-byte control cell unavailable");
      new DataView(core.HEAPU8.buffer).setUint32(pointer,0,true);
      try{actualExports.control_buffer_realloc(pointer,33554432);}catch(error){failure={message:String(error.message).slice(0,1024),stack:String(error.stack).slice(0,8192)};}
      self.postMessage({phase:"terminal",heapBytes:core.HEAPU8.byteLength,originalCalls,capture:capture.report(),emitted,beforeLimit,
        afterLimit:Error.stackTraceLimit??null,failure,syntheticRequestedAllocationBytes:33554432,
        syntheticFunctionCall:"export-only actual compiled __wrap_av_buffer_realloc",controlCellBytes:4,
        controlCellReleasedByWorkerTermination:true,converterInvoked:false});
    }else throw new Error("Unexpected control command");
  }catch(error){self.postMessage({phase:"control-error",message:String(error).slice(0,2048)});}
};`;
  const start = source.indexOf("const workerSource = `"), end = source.indexOf("const files = new Map(["); assert.ok(start > 0 && end > start);
  const oldWorker = source.slice(start, end), controlFacts = { ...control, binary: undefined };
  const edits = [
    ['const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;', `const root = ${JSON.stringify(root)}, MiB = 1048576;\nconst exportOnlyControl = ${JSON.stringify(controlFacts)};`],
    ["work/mpeg2-split-pipeline-37479749443", "work/mpeg2-realloc-attempt-38526781934"],
    ["evidence/wasm-abort-capture-control-origin-checked-2026-10-08.json", `evidence/${stamp}-realloc-abort-control.json`],
    [oldWorker, `const workerSource = ${JSON.stringify(worker)};\n`],
    ['["/decoder.wasm", [path.join(candidate, "within-mpeg2-split.wasm"), "application/wasm"]]', `["/decoder.wasm", [${JSON.stringify(controlPath)}, "application/wasm"]]`],
    ['  ["/capture.mjs", [path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "text/javascript"]],',
      '  ["/capture.mjs", [path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "text/javascript"]],\n' +
      '  ...["bounded-wasm-abort-capture.mjs","dlmalloc-free-header-inspection.mjs","realloc-attempt-abort-capture.mjs","realloc-composite-abort-capture.mjs"].map(file=>["/"+file,[path.join(root,"scripts/lib",file),"text/javascript"]]),'],
    ['  assert.equal(loaded.phase, "loaded", JSON.stringify(loaded));', '  assert.equal(loaded.phase, "loaded", JSON.stringify(loaded));\n  assert.equal(loaded.runtimeSlotAddress,1918912);assert.equal(loaded.runtimeSlotWords,16);'],
    ['  assert.equal(terminal.phase, "terminal", JSON.stringify(terminal));', `  assert.equal(terminal.phase, "terminal", JSON.stringify(terminal));
  assert.equal(terminal.emitted.qualifiedReallocCallPath,true);assert.equal(terminal.emitted.qualifiedBufferReallocCallPath,true);
  assert.equal(terminal.emitted.reallocAttemptUnavailable,null);assert.equal(terminal.emitted.allocationApiRequestedBytes,33554432);
  assert.equal(terminal.emitted.reallocAttempt.outerBufferScope,true);assert.equal(terminal.emitted.reallocAttempt.reallocPointerAddress,0);
  assert.equal(terminal.emitted.reallocAttempt.outerRequestedBytes,33554432);assert.equal(terminal.emitted.reallocAttempt.oldBufferRefAddress,0);
  assert.equal(terminal.emitted.validatedScalarWords,16);assert.equal(terminal.emitted.maximumScalarWords,16);
  assert.equal(terminal.emitted.allocatorFreeBlocksUnavailable,null);
  const inventory=terminal.emitted.allocatorFreeBlocks;
  assert.equal(inventory.complete,true);assert.equal(inventory.heapCopied,false);assert.equal(inventory.payloadRead,false);
  assert.equal(inventory.nativeFunctionsCalled,false);assert.equal(inventory.allocatorMutated,false);assert.equal(inventory.fragmentationCauseProven,false);
  assert.ok(inventory.headerWordsRead>0&&inventory.headerWordsRead<=32768);assert.ok(inventory.freeChunks>0&&inventory.freeChunks<=4096);
  assert.ok(inventory.largestFreeChunkBytes<terminal.syntheticRequestedAllocationBytes);
  assert.equal(terminal.emitted.failedIndividualAllocationBytes,null);assert.equal(terminal.emitted.heapLiveBytes,null);
  assert.equal(terminal.converterInvoked,false);assert.equal(terminal.controlCellBytes,4);`],
    ['  const actual = await readFile(path.join(candidate, "within-mpeg2-split.wasm"));', `  const actual = await readFile(${JSON.stringify(controlPath)});`],
    ['["scripts/check-wasm-abort-capture-origin-checked.mjs",', '[' + REALLOC_CONTROL_FILES.map(file => JSON.stringify(file) + ',').join('') + '"scripts/check-wasm-abort-capture-origin-checked.mjs",'],
    ['  result, snapshots, nativeIdentities, failure,', '  exportOnlyControl, result, snapshots, nativeIdentities, failure,'],
    ['"Actual unchanged decoder binary in dedicated Chromium worker, intentional SYNTHETIC32MiB malloc request; no media/converter"',
      '"Export-only actual qualified realloc decoder/code/data/imports/types/memory unchanged; synthetic AVBuffer NULL-cell realloc failure, NEVER media acceptance"'],
    ['"This controls only the failure hook and binary-name join. Synthetic malloc is NOT the old106112frame HEVC allocation, its size, live heap or original cause. Snapshot samples are NOT stable blank/continuous peak/250MiB conversion acceptance."',
      '"Synthetic realloc fatal controls runtime constructor/path/scalar/header observation only, NOT original Matroska realloc request, lifetime, fragmentation or complete-tree250MiB acceptance."'],
    ['"wasm-abort-control-"', '"realloc-abort-control-browser-"'],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before.slice(0,128)); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, source, "All privacy/native-birth/normal-close/finally/no-memory-acceptance gates retained exact");
  const imports = [];
  for (const match of generated.matchAll(/from "(\.\/lib\/[^"\r\n]+)"/g)) imports.push([match[0], `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`]);
  for (const [before, after] of imports) generated = generated.replace(before, after);
  return { generated, generatedSha256: sha(generated), edits: [...edits,...imports], worker, workerSha256: sha(worker), exportOnlyControl: controlFacts, publicAcceptance: false };
}
