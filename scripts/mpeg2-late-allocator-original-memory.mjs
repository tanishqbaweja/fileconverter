// ONE changed full original attempt; refuses to start until exact browser goldens exist.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeLateAllocatorAbortAdapter } from "./lib/mpeg2-late-allocator-abort-adapter.mjs";
const root=path.resolve(import.meta.dirname,".."),sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const read=file=>readFile(path.join(root,file),"utf8"),json=async file=>JSON.parse(await read(file));
const golden=await json("evidence/mpeg2-late-allocator-abort-golden-validation-2026-10-08.json");
assert.equal(golden.status,"passed-5-of-5-private-regression");
assert.equal(golden.originalCompiledCoreSha256,"3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
assert.equal(golden.syntheticExportControlUsedForMedia,false);
for(const[file,hash]of Object.entries(golden.sourcePins))assert.equal(sha(await read(file)),hash,file);
const {adapter:lateAdapter}=makeLateAllocatorAbortAdapter({
  stager:await read("scripts/stage-mpeg2-split-direct.mjs"),stackHelper:await read("scripts/lib/bounded-wasm-abort-capture.mjs"),
  snapshotHelper:await read("scripts/lib/late-refstruct-abort-snapshot.mjs"),poolHelper:await read("scripts/lib/late-pool-abort-capture.mjs"),
  controlProof:await json("evidence/late-pool-abort-control-2026-10-08.json"),
  allocatorHelper:await read("scripts/lib/late-pool-allocator-abort-capture.mjs"),freeHeaderHelper:await read("scripts/lib/dlmalloc-free-header-inspection.mjs"),
  allocatorControlProof:await json("evidence/late-pool-allocator-abort-control-2026-10-08.json"),
  layoutProof:await json("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json")});
const sourcePath="scripts/mpeg2-quiesced-budget-memory.mjs",source=await read(sourcePath);
const previous=await json("evidence/mpeg2-quiesced-budget-original-2026-10-08.json");
assert.equal(sha(source),previous.sourcePins[sourcePath]);
const patches=[
  ['const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;',`const root = ${JSON.stringify(root)}, MiB = 1048576;`],
  ["makeQuiescedBudgetDriver","makeLateAllocatorOriginalDriver"],
  ["./lib/mpeg2-quiesced-budget-recipe.mjs","./lib/mpeg2-late-allocator-original-recipe.mjs"],
  ["evidence/mpeg2-quiesced-budget-original-2026-10-08.json","evidence/mpeg2-late-allocator-original-2026-10-08.json"],
  ["mpeg2-split-pipeline-37479749443","mpeg2-split-pipeline-37739125738"],
  ["evidence/mpeg2-abort-golden-regression-2026-10-08.json","evidence/mpeg2-late-allocator-abort-golden-validation-2026-10-08.json"],
  ['assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], control.result.actualBinarySha256);',
    'assert.equal(manifest.artifacts["within-mpeg2-split.wasm"],"3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");'],
  ['adapter, helper,pathToFileURL(traceHelperPath).href);',`adapter, helper,pathToFileURL(traceHelperPath).href,${JSON.stringify(lateAdapter)});`],
  ["mpeg2-quiesced-budget-driver-","mpeg2-late-allocator-original-driver-"],
  ["-quiesced-budget-partial-blink-trace.json.gz","-late-allocator-original-partial-blink-trace.json.gz"],
  ["changed-quiesced-budget-original-preflight","changed-late-allocator-original-preflight"],
  ["terminal-private-full-original-quiesced-budget-diagnostic-not-acceptance","terminal-private-full-original-late-allocator-diagnostic-not-acceptance"],
  ['failedIndividualAllocationBytes:null,heapLiveBytes:null,causalOriginalAllocationSizeClaim:null',
    'failedIndividualAllocationBytes:row.latePoolRequest?.failedIndividualAllocationBytes??null,\n      latePoolRequest:row.latePoolRequest??null,allocatorFreeBlocks:row.allocatorFreeBlocks??null,\n      allocatorFreeBlocksUnavailable:row.allocatorFreeBlocksUnavailable??null,heapLiveBytes:null,causalOriginalAllocationSizeClaim:null'],
  ["Same proven staged adapter/abort capture PLUS", "Actual compiled3e744 normal core/controlled pending-pool and bounded allocator-header fatal observer PLUS"],
];
let generated=source;
for(const[before,after]of patches){assert.ok(generated.includes(before),before);generated=generated.replaceAll(before,after);}
let reverse=generated;
for(const[before,after]of patches.toReversed())reverse=reverse.replaceAll(after,before);
assert.equal(reverse,source,"Exact prior full-source/Disk/SHA/defaults/250MiB/repeats/independent-validation/finally behavior");
generated=generated.replace(/from "(\.\/lib\/[^\"]+)"/g,
  (_match,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
assert.ok(!process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR||process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR==="mpeg2-split-pipeline-37739125738");
const previousCandidate=process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR;
process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR="mpeg2-split-pipeline-37739125738";
const runtime=await createOwnedRuntimeScratch("mpeg2-late-allocator-original-wrapper-");
try{
  const target=path.join(runtime.directory,"full-source.mjs");await writeFile(target,generated,{flag:"wx"});
  await import(pathToFileURL(target).href);
}finally{
  await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});
  if(previousCandidate===undefined)delete process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR;
  else process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR=previousCandidate;
}
