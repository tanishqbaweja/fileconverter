import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeLateAbortAdapter } from "../scripts/lib/mpeg2-late-abort-adapter.mjs";
const root=path.resolve(import.meta.dirname,".."),sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const json=async file=>JSON.parse(await readFile(path.join(root,file)));

test("actual current-Chrome request82 abort is real pool allocation, not old original cause or media acceptance",async()=>{
  const proof=await json("evidence/late-pool-abort-control-2026-10-08.json"), terminal=proof.result.terminal;
  assert.equal(proof.status,"passed-synthetic-abort-control");assert.equal(proof.browserVersion,"154.0.8037.98");
  assert.equal(proof.failure,null);assert.deepEqual(proof.forbiddenRequests,[]);
  assert.equal(terminal.successfulFreshRequests,81);assert.equal(terminal.cacheReuseVerified,true);
  assert.equal(terminal.originalCalls,1);assert.equal(terminal.capture.nativeErrorSuppressed,false);
  assert.equal(terminal.capture.queuedRecords,0);assert.equal(terminal.capture.first.stackTruncated,false);
  const request=terminal.emitted.latePoolRequest;
  assert.equal(request.sequence,82);assert.equal(request.payloadBytes,33554432);
  assert.equal(request.failedIndividualAllocationBytes,33554448);assert.equal(request.refcountHeaderBytes,16);
  assert.equal(request.observedPoolAddress,terminal.failedPool);
  assert.equal(request.liveEntriesBeforeRequest,0);assert.equal(request.cachedEntriesInRequestedPoolBeforeRequest,0);
  assert.equal(terminal.emitted.latePoolRequestUnavailable,null);assert.equal(request.nativeFunctionsCalled,false);
  assert.deepEqual(proof.result.symbolizedAbortFrames.map(row=>row.functionNameFromActualBinary),
    ["sbrk","emscripten_builtin_malloc","__wrap_posix_memalign","av_malloc","av_refstruct_pool_get"]);
  assert.equal(proof.exportOnlyControl.controlSha256,proof.result.actualBinarySha256);
  assert.equal(proof.exportOnlyControl.onlyExportSectionChanged,true);
  assert.equal(proof.exportOnlyControl.usableForMediaOrAcceptance,false);
  for(const row of proof.exportOnlyControl.sections)if(row.id!==7)assert.equal(row.originalSha256,row.outputSha256);
  for(const [file,hash] of Object.entries(proof.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash);
  for(const field of ["workerTerminated","normalBrowserCloseRequested","serverClosed","allSampledNativeBirthsAbsent","runtimeProfileRemoved"])
    assert.equal(proof.cleanup[field],true);
  assert.equal(proof.cleanup.checkedNativeIdentities,11);assert.deepEqual(proof.cleanup.errors,[]);
  await assert.rejects(access(proof.runtimeDirectory),{code:"ENOENT"});
  assert.equal(proof.browserConversionsPerformed,0);assert.equal(proof.primaryMemoryAcceptance,false);
  assert.equal(proof.primaryIncrementalPrivateMiB,null);assert.equal(proof.actualOriginalOomAllocationCallsite,null);
});

test("controlled production adapter adds failure-only observer with exact unchanged encoder/session/AVIO behavior",async()=>{
  const inputs={stager:await readFile(path.join(root,"scripts/stage-mpeg2-split-direct.mjs"),"utf8"),
    stackHelper:await readFile(path.join(root,"scripts/lib/bounded-wasm-abort-capture.mjs"),"utf8"),
    snapshotHelper:await readFile(path.join(root,"scripts/lib/late-refstruct-abort-snapshot.mjs"),"utf8"),
    poolHelper:await readFile(path.join(root,"scripts/lib/late-pool-abort-capture.mjs"),"utf8"),
    controlProof:await json("evidence/late-pool-abort-control-2026-10-08.json")};
  const result=makeLateAbortAdapter(inputs);
  assert.equal(result.adapterBytes,10414);assert.equal(result.adapterSha256,"b5842db76aec87f971f49118253f953822e25708d2359c9bc62df3c8e02de3f6");
  assert.ok(result.adapter.includes("getCore: () => core"));
  assert.ok(result.adapter.includes("poolGetterFunctionIndex: 4379, avMallocFunctionIndex: 4311"));
  assert.doesNotMatch(result.adapter,/control_pool_|control_unref|synthetic-oom|debugger/);
  assert.throws(()=>makeLateAbortAdapter({...inputs,poolHelper:inputs.poolHelper+"\n"}));
});

test("five actual production goldens preserve exact bytes/content/recovery and restore all assets",async()=>{
  const proof=await json("evidence/mpeg2-late-abort-golden-validation-2026-10-08.json");
  assert.equal(proof.status,"passed-5-of-5-private-regression");assert.equal(proof.elapsedBrowserTestSeconds,27);
  assert.equal(proof.conversions.length,3);assert.equal(proof.recovery.length,2);
  for(const row of proof.conversions){
    const hevc=row.sourceCodec==="hevc";
    assert.equal(row.outputCodec,"mpeg2video");assert.equal(row.frames,hevc?"96":"48");
    assert.equal(row.outputSha256,hevc?"6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32":"d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94");
    assert.equal(row.outputBytes,hevc?652521:321692);assert.equal(row.metrics.peakWasmMemoryBytes,50331648);
    assert.equal(row.metrics.peakPendingOperations,1);
  }
  for(const row of proof.audioChecks)assert.deepEqual(row.sourceDecodedAudioHashes,row.outputDecodedAudioHashes);
  for(const row of proof.artworkChecks)assert.equal(row.status,"passed");
  assert.equal(proof.timelines.length,3);assert.equal(proof.emptyCleanupInventories,5);
  for(const row of proof.recovery){assert.equal(row.status,"passed");assert.deepEqual(row.partialBytes,[]);}
  const raw=await readFile(path.join(root,proof.rawReport.path));assert.equal(raw.length,proof.rawReport.bytes);assert.equal(sha(raw),proof.rawReport.sha256);
  const envelopeBytes=await readFile(path.join(root,proof.executionEnvelope.path));assert.equal(sha(envelopeBytes),proof.executionEnvelope.sha256);
  const envelope=JSON.parse(envelopeBytes);assert.equal(envelope.pinsUnchanged,true);
  assert.deepEqual(envelope.sourcePins,envelope.postSourcePins);assert.deepEqual(envelope.sourcePins,proof.sourcePins);
  await assert.rejects(access(envelope.ownedDriver),{code:"ENOENT"});
  for(const [file,hash] of Object.entries(proof.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash);
  for(const [file,hash] of Object.entries(proof.restoredAssetHashes))assert.equal(sha(await readFile(path.join(root,"dist/client/engines/remux",file))),hash);
  assert.equal(proof.syntheticExportControlUsedForMedia,false);assert.equal(proof.completeChromiumMemoryAcceptance,false);
  assert.equal(proof.originalFullSourceAcceptance,false);assert.equal(proof.publicAcceptance,false);
});

test("held RAM check records no browser/conversion before user-freed capacity, without lowering guard",async()=>{
  const proof=await json("evidence/mpeg2-late-goldens-host-held-2026-10-08.json");
  assert.equal(sha(await readFile(path.join(root,proof.source))),proof.executedSourceSha256);
  assert.equal(proof.subsequentReadOnlyConfirmation.safeToStart,false);
  assert.ok(proof.subsequentReadOnlyConfirmation.freePhysicalBytes<2147483648);
  assert.equal(proof.userRequestedRecheck.safeToStart,true);
  assert.equal(proof.userRequestedRecheck.requiredPhysicalBytes,2147483648);
  assert.equal(proof.conversionsPerformed,0);assert.equal(proof.enginesStaged,false);assert.equal(proof.browserStarted,false);
});
