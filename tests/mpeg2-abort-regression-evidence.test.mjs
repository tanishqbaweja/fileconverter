import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import test from "node:test";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const bytes=await readFile(new URL("../evidence/mpeg2-abort-original-2026-10-08.json",import.meta.url));
const proof=JSON.parse(bytes);
const analysis=JSON.parse(await readFile(new URL("../evidence/mpeg2-abort-preconversion-analysis-2026-10-08.json",import.meta.url)));
const compaction=JSON.parse(await readFile(new URL("../evidence/mpeg2-abort-preconversion-compaction-2026-10-08.json",import.meta.url)));
const golden=JSON.parse(await readFile(new URL("../evidence/mpeg2-abort-golden-regression-2026-10-08.json",import.meta.url)));

test("terminal route-based harness failure is BEFORE conversion, not OOM, a partial encode or memory acceptance",()=>{
  assert.equal(proof.rawStatus,"failed"); assert.match(proof.failure.message,/abortDiagnostic.staticAssets.length > 0/);
  assert.equal(proof.runs[0].state,null); assert.equal(proof.runs[0].independentValidation,null);
  assert.deepEqual(proof.abortDiagnostic.records,[]); assert.deepEqual(proof.abortDiagnostic.staticAssets,[]);
  assert.deepEqual(proof.actualStackSymbols,[]); assert.equal(proof.completeOriginalConversions,0);
  assert.equal(proof.nativePeak.phase,"pre-conversion-1"); assert.equal(proof.nativePeakIncrementalMiB,75.5390625);
  assert.ok(proof.nativePhaseCoverage.every(row=>row.phase.startsWith("pre-conversion-")));
  assert.equal(analysis.input.sha256,sha(bytes)); assert.equal(analysis.browserConversionsStarted,0);
  assert.equal(analysis.conversionPeakMiB,null); assert.equal(analysis.actualAbortStacksCaptured,0);
  assert.equal(analysis.cleanup.allSampledNativeBirthsAbsent,true); assert.equal(analysis.cleanup.checkedPids,25);
  assert.equal(analysis.cleanup.nativeIdentities,21); assert.equal(analysis.cleanup.protectedFullPostHashVerified,true);
  assert.equal(proof.originalFullSourceMemoryAcceptance,false); assert.equal(proof.publicAcceptance,false);
});

test("all failed-driver, analyzer, compactor and changed browser prerequisite source pins remain exact",async()=>{
  assert.equal(sha(proof.generatedSource),proof.generatedSourceSha256);
  for(const report of[proof,analysis,compaction,golden])for(const[file,hash]of Object.entries(report.sourcePins))
    assert.equal(sha(await readFile(new URL(`../${file}`,import.meta.url))),hash,file);
});

test("failed report reconstructs byte-for-byte from its tiny verified archive without full report buffering",async()=>{
  assert.deepEqual(compaction.raw,proof.rawReport); assert.equal(compaction.uncompressedRawRemoved,true);
  assert.equal(compaction.archive.bytes,50064); assert.equal(compaction.raw.bytes,1725570);
  const hash=createHash("sha256");let count=0;
  await pipeline(createReadStream(new URL(`../${compaction.archive.path}`,import.meta.url),{highWaterMark:65536}),
    createGunzip({chunkSize:65536}),new Writable({highWaterMark:65536,write(chunk,encoding,done){
      count+=chunk.length;assert.ok(count<=32*1048576);hash.update(chunk);done();
    }}));
  assert.equal(count,proof.rawReport.bytes); assert.equal(hash.digest("hex"),proof.rawReport.sha256);
});

test("staged actual-browser hook prerequisite preserves all three exact goldens plus both cleanup/recovery cases",()=>{
  assert.equal(golden.status,"passed-5-of-5-private-regression"); assert.equal(golden.conversions.length,3);
  assert.equal(golden.elapsedBrowserTestSeconds,26.1); assert.equal(golden.recovery.length,2);
  assert.equal(golden.emptyCleanupInventories,5); assert.equal(golden.privateAdditionsAbsent,true);
  for(const row of golden.conversions){
    assert.equal(row.outputCodec,"mpeg2video"); assert.equal(row.metrics.peakWasmMemoryBytes,50331648);
    assert.equal(row.metrics.peakPendingOperations,1); assert.ok(row.ssim>=0.98);
    assert.equal(row.outputSha256,row.sourceCodec==="hevc"?
      "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32":
      "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94");
  }
  for(const row of golden.audioChecks)assert.deepEqual(row.sourceDecodedAudioHashes,row.outputDecodedAudioHashes);
  for(const row of golden.recovery){assert.equal(row.status,"passed");assert.deepEqual(row.partialBytes,[]);}
  assert.equal(golden.originalFullSourceAcceptance,false); assert.equal(golden.completeChromiumMemoryAcceptance,false);
  assert.equal(golden.publicAcceptance,false);
});
