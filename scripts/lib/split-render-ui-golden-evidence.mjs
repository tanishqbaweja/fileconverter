// Read-only reconstruction of actual production-browser evidence. No synthetic outcomes.
import assert from "node:assert/strict";
import { access,readFile,stat } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { baselineBinding,compareMatchedHeadlessUi,sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeSplitRenderUiGoldens } from "./split-render-ui-golden-recipe.mjs";
export async function verifySplitRenderUiGoldens(root,proofPath){
  const read=async file=>{assert.ok(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes(".."));return readFile(path.join(root,file));};
  const proofBytes=await read(proofPath);assert.ok(proofBytes.length<1048576);const proof=JSON.parse(proofBytes);
  assert.equal(proof.status,"headless-five-goldens-and-exact-geometry-passed");assert.equal(proof.failure,null);
  assert.equal(proof.browserMode,"headless");assert.equal(proof.subprocessWindowsHidden,true);
  for(const field of ["headedManualValidation","originalFullSourceAcceptance","publicAcceptance","conversionSpeedAcceptance","completeChromiumMemoryAcceptance"])
    assert.equal(proof[field],false,field);
  for(const host of [proof.hostPreflight,proof.launchHostPreflight]){
    assert.equal(host.safeToStart,true);assert.equal(host.requiredPhysicalBytes,2147483648);assert.equal(host.requiredVirtualBytes,2147483648);
    assert.ok(host.freePhysicalBytes>=2147483648&&host.freeVirtualBytes>=2147483648);assert.equal(host.primaryConversionLimitMiB,250);
  }
  assert.ok(proof.diskPreflightBytes>=2147483648);
  assert.deepEqual(proof.protectedPre,proof.protectedPost);
  assert.deepEqual(proof.protectedPre,{bytes:2958573265,sha256:"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34"});
  assert.equal((await stat(path.join(root,"test.mkv"))).size,proof.protectedPost.bytes);
  assert.deepEqual(proof.sourcePins,proof.postSourcePins);for(const [file,hash] of Object.entries(proof.sourcePins))assert.equal(sha(await read(file)),hash,file);
  const restored=async record=>{
    const compressed=await read(record.path);assert.equal(compressed.length,record.bytes);assert.equal(sha(compressed),record.sha256);
    const raw=gunzipSync(compressed,{maxOutputLength:2097152});
    if(record.restoredBytes!==undefined)assert.equal(raw.length,record.restoredBytes);
    if(record.restoredSha256!==undefined)assert.equal(sha(raw),record.restoredSha256);return raw;
  };
  const buildBytes=await read(proof.buildProofPath),build=JSON.parse(buildBytes);
  assert.equal(build.forBrowser,true);assert.equal(build.normalProductionRestored,false,"Build receipt preserves the state before caller restoration");
  for(const key of ["candidateLintErrors","candidateLintWarnings","candidateTypeDiagnostics"])assert.equal(build[key],0);
  for(const pin of build.sourcePins){const bytes=await read(pin.path);assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256,pin.path);}
  assert.equal(sha(await restored(build.sourceArchive)),build.recipe.candidateSha256);
  const asset=await restored(build.assetArchive);assert.equal(asset.length,build.asset.bytes);assert.equal(sha(asset),build.asset.sha256);
  const baselineBytes=await read(proof.baseline.path);assert.equal(sha(baselineBytes),proof.baseline.sha256);
  const baseline=JSON.parse(baselineBytes),baselineRaw=await restored(baseline.compressedReport);
  assert.equal(baselineRaw.length,baseline.rawReport.bytes);assert.equal(sha(baselineRaw),baseline.rawReport.sha256);
  const baselineReport=JSON.parse(baselineRaw),referenceBytes=await read(baseline.reference.path);
  assert.equal(sha(referenceBytes),baseline.reference.sha256);const reference=JSON.parse(referenceBytes);
  const oldExecuted=JSON.parse(await restored(reference.generatedArchive));
  const generated=JSON.parse(await restored(proof.generatedArchive)),stamp=path.basename(proofPath).replace(/-split-render-ui-goldens\.json$/,"");
  assert.deepEqual(generated,makeSplitRenderUiGoldens(oldExecuted,root,proof.cleanup.ownedWrapper,stamp,build.asset));
  const raw=await restored(proof.report.archive);assert.equal(raw.length,proof.report.rawBytes);assert.equal(sha(raw),proof.report.rawSha256);
  const report=JSON.parse(raw),rows=kind=>report.rows.filter(row=>row.kind===kind);
  const conversions=report.rows.filter(row=>!row.kind&&row.status==="passed"),oldConversions=baselineReport.rows.filter(row=>!row.kind&&row.status==="passed");
  assert.equal(conversions.length,3);assert.equal(oldConversions.length,3);
  for(let i=0;i<3;i++){
    for(const key of ["sourceBytes","outputBytes","outputCodec","frames","audioTracks","ssim","outputSha256","destination","sourceCodec"])
      assert.deepEqual(conversions[i][key],oldConversions[i][key],key);
    const m=conversions[i].metrics;assert.equal(m.peakWasmMemoryBytes,50331648);assert.equal(m.peakPendingOperations,1);
    assert.equal(m.pendingOperations,0);assert.equal(m.queuedBytes,0);
    assert.ok(m.maxReadChunkBytes<=65536&&m.maxWriteChunkBytes<=524288&&m.peakQueuedBytes<=524288);
  }
  assert.equal(rows("actual-served-split-render-ui-candidate").length,5);
  for(const row of rows("actual-served-split-render-ui-candidate"))assert.deepEqual({url:row.url,bytes:row.bytes,sha256:row.sha256},build.asset);
  assert.equal(rows("independent-frame-diagnostic").length,3);assert.ok(rows("independent-frame-diagnostic").every(row=>row.nativeFullDecodePassed));
  assert.equal(rows("independent-decoded-audio").length,3);for(const row of rows("independent-decoded-audio"))assert.deepEqual(row.sourceDecodedAudioHashes,row.outputDecodedAudioHashes);
  for(const kind of ["direct-write-failure","cancel-after-direct-output"]){assert.equal(rows(kind).length,1);assert.equal(rows(kind)[0].status,"passed");assert.deepEqual(rows(kind)[0].partialBytes,[]);}
  const inventories=report.rows.filter(row=>"cleanupRemovedEntries" in row);assert.equal(inventories.length,5);for(const row of inventories)assert.deepEqual(row.cleanupRemovedEntries,[]);
  const analysis=compareMatchedHeadlessUi(report,baselineReport);assert.deepEqual(analysis,proof.analysis);assert.equal(analysis.maximumDeltaCssPixels,0);
  assert.equal(proof.screenshots.length,6);for(const screenshot of proof.screenshots){const bytes=await read(screenshot.path);assert.equal(bytes.length,screenshot.bytes);assert.equal(sha(bytes),screenshot.sha256);}
  assert.equal(proof.cleanup.normalProductionRestored,true);assert.equal(proof.cleanup.ownedWrapperAbsent,true);
  assert.ok(path.relative(root,proof.cleanup.ownedWrapper).startsWith("work"+path.sep));
  await assert.rejects(access(proof.cleanup.ownedWrapper),{code:"ENOENT"});
  assert.deepEqual(proof.cleanup.numericPidsAbsent.current,[]);assert.equal(proof.cleanup.numericPidsAbsent.nativeBirthsUnavailable,true);
  const normal=await read("dist/client"+baselineBinding.url);assert.equal(normal.length,baselineBinding.bytes);assert.equal(sha(normal),baselineBinding.sha256);
  const previous=JSON.parse(await read(baseline.candidateValidation.path));for(const [file,hash] of Object.entries(previous.cleanup.restoredAssetHashes))
    assert.equal(sha(await read("dist/client/engines/remux/"+file)),hash);
  for(const file of ["_private_split_decoder.mjs","_private_split_decoder.wasm","_private_split_encoder.mjs","_private_split_encoder.wasm",
    "mpeg2-split-session.mjs","mpeg2-split-frame-bridge.mjs","mpeg2-split-frame-layout.mjs","mpeg2-split-frame-properties.mjs","mpeg2-split-packet-bridge.mjs"])
    await assert.rejects(access(path.join(root,"dist/client/engines/remux",file)),{code:"ENOENT"});
  return {proofPath,proofSha256:sha(proofBytes),buildProofSha256:sha(buildBytes),sourcePinCount:Object.keys(proof.sourcePins).length,
    conversions:conversions.map(row=>({sourceBytes:row.sourceBytes,outputBytes:row.outputBytes,sourceCodec:row.sourceCodec,outputCodec:row.outputCodec,
      frames:row.frames,audioTracks:row.audioTracks,ssim:row.ssim,outputSha256:row.outputSha256,destination:row.destination})),
    observedProcessIdCount:proof.cleanup.numericPidsAbsent.observedCount,nativeBirthsUnavailable:true,
    maximumGeometryDeltaCssPixels:analysis.maximumDeltaCssPixels,rawReport:proof.report,screenshots:proof.screenshots,
    originalFullSourceAcceptance:false,publicAcceptance:false,conversionSpeedAcceptance:false,completeChromiumMemoryAcceptance:false};
}
