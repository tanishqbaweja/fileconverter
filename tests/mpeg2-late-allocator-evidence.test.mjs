import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { makeLateAllocatorAbortAdapter } from "../scripts/lib/mpeg2-late-allocator-abort-adapter.mjs";
import { makeLateAllocatorOriginalDriver } from "../scripts/lib/mpeg2-late-allocator-original-recipe.mjs";
import { extractPinnedSplitAdapter } from "../scripts/lib/mpeg2-abort-original-recipe.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const read = file => readFile(new URL("../"+file,import.meta.url),"utf8");
const json = async file => JSON.parse(await read(file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("actual current Chrome failure inventories bounded native headers and cleans all sampled births, never original acceptance",async()=>{
  const p=await json("evidence/late-pool-allocator-abort-control-2026-10-08.json");
  assert.equal(p.status,"passed-synthetic-abort-control"); assert.equal(p.failure,null);
  const row=p.result.terminal.emitted, free=row.allocatorFreeBlocks;
  assert.equal(row.actualAllocatorRoot,1786520);assert.equal(row.latePoolRequest.sequence,82);
  assert.equal(row.allocatorFreeBlocksUnavailable,null);assert.equal(free.complete,true);
  assert.equal(free.headerWordsRead,169);assert.equal(free.freeChunks,42);
  assert.equal(free.totalFreeChunkBytes,3760);assert.equal(free.largestFreeChunkBytes,2776);
  assert.equal(free.dynamicFootprintBytes,90944);assert.equal(free.unclaimedMemoryAboveSegmentBytes,31281152);
  assert.equal(free.heapCopied,false);assert.equal(free.payloadRead,false);
  assert.equal(free.nativeFunctionsCalled,false);assert.equal(free.allocatorMutated,false);
  assert.equal(row.heapLiveBytes,null);assert.equal(row.fragmentationCauseProven,false);
  assert.equal(p.cleanup.checkedNativeIdentities,11);assert.equal(p.cleanup.allSampledNativeBirthsAbsent,true);
  assert.deepEqual(p.cleanup.errors,[]);assert.equal(p.cleanup.runtimeProfileRemoved,true);
  assert.equal(p.browserConversionsPerformed,0);assert.equal(p.protectedSourceRead,false);
  assert.equal(p.primaryMemoryAcceptance,false);assert.equal(p.publicAcceptance,false);
  for(const[file,hash]of Object.entries(p.sourcePins))assert.equal(sha(await read(file)),hash,file);
  assert.equal(sha(await read(p.allocatorLayoutProof.path)),p.allocatorLayoutProof.sha256);
});
test("production allocator observer adapter reverses to the previously executed adapter without native/media-control calls",async()=>{
  const args={stager:await read("scripts/stage-mpeg2-split-direct.mjs"),
    stackHelper:await read("scripts/lib/bounded-wasm-abort-capture.mjs"),
    snapshotHelper:await read("scripts/lib/late-refstruct-abort-snapshot.mjs"),
    poolHelper:await read("scripts/lib/late-pool-abort-capture.mjs"),
    controlProof:await json("evidence/late-pool-abort-control-2026-10-08.json"),
    allocatorHelper:await read("scripts/lib/late-pool-allocator-abort-capture.mjs"),
    freeHeaderHelper:await read("scripts/lib/dlmalloc-free-header-inspection.mjs"),
    allocatorControlProof:await json("evidence/late-pool-allocator-abort-control-2026-10-08.json"),
    layoutProof:await json("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json")};
  const result=makeLateAllocatorAbortAdapter(args);
  assert.ok(result.adapterBytes<32768);assert.equal(sha(result.adapter),result.adapterSha256);
  assert.match(result.adapter,/actualAllocatorRoot: 1786520/);
  assert.doesNotMatch(result.adapter,/control_pool_|control_unref|synthetic-oom/);
  const adapterSyntax=spawnSync(process.execPath,["--input-type=module","--check"],{input:result.adapter,encoding:"utf8",windowsHide:true});
  assert.equal(adapterSyntax.status,0,adapterSyntax.stderr);
  assert.throws(()=>makeLateAllocatorAbortAdapter({...args,allocatorHelper:args.allocatorHelper+"\n"}));
  assert.throws(()=>makeLateAllocatorAbortAdapter({...args,layoutProof:{...args.layoutProof,allocatorRootAddress:1786392}}));
  const root=path.resolve(import.meta.dirname,".."),source=await read("scripts/mpeg2-split-single-navigation-memory.mjs");
  const original=makeLateAllocatorOriginalDriver(source,root,s=>import.meta.resolve(s),
    extractPinnedSplitAdapter(args.stager),args.stackHelper,"file:///owned/trace-helper.mjs",result.adapter);
  for(const token of['const diagnosticOnly = false','6 * 60 * 60_000','minimumMs: 300000',
    'run.incrementalPrivateMiB <= 250','"test.mkv"','48 * MiB','0.98',
    'cancelBrowserConversionBeforeCleanup(page)','workers[0].once("close"',
    'scripts/stage-mpeg2-late-allocator-abort.mjs','makeLateSlotBuildWorkflow(canonical)',
    'assert.equal(hash,"d280472ff4421e744aa767d9d690a7b73d82a26951bb71446c3fb3d55cacd78d")'])assert.ok(original.includes(token),token);
  const syntax=spawnSync(process.execPath,["--input-type=module","--check"],{input:original,encoding:"utf8",windowsHide:true});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.throws(()=>makeLateAllocatorOriginalDriver(source+"\n",root,s=>import.meta.resolve(s),
    extractPinnedSplitAdapter(args.stager),args.stackHelper,"file:///owned/trace-helper.mjs",result.adapter));
});
test("prepared stager, browser runner and freezer derive parseable source without staging, browser or conversion",async()=>{
  const root=path.resolve(import.meta.dirname,".."),runtime=await createOwnedRuntimeScratch("late-allocator-generator-unit-");
  try{
    for(const file of["scripts/stage-mpeg2-late-allocator-abort.mjs","scripts/validate-mpeg2-late-allocator-abort-goldens.mjs",
      "scripts/freeze-mpeg2-late-allocator-abort-goldens.mjs"]){
      let source=await read(file);
      const before='await import(pathToFileURL(target).href);';
      assert.equal(source.split(before).length,2,file);
      source=source.replace(before,`const {spawnSync}=await import("node:child_process");
const syntax=spawnSync(process.execPath,["--input-type=module","--check"],{input:generated,encoding:"utf8",windowsHide:true});
assert.equal(syntax.status,0,syntax.stderr);`);
      const outer=/^const root\s*=\s*path\.resolve\(import\.meta\.dirname,\s*"\.\."\)/gm;
      assert.equal([...source.matchAll(outer)].length,1,file);
      source=source.replace(outer,`const root=${JSON.stringify(root)}`);
      source=source.replace(/from "(\.\/lib\/[^\"]+)"/g,
        (_match,relative)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",relative)).href)}`);
      const target=path.join(runtime.directory,path.basename(file));
      await writeFile(target,source,{flag:"wx"});await import(pathToFileURL(target).href);
    }
  }finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
});
test("ambiguous initial generator failure remains exact-source reconstructible and zero-browser",async()=>{
  const failure=await json("evidence/late-pool-allocator-control-preflight-failure-2026-10-08.json");
  const current=await read(failure.sourcePath);
  const before='  [\'const root = path.resolve(import.meta.dirname, ".."), sha =\', `const root = ${JSON.stringify(root)}, sha =`],';
  const after='  [\'path.resolve(import.meta.dirname, "..")\', JSON.stringify(root)],';
  assert.equal(current.split(before).length,2);assert.equal(sha(current.replace(before,after)),failure.executedSourceSha256);
  assert.equal(failure.browserStarted,false);assert.equal(failure.converterCalls,0);
});
