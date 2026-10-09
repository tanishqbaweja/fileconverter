// Independent replay of the retained real-browser results. No browser reruns.
import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { makeStableUiHeadlessBaseline,baselineBinding,sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeSplitCopyAdapter,makeSplitCopyFrameBridge,makeSplitCopySession,exposeSplitCodecMemory } from "../scripts/lib/split-copy-kernel-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const proofPath="evidence/2026-10-09T04-15-41-611Z-split-copy-kernel-goldens.json.gz";
const proof=JSON.parse(gunzipSync(await read(proofPath),{maxOutputLength:2097152}));
const restored=async(path,hash)=>{const gzip=await read(path);assert.equal(sha(gzip),hash);return gunzipSync(gzip,{maxOutputLength:2097152});};
const raw=await restored(proof.report.archivePath,proof.report.archiveSha256);assert.equal(raw.length,proof.report.rawBytes);assert.equal(sha(raw),proof.report.rawSha256);
const report=JSON.parse(raw),rows=kind=>report.rows.filter(row=>row.kind===kind);
test("Compacted actual receipt/report reproduce the exact originals; only redundant JSON copies are absent",async()=>{
  const compaction=JSON.parse(await read("evidence/2026-10-09T04-15-41-611Z-split-copy-kernel-goldens-compaction.json"));
  const receiptGzip=await read(proofPath);assert.equal(receiptGzip.length,compaction.receipt.compressedBytes);assert.equal(sha(receiptGzip),compaction.receipt.compressedSha256);
  const original=gunzipSync(receiptGzip,{maxOutputLength:2097152});assert.equal(original.length,compaction.receipt.rawBytes);assert.equal(sha(original),compaction.receipt.rawSha256);
  assert.equal(compaction.identitySizeHashAndLosslessVerified,true);assert.equal(compaction.savedBytes,930151);assert.equal(compaction.mediaDeletedByThisCommand,false);
  for(const file of compaction.removed)await assert.rejects(access(path.join(root,file)),{code:"ENOENT"});
});
test("Actual headless changed kernel proves three identical independently decoded codec outputs and both recovery cases",async()=>{
  assert.equal(proof.status,"headless-changed-copy-kernel-five-goldens-passed");assert.equal(proof.executions,1);assert.equal(proof.failure,null);
  assert.deepEqual(proof.sourcePins,proof.postSourcePins);for(const[file,hash]of Object.entries(proof.sourcePins))assert.equal(sha(await read(file)),hash,file);
  const baselineBytes=await read(proof.baseline.path);assert.equal(sha(baselineBytes),proof.baseline.sha256);const baseline=JSON.parse(baselineBytes);
  const baselineReport=JSON.parse(await restored(baseline.compressedReport.path,baseline.compressedReport.sha256));
  const conversions=report.rows.filter(row=>!row.kind&&row.status==="passed"),old=baselineReport.rows.filter(row=>!row.kind&&row.status==="passed");assert.equal(conversions.length,3);
  for(let i=0;i<3;i++){
    for(const field of["sourceBytes","outputBytes","outputCodec","frames","audioTracks","ssim","outputSha256","destination","sourceCodec"])assert.deepEqual(conversions[i][field],old[i][field]);
    const m=conversions[i].metrics;assert.equal(m.peakWasmMemoryBytes,50331648);assert.equal(m.peakPendingOperations,1);assert.equal(m.pendingOperations,0);assert.equal(m.queuedBytes,0);
    assert.ok(m.maxReadChunkBytes<=65536&&m.maxWriteChunkBytes<=524288&&m.peakQueuedBytes<=524288);
  }
  assert.equal(rows("independent-frame-diagnostic").length,3);assert.ok(rows("independent-frame-diagnostic").every(row=>row.nativeFullDecodePassed));
  assert.equal(rows("independent-decoded-audio").length,3);for(const row of rows("independent-decoded-audio"))assert.deepEqual(row.sourceDecodedAudioHashes,row.outputDecodedAudioHashes);
  const finals=rows("actual-split-native-ownership");assert.equal(finals.length,5);
  assert.deepEqual(finals.slice(0,3).map(row=>row.samples[0].copyKernel.nativePlaneCalls),[144,288,288]);
  for(const row of finals){const value=row.samples[0];assert.equal(value.copyKernel.copiedBytes,value.copiedPixelBytes);assert.equal(value.copyKernel.closed,true);
    assert.equal(value.copyKernel.additionalWasmMemoryBytes,0);assert.equal(value.copyKernel.additionalPixelBufferBytes,0);assert.equal(value.copyKernel.queuedFrames,0);}
  for(const kind of["direct-write-failure","cancel-after-direct-output"]){assert.equal(rows(kind).length,1);assert.equal(rows(kind)[0].status,"passed");assert.deepEqual(rows(kind)[0].partialBytes,[]);}
  const inventories=report.rows.filter(row=>"cleanupRemovedEntries"in row);assert.equal(inventories.length,5);assert.ok(inventories.every(row=>row.cleanupRemovedEntries.length===0));
  for(const key of["conversionSpeedAcceptance","completeChromiumMemoryAcceptance","publicAcceptance","originalFullSourceAcceptance","headedManualValidation"])assert.equal(proof[key],false);
});
test("Generated source overlays reconstruct exactly without codec/memory changes; headless source and restoration are bound",async()=>{
  const baseline=JSON.parse(await read(proof.baseline.path)),reference=JSON.parse(await read(baseline.reference.path));
  const old=JSON.parse(await restored(reference.generatedArchive.path,reference.generatedArchive.sha256));
  const bytes=await restored(proof.generatedArchive.path,proof.generatedArchive.sha256);assert.equal(sha(bytes),proof.generatedArchive.restoredSha256);
  const generated=JSON.parse(bytes),stamp="2026-10-09T04-15-41-611Z";
  const expected=makeStableUiHeadlessBaseline(old,root,proof.cleanup.ownedRuntime,stamp);
  assert.equal(sha(expected.driver),generated.copyOverlayPatch.originalDriverSha256);
  expected.driver=expected.driver.replaceAll(generated.copyOverlayPatch.before,generated.copyOverlayPatch.after);
  for(const key of["spec","driver","config"])assert.equal(generated[key],expected[key]);
  assert.ok(generated.spec.includes("headless: true")&&!generated.spec.includes("headless: false"));assert.equal((generated.driver.match(/windowsHide: true/g)??[]).length,6);
  const makers=new Map([["within-remux.mjs",makeSplitCopyAdapter],["within-mpeg4.mjs",makeSplitCopyAdapter],["within-direct.mjs",makeSplitCopyAdapter],
    ["_private_split_decoder.mjs",exposeSplitCodecMemory],["_private_split_encoder.mjs",exposeSplitCodecMemory],
    ["mpeg2-split-session.mjs",makeSplitCopySession],["mpeg2-split-frame-bridge.mjs",makeSplitCopyFrameBridge]]);
  for(const row of proof.overlay.existing){assert.equal(sha(row.original),row.originalSha256);const recipe=makers.get(row.file)(row.original);
    for(const key of["generated","originalSha256","generatedSha256","patches"])assert.deepEqual(row[key],recipe[key]);}
  for(const row of proof.overlay.additions)assert.equal(sha(await read(row.source)),row.generatedSha256);
  assert.deepEqual(proof.protectedPre,proof.protectedPost);assert.equal(proof.protectedPost.bytes,2958573265);
  assert.equal(proof.protectedPost.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.cleanup.normalProductionRestored,true);await assert.rejects(access(proof.cleanup.ownedRuntime),{code:"ENOENT"});
  assert.deepEqual(proof.cleanup.numericIdentities.current,[]);assert.equal(proof.cleanup.numericIdentities.nativeBirthsUnavailable,true);
  assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
  for(const file of[...makers.keys(),...proof.overlay.additions.map(row=>row.file)]){
    if(file.startsWith("within-"))continue;await assert.rejects(access(path.join(root,"dist/client/engines/remux",file)),{code:"ENOENT"});
  }
  for(const row of rows("matrix-ui-observation")){const bytes=await read(row.screenshot.path);assert.equal(sha(bytes),row.screenshot.sha256);assert.equal(bytes.length,row.screenshot.bytes);}
});
