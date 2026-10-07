import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import test from "node:test";
const sha=b=>createHash("sha256").update(b).digest("hex");
const controls=await Promise.all(["blocked","quiesced"].map(async mode=>{
  const bytes=await readFile(new URL(`../evidence/partial-blink-${mode}-control-2026-10-08.json`,import.meta.url));
  const verification=JSON.parse(await readFile(new URL(`../evidence/partial-blink-${mode}-control-verification-2026-10-08.json`,import.meta.url)));
  return{mode,bytes,proof:JSON.parse(bytes),verification};
}));
test("blocked failed-global case retains partial records but refuses substituting other renderer heaps for target",()=>{
  const{proof:p,verification:v}=controls[0];assert.equal(p.failure,null);assert.deepEqual(p.errors,[]);
  assert.equal(p.traceReport.sessions[0].trace.dumps[0].memoryDump.success,false);
  assert.equal(v.globalDumpSucceeded,false);assert.equal(v.partialRecordsRecovered,true);assert.equal(v.processRecordCount,9);
  assert.equal(v.target.blinkHeapAvailable,false);assert.equal(v.target.blinkTypesAvailable,false);
  assert.equal(v.target.missingProvidersAreUnavailableNotZero,true);assert.equal(v.target.allocationObjectOrCallsite,null);
  assert.equal(v.target.privateFootprintBytes,310677504);
});
test("ordinary observed worker close recovers actual target providers without releasing synthetic storage or forcing GC",()=>{
  const{proof:p,verification:v}=controls[1];assert.equal(p.failure,null);assert.deepEqual(p.errors,[]);
  assert.equal(v.globalDumpSucceeded,true);assert.equal(v.target.blinkHeapAvailable,true);assert.equal(v.target.blinkTypesAvailable,true);
  assert.equal(v.quiescence.actualWorkerCloseObserved,true);assert.equal(v.quiescence.retainedSyntheticBytes,276824064);
  assert.equal(v.quiescence.noForcedGc,true);assert.equal(v.target.retainedKnownTypes,64);
  assert.equal(v.target.selection.inspectedRecords,567);assert.equal(v.target.selection.knownRecordsNotRetained,503);
  assert.equal(v.target.allocationObjectOrCallsite,null);assert.equal(v.publicAcceptance,false);
});
test("both actual controls pin executed/generated sources and independently verify cleanup without claiming original conversions",async()=>{
  for(const{bytes,proof:p,verification:v}of controls){
    assert.equal(v.input.sha256,sha(bytes));assert.equal(sha(p.generatedHelper),p.generatedHelperSha256);
    assert.equal(sha(p.executedGeneratedSource),p.executedGeneratedSourceSha256);
    for(const r of[p,v])for(const[file,hash]of Object.entries(r.sourcePins))assert.equal(sha(await readFile(new URL(`../${file}`,import.meta.url))),hash,file);
    assert.equal(p.traceStartsBeforeAllocation,0);assert.equal(p.traceStarts,1);assert.equal(p.originalRead,false);
    assert.equal(p.converterLoaded,false);assert.equal(p.conversionsPerformed,0);assert.equal(p.publicAcceptance,false);
    for(const value of Object.values(p.cleanup))assert.equal(value,true);
    assert.equal(v.cleanup.sampledNativeBirthsAbsent,true);assert.equal(v.rawTraceReconstructionAndReparseVerified,true);
  }
});
test("retained bounded archives reconstruct exact actual serialized traces with no whole-media buffering",async()=>{
  for(const{verification:v}of controls){
    const archive=await readFile(new URL(`../${v.rawArchive.path}`,import.meta.url));
    assert.equal(archive.length,v.rawArchive.bytes);assert.equal(sha(archive),v.rawArchive.sha256);
    const hash=createHash("sha256");let bytes=0;
    await pipeline(createReadStream(new URL(`../${v.rawArchive.path}`,import.meta.url),{highWaterMark:65536}),
      createGunzip({chunkSize:65536}),new Writable({highWaterMark:65536,write(chunk,encoding,done){
        bytes+=chunk.length;if(bytes>16*1048576)return done(new Error("Serialized trace cap exceeded"));hash.update(chunk);done();
      }}));
    assert.equal(bytes,v.serializedTrace.bytes);assert.equal(hash.digest("hex"),v.serializedTrace.sha256);
  }
});
