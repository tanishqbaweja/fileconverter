import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import test from "node:test";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const input=await readFile(new URL("../evidence/mpeg2-staged-abort-original-2026-10-08.json",import.meta.url));
const proof=JSON.parse(input);
const analysis=JSON.parse(await readFile(new URL("../evidence/mpeg2-staged-abort-terminal-analysis-2026-10-08.json",import.meta.url)));
const compact=JSON.parse(await readFile(new URL("../evidence/mpeg2-staged-abort-terminal-compaction-2026-10-08.json",import.meta.url)));

test("actual full-source attempt fails unchanged whole-tree ceiling before any Wasm abort",()=>{
  assert.equal(proof.rawStatus,"failed"); assert.match(proof.failure.message,/264\.2421875MiB exceeds 250MiB/);
  assert.equal(proof.blankBaseline.privateBytes,239501312); assert.equal(proof.nativePeak.privateBytes,516579328);
  assert.equal(proof.nativePeak.processes.reduce((sum,p)=>sum+p.privateBytes,0),516579328);
  assert.equal((proof.nativePeak.privateBytes-proof.blankBaseline.privateBytes)/1048576,264.2421875);
  assert.equal(proof.abortDiagnostic.stagedAdapters.length,3); assert.deepEqual(proof.abortDiagnostic.records,[]);
  assert.deepEqual(proof.actualStackSymbols,[]); assert.equal(analysis.heapOomOccurred,false);
  assert.equal(analysis.browserConversionsStarted,1); assert.equal(analysis.partialFreshFrames,1530);
  assert.equal(proof.completeOriginalConversions,0); assert.equal(proof.runs[0].independentValidation,null);
  assert.equal(proof.originalFullSourceMemoryAcceptance,false); assert.equal(proof.conversionSpeedAcceptance,false);
  assert.equal(proof.publicAcceptance,false); assert.equal(analysis.input.sha256,sha(input));
});

test("adjacent renderer burst identifies a birth-matched process, not a guessed allocator",()=>{
  const burst=analysis.adjacentBurst, deltas=burst.processDeltas.filter(p=>p.deltaPrivateBytes!==0);
  assert.equal(burst.beforeSequence,3457); assert.equal(burst.afterSequence,3458);
  assert.equal(burst.treeDeltaPrivateBytes,49987584); assert.equal(deltas.length,1);
  assert.equal(deltas[0].pid,47084); assert.equal(deltas[0].parentPid,37312);
  assert.equal(deltas[0].createdAt,"2026-10-07T19:17:33.1939275Z");
  assert.equal(deltas[0].type,"renderer"); assert.equal(deltas[0].observedCimTypeJoin,true);
  assert.equal(burst.allocationObjectOrCallsite,null);
  assert.equal(proof.nativeFailureCapture.callback.status,"completed");
  assert.equal(proof.nativeFailureCapture.callback.result.causalAllocationClaim,null);
  assert.equal(analysis.failureCollectorUnavailableSamples,1); assert.equal(analysis.unavailableIsNotZero,true);
});

test("partial encoding keeps fixed memory/backpressure and independently verified cleanup",()=>{
  const final=proof.splitFinalSamples[0], metrics=analysis.partialMetrics;
  assert.equal(final.frames,1530); assert.equal(final.completedPackets,1530); assert.equal(final.closed,true);
  assert.equal(final.aggregateWasmMemoryBytes,50331648);
  for(const key of["activePackets","queuedPackets","queuedFrames","additionalPixelBufferBytes","additionalJsPacketBufferBytes"])assert.equal(final[key],0);
  for(const key of["maxReadChunkBytes","maxWriteChunkBytes","peakQueuedBytes"])assert.equal(metrics[key],65536);
  assert.equal(metrics.peakPendingOperations,1); assert.equal(metrics.inputBytes,33187393); assert.equal(metrics.outputBytes,21727310);
  assert.equal(proof.cleanup.conversionQuiescence.terminalState,"cancelled");
  assert.equal(analysis.cleanup.checkedPids,25); assert.equal(analysis.cleanup.nativeIdentities,21);
  for(const key of["allSampledNativeBirthsAbsent","helperBirthsAbsent","bothRuntimeDirectoriesAbsent","ninePrivateAssetsAbsent","protectedFullPostHashVerified","noProcessesKilled"])assert.equal(analysis.cleanup[key],true);
});

test("all executed sources remain pinned and tiny lossless archive preserves actual failure",async()=>{
  assert.equal(sha(proof.generatedSource),proof.generatedSourceSha256);
  for(const report of[proof,analysis,compact])for(const[file,hash]of Object.entries(report.sourcePins))
    assert.equal(sha(await readFile(new URL(`../${file}`,import.meta.url))),hash,file);
  assert.deepEqual(compact.raw,proof.rawReport); assert.equal(compact.archive.bytes,65327);
  assert.equal(compact.uncompressedRawRemoved,true); assert.equal(compact.ownedScratchRemoved,true);
  await assert.rejects(access(new URL(`../${compact.raw.path}`,import.meta.url)),{code:"ENOENT"});
  const archive=await readFile(new URL(`../${compact.archive.path}`,import.meta.url));
  assert.equal(archive.length,compact.archive.bytes); assert.equal(sha(archive),compact.archive.sha256);
  const hash=createHash("sha256");let bytes=0;
  await pipeline(createReadStream(new URL(`../${compact.archive.path}`,import.meta.url),{highWaterMark:65536}),
    createGunzip({chunkSize:65536}),new Writable({highWaterMark:65536,write(chunk,encoding,done){
      bytes+=chunk.length; if(bytes>32*1048576)return done(new Error("Raw bound exceeded")); hash.update(chunk);done();
    }}));
  assert.equal(bytes,2105564); assert.equal(hash.digest("hex"),proof.rawReport.sha256);
});
