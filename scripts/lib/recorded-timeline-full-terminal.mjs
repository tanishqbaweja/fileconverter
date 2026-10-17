import assert from "node:assert/strict";
export function inspectRecordedTimelineFullTerminal(terminal,report) {
  assert.equal(terminal.status,"failed-not-accepted");assert.deepEqual(terminal.cleanupErrors,[]);
  assert.deepEqual(terminal.sourcePins,terminal.postSourcePins);assert.equal(Object.keys(terminal.sourcePins).length,768);assert.deepEqual(report.sourceHashes,terminal.sourcePins);
  assert.equal(report.status,"failed");assert.equal(report.runs.length,2);assert.equal(report.requestedRuns,3);
  assert.equal(report.failure.message,"Complete Chromium increase 268.9609375MiB exceeds 250MiB");
  const [one,two]=report.runs,validation=one.independentValidation;
  assert.equal(one.state.jobState,"complete");assert.equal(one.state.phase,"Saved");assert.equal(one.state.metrics.outputBytes,6414309978);
  assert.equal(validation.outputBytes,6414309978);assert.equal(validation.frameCount,296160);assert.equal(validation.fullDecode,true);
  assert.equal(validation.sha256,"2b1277805033e824425ba0542de83d486c967d2755952ac30b57ce5c5d08024e");
  assert.equal(validation.ssim,.989565);assert.ok(validation.ssim>=.98);assert.ok(validation.maximumTimestampErrorSeconds<=.001);
  assert.equal(validation.maximumTimestampErrorSeconds,.00031300000000555883);
  assert.equal(validation.probe.streams[0].codec_name,"mpeg2video");assert.equal(validation.probe.streams[0].width,1920);assert.equal(validation.probe.streams[0].height,804);
  assert.equal(Number(validation.probe.streams[0].nb_read_frames),296160);
  assert.equal(one.state.metrics.peakWasmMemoryBytes,50331648);assert.equal(one.state.metrics.wasmMemoryBytes,0);
  assert.equal(one.state.metrics.maxReadChunkBytes,65536);assert.equal(one.state.metrics.maxWriteChunkBytes,524288);assert.equal(one.state.metrics.peakPendingOperations,1);
  assert.equal(one.state.metrics.queuedBytes,0);assert.equal(one.state.metrics.scratchBytes,0);
  assert.equal(report.blankBaseline.privateBytes,243658752);assert.equal(one.incrementalPrivateMiB,224.11328125);assert.equal(two.incrementalPrivateMiB,268.9609375);
  const first=report.nativeMemory.phases.find(row=>row.phase==="conversion-1"),second=report.nativeMemory.phases.find(row=>row.phase==="conversion-2");
  assert.equal(first.peak[3],478658560);assert.equal(first.validSamples,102080);assert.equal(first.unavailableSamples,0);
  assert.equal(second.peak[3],525684736);assert.equal(second.validSamples,23);assert.equal(second.unavailableSamples,0);
  assert.equal((first.peak[3]-report.blankBaseline.privateBytes)/1048576,one.incrementalPrivateMiB);
  assert.equal((second.peak[3]-report.blankBaseline.privateBytes)/1048576,two.incrementalPrivateMiB);
  assert.equal(two.independentValidation,null);assert.equal(two.state.jobState,"cancelled");
  const boundary=report.nativeFailureCapture.firstFailure;assert.equal(boundary.phase,"conversion-2");assert.equal(boundary.cause,null);
  const renderer=boundary.delta.processDeltas.find(row=>row.pid===38896);assert.equal(renderer.deltaPrivateBytes,40722432);
  assert.equal(boundary.delta.treeDeltaPrivateBytes,41050112);assert.equal(boundary.delta.allocationSource,null);
  assert.ok(report.samples.some(row=>(row.processes??[]).some(process=>process.pid===38896&&process.type==="renderer"&&process.createdAt===renderer.createdAt)));
  assert.equal(report.quiescedBudgetCapture.allocationObjectOrCallsite,null);assert.equal(report.quiescedBudgetCapture.oldWorkerCloseObserved,true);
  assert.equal(report.sourceTimelineReference.frames,296160);assert.equal(report.sourceTimelineReference.outputValidationRelaxed,false);
  for(const key of ["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])assert.equal(report.cleanup[key],true);
  for(const key of ["wrapperRemoved","candidateRemoved","productionRestored"])assert.equal(terminal[key],true);
  assert.deepEqual(terminal.protectedBefore,terminal.protectedAfter);
  for(const key of ["publicAcceptance","fullOriginalAcceptance","completeChromiumMemoryAcceptance"])assert.equal(terminal[key],false);
  return {status:"one-genuine-full-run-validated-second-run-startup-exceeds-memory-budget",independentlyValidatedRuns:1,requestedRuns:3,
    first:{outputBytes:validation.outputBytes,sha256:validation.sha256,frames:validation.frameCount,ssim:validation.ssim,
      maximumTimestampErrorSeconds:validation.maximumTimestampErrorSeconds,fullDecode:true,incrementalPrivateMiB:one.incrementalPrivateMiB,
      encodeAndSaveElapsedMs:one.state.metrics.elapsedMs,validConversionSamples:first.validSamples,unavailableConversionSamples:0},
    second:{incrementalPrivateMiB:two.incrementalPrivateMiB,validConversionSamples:second.validSamples,unavailableConversionSamples:0,
      cancelledBeforeCompletion:true,independentValidationReached:false},
    recovery:{loadedIdlePrivateBytes:report.loadedIdle.privateBytes,postRun1PrivateBytes:one.recovery.privateBytes,
      retainedAboveLoadedIdleMiB:(one.recovery.privateBytes-report.loadedIdle.privateBytes)/1048576},
    failureBoundary:{rendererPid:renderer.pid,rendererIncreaseBytes:renderer.deltaPrivateBytes,treeIncreaseBytes:boundary.delta.treeDeltaPrivateBytes,
      exactAllocationSource:null,postCancellationDumpIsNotPeakObjectProof:true},
    repeatabilityAcceptance:false,publicAcceptance:false,fullOriginalAcceptance:false,conversionSpeedAcceptance:false};
}
