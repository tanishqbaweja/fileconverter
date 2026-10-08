import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file),"utf8");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
test("failed actually executed goldens runner remains frozen, zero reports and finally removed, not replayed as success",async()=>{
  const proof=JSON.parse(await read("evidence/mpeg2-late-allocator-abort-goldens-2026-10-08.json"));
  assert.equal(proof.status,"failed-or-incomplete");assert.match(proof.failure,/ERR_MODULE_NOT_FOUND.*owned-runtime-scratch/);
  assert.deepEqual(proof.reports,[]);assert.equal(proof.ownedDriverRemoved,true);
  assert.deepEqual(proof.sourcePins,proof.postSourcePins);
  for(const[file,hash]of Object.entries(proof.sourcePins))assert.equal(sha(await read(file)),hash,file);
  assert.equal(proof.protectedOriginalRead,false);assert.equal(proof.publicAcceptance,false);
});
test("anchored rebasing leaves nested generator string literals unchanged and binds only real top-level imports",async()=>{
  const source=await read("scripts/validate-mpeg2-late-abort-goldens.mjs");
  const literal='generated = generated.replace(\'from "./lib/owned-runtime-scratch.mjs"\',';
  assert.equal(source.split(literal).length,2);
  const bound=source.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
    (_match,prefix,file)=>`${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
  assert.equal(bound.split(literal).length,2,"Nested generator's match remains exact");
  assert.match(bound,/import \{ createOwnedRuntimeScratch \} from "file:\/\//);
  assert.doesNotMatch(bound,/^import[^\r\n]*from "\.\/lib\//m);
  const unqualified=source.replace(/from "(\.\/lib\/[^\"]+)"/g,
    (_match,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
  assert.ok(!unqualified.includes(literal),"Historical broad replacement reproduces actual cause");
});
test("corrected outer driver generation parses and binds its module imports without host check, staging, browser or conversion",async()=>{
  let source=await read("scripts/validate-mpeg2-late-allocator-abort-goldens-origin-bound.mjs");
  const before='await import(pathToFileURL(target).href);';assert.equal(source.split(before).length,2);
  source=source.replace(before,`const {spawnSync}=await import("node:child_process");
const syntax=spawnSync(process.execPath,["--input-type=module","--check"],{input:generated,encoding:"utf8",windowsHide:true});
assert.equal(syntax.status,0,syntax.stderr);
assert.ok(!/^import[^\\r\\n]*from "\\.\\/lib\\//m.test(generated),"Actual outer imports must resolve from owned scratch");`);
  source=source.replace(/^const root=path.resolve\(import.meta.dirname,"\.\."\)/m,`const root=${JSON.stringify(root)}`);
  source=source.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
    (_match,prefix,file)=>`${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
  const runtime=await createOwnedRuntimeScratch("late-allocator-origin-bound-unit-");
  try{const file=path.join(runtime.directory,"check.mjs");await writeFile(file,source,{flag:"wx"});await import(pathToFileURL(file).href);}
  finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
});
test("new free-header goldens remain held on actual unsafe virtual availability; corrected proof cannot be replaced by old failed proof",async()=>{
  const hold=JSON.parse(await read("evidence/mpeg2-late-allocator-origin-bound-host-held-2026-10-08.json"));
  assert.equal(hold.subsequentReadOnlyConfirmation.safeToStart,false);
  assert.ok(hold.subsequentReadOnlyConfirmation.freeVirtualBytes<2147483648);
  assert.equal(hold.heldExactFreeVirtualBytes,null);assert.equal(hold.browserStarted,false);assert.equal(hold.conversions,0);
  const freezer=await read("scripts/freeze-mpeg2-late-allocator-abort-goldens.mjs");
  assert.match(freezer,/mpeg2-late-allocator-abort-goldens-origin-bound-2026-10-08\.json/);
});
test("actual corrected production suite and independent freeze preserve all output goldens, source pins and finally restoration",async()=>{
  const p=JSON.parse(await read("evidence/mpeg2-late-allocator-abort-golden-validation-2026-10-08.json"));
  assert.equal(p.status,"passed-5-of-5-private-regression");assert.equal(p.conversions.length,3);
  assert.equal(p.emptyCleanupInventories,5);assert.equal(p.privateAdditionsAbsent,true);
  assert.equal(p.nativeFullDecodePassed,true);assert.equal(p.recovery.length,2);
  for(const row of p.conversions){
    assert.equal(row.outputCodec,"mpeg2video");const hevc=row.sourceCodec==="hevc";
    assert.equal(row.frames,hevc?"96":"48");assert.equal(row.outputBytes,hevc?652521:321692);
    assert.equal(row.outputSha256,hevc?"6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32":"d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94");
    assert.equal(row.metrics.peakPendingOperations,1);assert.equal(row.metrics.peakWasmMemoryBytes,50331648);
  }
  for(const row of p.audioChecks)assert.deepEqual(row.sourceDecodedAudioHashes,row.outputDecodedAudioHashes);
  for(const row of p.recovery){assert.equal(row.status,"passed");assert.deepEqual(row.partialBytes,[]);}
  assert.equal(Object.keys(p.sourcePins).length,13);
  for(const[file,hash]of Object.entries(p.sourcePins))assert.equal(sha(await read(file)),hash,file);
  assert.equal(sha(await read("scripts/freeze-mpeg2-late-allocator-abort-goldens.mjs")),p.freezerSourceSha256);
  const envelopeRaw=await read(p.executionEnvelope.path),envelope=JSON.parse(envelopeRaw);
  assert.equal(sha(envelopeRaw),p.executionEnvelope.sha256);assert.equal(envelope.pinsUnchanged,true);
  assert.deepEqual(envelope.sourcePins,envelope.postSourcePins);
  assert.equal(envelope.reports.length,1);assert.equal(envelope.failure,null);
  assert.equal(sha(await read(p.rawReport.path)),p.rawReport.sha256);
  assert.equal(p.syntheticExportControlUsedForMedia,false);
  assert.equal(p.originalCompiledCoreSha256,"3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
  assert.equal(p.originalFullSourceAcceptance,false);assert.equal(p.completeChromiumMemoryAcceptance,false);
});
