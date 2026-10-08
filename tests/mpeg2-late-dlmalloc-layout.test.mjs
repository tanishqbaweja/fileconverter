import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root=path.resolve(import.meta.dirname,".."),sha=bytes=>createHash("sha256").update(bytes).digest("hex");
test("actual new link map and compiled malloc independently agree on shifted root and all required ABI fields",async()=>{
  const proof=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json")));
  assert.equal(proof.allocatorRootAddress,1786520);assert.match(proof.mapSymbolLine,/1b4298\s+0\s+1f0\s+_gm_/);
  assert.equal(proof.binary.sha256,"3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
  assert.equal(proof.actualAllocatorFreeCapacityMeasured,false);assert.equal(proof.protectedOriginalRead,false);
  assert.equal(proof.browserConversions,0);assert.equal(proof.publicAcceptance,false);
  for(const field of ["smallmap","treemap","dvsize","topsize","leastAddress","dv","top","smallbins","treebins","footprint","flags","mutex","segment"])
    assert.equal(proof.allocatorLayoutReferences[field].referencedInActualFunction,true,field);
  assert.equal(proof.allocatorLayoutReferences.mutex.absoluteAddress,1786968);
  assert.equal(sha(await readFile(path.join(root,"scripts/audit-late-dlmalloc-layout.mjs"))),proof.sourceSha256);
  const raw=await readFile(path.join(root,proof.rawReport.path));assert.equal(sha(raw),proof.rawReport.sha256);
  assert.equal(JSON.parse(raw).sourceSha256,proof.generatedSourceSha256);assert.equal(JSON.parse(raw).failure,null);
  await assert.rejects(access(proof.driverRuntime),{code:"ENOENT"});await assert.rejects(access(proof.disassemblerRuntime),{code:"ENOENT"});
});
test("initial unavailable named fallback selection remains failed and its executed generator is reconstructible",async()=>{
  const failed=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-late-dlmalloc-layout-initial-failure-2026-10-08.json")));
  let source=await readFile(path.join(root,failed.executedSource),"utf8");
  const addition='  [\'const names = ["emscripten_builtin_malloc", "dlposix_memalign", "av_malloc"];\',\'const names = ["emscripten_builtin_malloc", "av_malloc"];\'],\n';
  assert.equal(source.split(addition).length,2);source=source.replace(addition,"");assert.equal(sha(source),failed.executedSourceSha256);
  const raw=JSON.parse(await readFile(path.join(root,failed.rawReport)));
  assert.match(raw.failure,/Selected function names unavailable/);assert.equal(raw.sourceSha256,failed.generatedSourceSha256);
  assert.equal(raw.inspection,null);assert.equal(raw.cleanup.runtimeRemoved,true);
  await assert.rejects(access(raw.runtimeDirectory),{code:"ENOENT"});
});
