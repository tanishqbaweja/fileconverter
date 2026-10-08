import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { summarizeLiveMemory } from "../scripts/lib/live-memory-infra.mjs";
const read=async file=>{
  try{return await readFile(new URL(`../${file}`,import.meta.url));}
  catch(error){if(error.code!=="ENOENT"||!file.endsWith(".json"))throw error;
    return gunzipSync(await readFile(new URL(`../${file}.gz`,import.meta.url)),{maxOutputLength:2*1048576});}
};
const proof=JSON.parse(await read("evidence/2026-10-08T22-41-09-984Z-live-memory-analysis.json"));
test("Actual live light snapshots reconstruct without inventing failure-time, causal, full-output or acceptance evidence",async()=>{
  const receiptBytes=await read(proof.receipt.path);assert.equal(sha(receiptBytes),proof.receipt.sha256);
  const e=JSON.parse(receiptBytes);assert.equal(sha(await read(proof.verifier.path)),proof.verifier.sha256);
  for(const[file,hash]of Object.entries(e.sourcePins))assert.equal(sha(await read(file)),hash,file);
  assert.equal(Object.keys(e.sourcePins).length,124);assert.deepEqual(e.sourcePins,e.postSourcePins);
  const run=e.execution,gzip=await read(run.compressedReport.path);assert.equal(sha(gzip),run.compressedReport.sha256);
  const bytes=gunzipSync(gzip);assert.equal(sha(bytes),run.rawReport.sha256);assert.equal(bytes.length,run.rawReport.bytes);
  const raw=JSON.parse(bytes);assert.equal(run.actualExitCode,1);assert.equal(raw.status,"failed");
  assert.equal(raw.failure.message,"Conversion deadline reached; no automatic restart");
  for(const[file,hash]of Object.entries(raw.sourceHashes))assert.equal(e.sourcePins[file],hash,file);
  assert.equal(raw.source.bytes,2958573265);assert.equal(raw.source.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(raw.startupSettlement.minimumMs,300000);assert.ok(raw.startupSettlement.actualMs>=300000);
  assert.equal(raw.limitMiB,250);assert.equal(raw.requestedRuns,3);assert.equal(raw.runs[0].independentValidation,null);
  assert.equal(raw.liveMemoryRecords.length,2);assert.equal(raw.nativeFailureCapture.firstFailure,null);
  assert.equal(raw.cleanup.conversionQuiescence.terminalState,"cancelled");assert.deepEqual(raw.forbiddenRequests,[]);
  for(const row of raw.liveMemoryRecords){
    const archive=row.result.archive,filename=archive.path.replaceAll("\\","/").split("/").at(-1);
    const compressed=await read(`outputs/reports/${filename}`);assert.equal(sha(compressed),archive.sha256);
    const traceBytes=gunzipSync(compressed);assert.equal(sha(traceBytes),archive.restoredSha256);
    assert.deepEqual(summarizeLiveMemory(JSON.parse(traceBytes),[row.result.row]),row.result.summary);
    assert.equal(row.result.acceptanceMetric,false);assert.equal(row.error,null);
  }
  const [before,during]=proof.liveFacts;assert.equal(before.beforeOutputBytes,null);
  assert.equal(during.beforeJobState,"running");assert.equal(during.afterJobState,"running");
  assert.equal(during.beforeOutputBytes,8427700);assert.equal(during.afterOutputBytes,10510526);
  const actor=fact=>fact.summary[0].processes.find(row=>row.pid===27180).liveAllocatorCounters;
  assert.equal(actor(before)["v8/main/malloc"].peak_size,3323864);
  assert.equal(actor(during)["v8/main/malloc"].peak_size,32204636);
  assert.equal(actor(during)["v8/main/malloc"].size,86052);
  assert.equal(proof.nativeFacts.observedIncrementalPrivateMiB,236.9453125);
  assert.equal(proof.cleanupIdentities.originalIdentitiesAbsent,true);assert.equal(proof.protectedFullPostHashVerified,true);
  assert.equal(proof.completeOriginalConversions,0);assert.equal(proof.terminalPendingMetrics,null);
  for(const key of ["nativeAllocationCauseProven","publicAcceptance","originalFullSourceAcceptance","conversionSpeedAcceptance","completeChromiumMemoryAcceptance"])assert.equal(proof[key],false);
});
test("Two terminal proof originals are retained byte-exact in compact archives, not converted copies",async()=>{
  const compact=JSON.parse(await read("evidence/2026-10-08T22-41-09-984Z-live-memory-compaction.json"));
  assert.equal(sha(await read(compact.compactor.path)),compact.compactor.sha256);assert.equal(compact.records.length,2);
  let saved=0;for(const row of compact.records){
    const compressed=await read(row.archive.path);assert.equal(sha(compressed),row.archive.sha256);
    const bytes=gunzipSync(compressed);assert.equal(sha(bytes),row.original.sha256);assert.equal(bytes.length,row.original.bytes);
    assert.equal(row.originalRemovedAfterIdentityAndByteExactLosslessValidation,true);saved+=row.bytesSaved;
    await assert.rejects(readFile(new URL(`../${row.original.path}`,import.meta.url)),{code:"ENOENT"});
  }
  assert.equal(saved,compact.totalBytesSaved);assert.equal(compact.semanticsChanged,false);assert.equal(compact.newBrowserRuns,0);
});
