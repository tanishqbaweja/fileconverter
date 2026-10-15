import assert from "node:assert/strict";
export function inspectCompositedFullTerminal(terminal,report) {
  assert.equal(terminal.executions,1);assert.equal(terminal.failure,null);assert.deepEqual(terminal.cleanupErrors,[]);
  assert.equal(terminal.candidate.actualExitCode,1);assert.equal(terminal.candidate.completedConversions,0);
  assert.equal(terminal.candidate.status,"failed");assert.equal(report.status,"failed");
  assert.equal(report.requestedRuns,3);assert.equal(terminal.requestedRuns,3);assert.equal(report.limitMiB,250);
  assert.equal(report.runs.length,1);const run=report.runs[0],metrics=run.state.metrics;
  assert.equal(run.state.jobState,"complete");assert.equal(run.independentValidation,null);assert.equal(run.recovery,null);
  assert.match(report.failure.message,/^Command failed: ffprobe -v error -select_streams v:0 -show_frames -show_entries frame=best_effort_timestamp_time -of csv=p=0 .*test\.mkv\n$/);
  assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"],"e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e");
  assert.equal(report.manifest.artifacts["split-encoder.wasm"],"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.deepEqual(report.manifest,terminal.composition.manifest);
  assert.deepEqual(report.forbiddenRequests,[]);assert.deepEqual(report.inputReadFailureSamples,[]);assert.deepEqual(report.abortDiagnostic.records,[]);
  const baseline=report.blankBaseline;assert.equal(baseline.stable,true);assert.equal(baseline.privateBytes,243576832);
  assert.ok(report.startupSettlement.actualMs>=300000);assert.equal(report.startupSettlement.pageStayedBlank,true);
  assert.equal(report.startupSettlement.processesExcluded,0);assert.equal(report.startupSettlement.baselineInflated,false);
  assert.ok(baseline.privateBytes<=report.startupSettlement.earlyWindow.privateBytes);
  const phase=report.nativeMemory.phases.find(row=>row.phase==="conversion-1");
  assert.equal(phase.peak[3],479883264);assert.equal(run.peakPrivateBytes,phase.peak[3]);
  const incremental=(phase.peak[3]-baseline.privateBytes)/1048576;
  assert.equal(incremental,225.359375);assert.equal(run.incrementalPrivateMiB,incremental);assert.ok(incremental<=250);
  assert.equal(phase.unavailableSamples,0);assert.equal(phase.validSamples,99862);
  assert.equal(report.nativeMemory.intervalMs,100);assert.equal(report.nativeMemory.error,null);
  assert.equal(report.nativeFailureCapture.firstFailure,null);assert.equal(report.nativeFailureCapture.additionalOverBudgetSamples,0);
  assert.equal(report.nativeFailureCapture.callback,null);assert.equal(report.nativeFailureCapture.evaluatedConversionSamples,99881);
  const fence=report.nativeMemory.receiptClockFence;
  assert.equal(fence.samplesDropped,0);assert.equal(fence.timestampsRewritten,0);assert.equal(fence.monitorClosed,true);assert.equal(fence.fenceFailure,null);
  // One unavailable startup sample is preserved, not zeroed or used as a baseline/peak.
  assert.equal(report.nativeMemory.phases.find(row=>row.phase==="blank-startup-settle").unavailableSamples,1);
  assert.equal(metrics.outputBytes,6414309978);assert.equal(metrics.scratchBytes,0);assert.equal(metrics.peakScratchBytes,6414309978);
  assert.equal(metrics.wasmMemoryBytes,0);assert.equal(metrics.peakWasmMemoryBytes,50331648);assert.equal(metrics.sharedArrayBufferBytes,4);
  assert.equal(metrics.queuedBytes,0);assert.equal(metrics.pendingOperations,0);assert.equal(metrics.activeWorkerCount,1);
  for(const [key,limit]of [["maxReadChunkBytes",65536],["maxWriteChunkBytes",524288],["maxScratchReadChunkBytes",524288],
    ["maxScratchWriteChunkBytes",524288],["peakQueuedBytes",524288],["peakPendingOperations",1]])assert.ok(metrics[key]<=limit,key);
  const copy=report.progressProbe.finalDestinationCopyObservation;assert.equal(copy.stagedBytes,metrics.outputBytes);
  assert.ok(copy.first.elapsedMs>=copy.encodingLast.elapsedMs);assert.ok(metrics.elapsedMs>=copy.last.elapsedMs);
  assert.equal(report.progressProbe.handoffPhysicalReleaseProven,false);
  const events=report.progressProbe.handoffWorkerEvents;assert.deepEqual(events.map(row=>[row.role,row.event]),
    [["codec","created"],["codec","closed"],["save","created"],["save","closed"],["codec","created"]]);
  assert.equal(report.splitFinalSamples.length,1);const frame=report.splitFinalSamples[0];
  assert.equal(frame.frames,296160);assert.equal(frame.packets,296160);assert.equal(frame.completedPackets,296160);
  assert.equal(frame.aggregateWasmMemoryBytes,50331648);assert.equal(frame.closed,true);assert.equal(frame.failed,false);
  for(const key of ["activePackets","queuedPackets","queuedFrames","additionalPixelBufferBytes","additionalJsPacketBufferBytes"])assert.equal(frame[key],0);
  assert.equal(frame.maximumMediaAvioWriteBytes,65536);
  assert.equal(report.asyncifyStorageFinalSamples.length,1);const lease=report.asyncifyStorageFinalSamples[0];
  assert.equal(lease.allocations,1);assert.equal(lease.frees,1);assert.equal(lease.activeLeases,0);assert.equal(lease.retainedBytes,0);
  const probe=run.independentPreAssertionProbe;assert.equal(Number(probe.format.size),metrics.outputBytes);
  const primary=probe.streams.find(stream=>stream.codec_type==="video"&&!stream.disposition?.attached_pic);
  assert.equal(primary.codec_name,"mpeg2video");assert.equal(primary.width,1920);assert.equal(primary.height,804);
  assert.equal(Number(primary.nb_read_frames),296160);assert.equal(primary.avg_frame_rate,"24/1");
  assert.equal(probe.streams.filter(stream=>stream.codec_type==="audio").length,1);
  assert.equal(probe.streams.filter(stream=>stream.disposition?.attached_pic).length,1);
  assert.ok(run.state.warnings.some(warning=>/subrip.*explicitly excluded/i.test(warning)));
  for(const key of ["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])assert.equal(report.cleanup[key],true);
  assert.deepEqual(terminal.protectedBefore,terminal.protectedAfter);assert.equal(terminal.productionRestored,true);
  return {status:"full-encode-and-save-completed-within-observed-memory-validator-failed-not-accepted",
    requestedRuns:3,completedValidatedRuns:0,browserEncodeAndSaveCompleted:true,independentValidationCompleted:false,
    primaryMemory:{stableBlankPrivateBytes:baseline.privateBytes,peakTreePrivateBytes:phase.peak[3],incrementalPrivateMiB:incremental,
      limitMiB:250,observedAttemptWithinLimit:true,profileMemoryAcceptance:false,validConversionSamples:phase.validSamples,
      unavailableConversionSamples:0,unavailableStartupSamples:1,formula:"peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory"},
    outputBytes:metrics.outputBytes,outputSha256:null,outputHashWasNotReached:true,frames:frame.frames,
    encodingCompletionElapsedWindowMs:[copy.encodingLast.elapsedMs,copy.first.elapsedMs],encodeAndSaveElapsedMs:metrics.elapsedMs,
    ffprobeOutputStructureAndFrameCountObserved:true,sourceDecodedFrameTimingCommandFailed:true,
    exactTimingAudioFullDecodeSsimValidationCompleted:false,validatorFailure:report.failure,
    validatorExitCodeAndSignalNotRetained:true,timeoutCauseIsInferenceNotProven:true,
    handoffEvents:events,physicalReleaseBeforeCopyProven:false,copyMetrics:metrics,splitFinal:frame,asyncifyFinal:lease,
    nativeSequence:report.nativeMemory.sequence,sourceCount:714,allGeneratedMediaRemoved:true,
    fullOriginalAcceptance:false,memoryAcceptance:false,speedGainProven:false,publicAcceptance:false,headedCoverageVerified:false,noUnchangedRetry:true};
}
