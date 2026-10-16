import assert from "node:assert/strict";
export function inspectUpdatedChromeFullTerminal(terminal,report) {
  assert.equal(terminal.status,"failed-not-accepted");assert.deepEqual(terminal.cleanupErrors,[]);
  assert.deepEqual(terminal.sourcePins,terminal.postSourcePins);assert.equal(Object.keys(terminal.sourcePins).length,750);
  assert.deepEqual(report.sourceHashes,terminal.sourcePins);
  assert.equal(report.status,"failed");assert.equal(report.runs.length,1);assert.equal(report.requestedRuns,3);
  assert.equal(report.failure.name,"AssertionError");assert.equal(report.failure.message,"Expected values to be strictly equal:\n\n157485 !== 21611\n");
  assert.match(report.failure.stack,/probe\.mjs:540:12/);assert.equal(report.failure.nativeValidation,null);
  const run=report.runs[0],metrics=run.state.metrics;
  assert.equal(run.state.jobState,"complete");assert.equal(run.state.phase,"Saved");assert.equal(run.state.error,null);
  assert.equal(metrics.outputBytes,6414309978);assert.equal(metrics.maxReadChunkBytes,65536);
  assert.equal(metrics.maxWriteChunkBytes,524288);assert.equal(metrics.peakPendingOperations,1);assert.equal(metrics.queuedBytes,0);
  assert.equal(metrics.wasmMemoryBytes,0);assert.equal(metrics.peakWasmMemoryBytes,50331648);assert.equal(metrics.sharedArrayBufferBytes,4);assert.equal(metrics.scratchBytes,0);
  const video=run.independentPreAssertionProbe.streams[0];assert.equal(video.codec_name,"mpeg2video");
  assert.equal(video.width,1920);assert.equal(video.height,804);assert.equal(Number(video.nb_read_frames),296160);
  const ownership=report.splitFinalSamples.at(-1);for(const key of ["frames","packets","completedPackets"])assert.equal(ownership[key],296160);
  assert.equal(ownership.failed,false);assert.equal(ownership.closed,true);
  assert.equal(run.independentValidation,null);assert.equal(run.recovery,null);
  const phase=report.nativeMemory.phases.find(row=>row.phase==="conversion-1");
  assert.equal(phase.validSamples,104861);assert.equal(phase.unavailableSamples,0);
  assert.equal(report.blankBaseline.privateBytes,248463360);assert.equal(phase.peak[3],480342016);
  assert.equal(run.incrementalPrivateMiB,(phase.peak[3]-report.blankBaseline.privateBytes)/1048576);
  assert.equal(run.incrementalPrivateMiB,221.13671875);
  for(const key of ["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])assert.equal(report.cleanup[key],true);
  for(const key of ["wrapperRemoved","candidateRemoved","productionRestored"])assert.equal(terminal[key],true);
  assert.deepEqual(terminal.protectedBefore,terminal.protectedAfter);
  assert.equal(terminal.publicAcceptance,false);assert.equal(terminal.fullOriginalAcceptance,false);assert.equal(terminal.completeChromiumMemoryAcceptance,false);
  return {status:"genuine-full-encode-save-observed-below-budget-independent-timeline-count-failed",
    outputBytes:metrics.outputBytes,encodeAndSaveElapsedMs:metrics.elapsedMs,nativeFrames:296160,independentStructuralFrames:296160,
    parsedInputTimestampCount:157485,parsedOutputTimestampCount:21611,exactMismatchCause:null,
    observedIncrementalPrivateMiB:run.incrementalPrivateMiB,validConversionSamples:phase.validSamples,unavailableConversionSamples:phase.unavailableSamples,
    sourceOutputPerFrameTimelineAccepted:false,audioPayloadEquivalenceReached:false,fullXerrorDecodeReached:false,fullSsimReached:false,
    independentlyAcceptedRuns:0,requestedRuns:3,publicAcceptance:false,fullOriginalAcceptance:false,conversionSpeedAcceptance:false};
}
