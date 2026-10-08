// Synthetic browser prerequisite, never media acceptance. Reuse audited cleanup.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createRefstructExportOnlyControl } from "./lib/refstruct-export-only-control.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "scripts/check-wasm-abort-capture-origin-checked.mjs";
const source = await readFile(path.join(root, sourcePath), "utf8");
const previous = JSON.parse(await readFile(path.join(root, "evidence/wasm-abort-capture-control-origin-checked-2026-10-08.json")));
assert.equal(sha(source), previous.sourcePins[sourcePath]);
const control = createRefstructExportOnlyControl(await readFile(path.join(root, "work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.wasm")));
const getterIndex = control.selected.find(row => row.name === "av_refstruct_pool_get").functionIndex;
const mallocIndex = control.selected.find(row => row.name === "av_malloc").functionIndex;
const worker = `import decoderFactory from "/decoder.mjs";
import {createLatePoolAbortCapture} from "/late-pool-abort-capture.mjs";
let core, actualExports, emitted=null, originalCalls=0;
const capture=createLatePoolAbortCapture({getCore:()=>core,emit:row=>{emitted=row;},
  poolGetterFunctionIndex:${getterIndex},avMallocFunctionIndex:${mallocIndex}});
const slot=()=>Array.from({length:16},(_,i)=>new DataView(core.HEAPU8.buffer,core.withinRefstructAbortSnapshotAddress,64).getUint32(i*4,true));
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
      if(core.HEAPU8.byteLength!==33554432||core.withinRefstructAbortSnapshotWords!==16||
         !Number.isInteger(core.withinRefstructAbortSnapshotAddress))throw new Error("Actual heap/slot binding unavailable");
      self.postMessage({phase:"loaded",heapBytes:core.HEAPU8.byteLength,
        shared:core.HEAPU8.buffer instanceof SharedArrayBuffer,originIsolated:self.crossOriginIsolated,
        capture:capture.report(),stackLimit:Error.stackTraceLimit??null,slotAddress:core.withinRefstructAbortSnapshotAddress});
    }else if(event.data==="synthetic-oom") {
      const beforeLimit=Error.stackTraceLimit??null;let failure=null;
      const pool=actualExports.control_pool_alloc(1024,0);if(!pool)throw new Error("Small synthetic pool unavailable");
      const entries=new Array(80);
      for(let i=0;i<80;i++) {
        entries[i]=actualExports.control_pool_get(pool);if(!entries[i])throw new Error("Small synthetic entry unavailable");
      }
      const after80=slot();if(after80[2]!==80||after80[3]!==2||after80[8]!==79)throw new Error("After48 actual state differs");
      const pointer=actualExports.malloc(4), view=new DataView(core.HEAPU8.buffer);
      view.setUint32(pointer,entries[0],true);actualExports.control_unref(pointer);
      if(view.getUint32(pointer,true)!==0)throw new Error("Native unref caller contract differs");
      const reused=actualExports.control_pool_get(pool);
      const cacheReuseVerified=reused===entries[0]&&slot()[2]===80;
      if(!cacheReuseVerified)throw new Error("Actual cache reuse added a fresh request");
      actualExports.free(pointer);
      const fresh=actualExports.control_pool_get(pool);if(!fresh||slot()[2]!==81)throw new Error("Fresh request81 missing");
      const failedPool=actualExports.control_pool_alloc(33554432,0);if(!failedPool)throw new Error("Large-request synthetic pool unavailable");
      try{actualExports.control_pool_get(failedPool);}catch(error){failure={message:String(error.message).slice(0,1024),stack:String(error.stack).slice(0,8192)};}
      self.postMessage({phase:"terminal",heapBytes:core.HEAPU8.byteLength,originalCalls,capture:capture.report(),emitted,
        beforeLimit,afterLimit:Error.stackTraceLimit??null,failure,failedPool,cacheReuseVerified,after80,
        successfulFreshRequests:81,syntheticRequestedAllocationBytes:33554448,
        syntheticFunctionCall:"export-only actual compiled av_refstruct_pool_get",converterInvoked:false});
    }else throw new Error("Unexpected control command");
  }catch(error){self.postMessage({phase:"control-error",message:String(error).slice(0,2048)});}
};`;
const runtime = await createOwnedRuntimeScratch("late-pool-control-driver-");
try {
  const controlPath = path.join(runtime.directory, "export-only-control.wasm");
  await writeFile(controlPath, control.binary, { flag: "wx" });
  const workerStart = source.indexOf("const workerSource = `"), workerEnd = source.indexOf("const files = new Map([");
  assert.ok(workerStart > 0 && workerEnd > workerStart);
  const oldWorker = source.slice(workerStart, workerEnd);
  const controlFacts = { ...control, binary: undefined };
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;', `const root = ${JSON.stringify(root)}, MiB = 1048576;\nconst exportOnlyControl = ${JSON.stringify(controlFacts)};`],
    ["work/mpeg2-split-pipeline-37479749443", "work/mpeg2-split-pipeline-37739125738"],
    ["evidence/wasm-abort-capture-control-origin-checked-2026-10-08.json", "evidence/late-pool-abort-control-2026-10-08.json"],
    [oldWorker, `const workerSource = ${JSON.stringify(worker)};\n`],
    ['["/decoder.wasm", [path.join(candidate, "within-mpeg2-split.wasm"), "application/wasm"]]',
      `["/decoder.wasm", [${JSON.stringify(controlPath)}, "application/wasm"]]`],
    ['  ["/capture.mjs", [path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "text/javascript"]],',
      '  ["/capture.mjs", [path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "text/javascript"]],\n' +
      '  ...["bounded-wasm-abort-capture.mjs","late-refstruct-abort-snapshot.mjs","late-pool-abort-capture.mjs"].map(file=>["/"+file,[path.join(root,"scripts/lib",file),"text/javascript"]]),'],
    ['  assert.equal(terminal.phase, "terminal", JSON.stringify(terminal));',
      `  assert.equal(terminal.phase, "terminal", JSON.stringify(terminal));
  assert.equal(terminal.successfulFreshRequests,81);assert.equal(terminal.cacheReuseVerified,true);
  assert.equal(terminal.emitted.latePoolRequestUnavailable,null);
  assert.equal(terminal.emitted.latePoolRequest.sequence,82);
  assert.equal(terminal.emitted.latePoolRequest.observedPoolAddress,terminal.failedPool);
  assert.equal(terminal.emitted.latePoolRequest.payloadBytes,33554432);
  assert.equal(terminal.emitted.latePoolRequest.refcountHeaderBytes,16);
  assert.equal(terminal.emitted.latePoolRequest.failedIndividualAllocationBytes,33554448);
  assert.equal(terminal.emitted.latePoolRequest.liveEntriesBeforeRequest,0);
  assert.equal(terminal.emitted.latePoolRequest.cachedEntriesInRequestedPoolBeforeRequest,0);`],
    ['  const actual = await readFile(path.join(candidate, "within-mpeg2-split.wasm"));', `  const actual = await readFile(${JSON.stringify(controlPath)});`],
    ['["scripts/check-wasm-abort-capture-origin-checked.mjs",', '["scripts/check-late-pool-abort-control.mjs", "scripts/lib/refstruct-export-only-control.mjs", "scripts/lib/late-pool-abort-capture.mjs", "scripts/lib/late-refstruct-abort-snapshot.mjs", "scripts/check-wasm-abort-capture-origin-checked.mjs",'],
    ['  result, snapshots, nativeIdentities, failure,', '  exportOnlyControl, result, snapshots, nativeIdentities, failure,'],
    ['"Actual unchanged decoder binary in dedicated Chromium worker, intentional SYNTHETIC32MiB malloc request; no media/converter"',
      '"Synthetic browser-only export-section derivative; actual compiled pool/get/unref/code/data/heap unchanged,81 fresh requests then request82 OOM; NEVER media converter or acceptance"'],
    ['"This controls only the failure hook and binary-name join. Synthetic malloc is NOT the old106112frame HEVC allocation, its size, live heap or original cause. Snapshot samples are NOT stable blank/continuous peak/250MiB conversion acceptance."',
      '"Synthetic export-only control is never staged or used for media; only export section changed, all actual compiled functions/data/types/imports/memory byte-exact. Request82 proves late failure capture, NOT actual original failure size/pool/cause or stable blank/continuous memory/250MiB acceptance."'],
  ];
  let generated = source;
  for (const [before, after] of patches) {
    assert.equal(generated.split(before).length, 2, before.slice(0, 128)); generated = generated.replace(before, after);
  }
  let reverse = generated;
  for (const [before, after] of patches.toReversed()) {
    assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before);
  }
  assert.equal(reverse, source, "Native identity/privacy/browser cleanup path preserved exactly");
  generated = generated.replace(/from "(\.\/lib\/[^"]+)"/g, (_match, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
  const target = path.join(runtime.directory, "driver.mjs"); await writeFile(target, generated, { flag: "wx" });
  await import(pathToFileURL(target).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
