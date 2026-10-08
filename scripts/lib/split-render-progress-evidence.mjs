// Recompute retained whole-tree peaks, including late samples; never sum disjoint process maxima.
import assert from "node:assert/strict";
import { compareNativeSnapshots } from "./native-memory-bursts.mjs";
export function splitRenderFirstFailureFacts(raw){
  const failure=raw.nativeFailureCapture.firstFailure;
  if(!failure)return {firstFailure:null,causeProven:false};
  assert.deepEqual(failure.baseline,raw.blankBaseline);
  assert.equal(failure.incrementalPrivateMiB,(failure.after.privateBytes-raw.blankBaseline.privateBytes)/1048576);
  assert.ok(failure.incrementalPrivateMiB>250);assert.equal(failure.cause,null);
  if(failure.before)assert.deepEqual(compareNativeSnapshots(failure.before,failure.after),failure.delta);
  const startedAt=raw.quiescedBudgetCapture.startedAt;
  const captured=Number.isFinite(startedAt);
  if(captured)assert.ok(Date.parse(failure.after.timestamp)<=startedAt,"First native failure precedes normal cancel/delayed dump");
  else {
    assert.equal(startedAt,null);
    assert.equal(raw.nativeFailureCapture.callback.status,"not-captured-after-finalization-start");
    assert.equal(raw.nativeFailureCapture.callback.finishedAt,null);
    assert.equal(raw.nativeFailureCapture.callback.result,null);
  }
  const changes=failure.delta?.processDeltas.map(row=>{
    const sample=raw.samples.flatMap(sample=>sample.processes??[]).find(prior=>prior.pid===row.pid&&prior.parentPid===row.parentPid&&
      Math.abs(Date.parse(prior.createdAt)-Date.parse(row.createdAt))<=1);
    return {...row,cimObservedType:sample?.type??null,typeBirthToleranceMs:1};
  })??null;
  return {firstFailure:{phase:failure.phase,before:failure.before,after:failure.after,incrementalPrivateMiB:failure.incrementalPrivateMiB,
    delta:failure.delta,processChanges:changes,normalCancellationStartedAt:startedAt,
    postCancelCaptureStatus:raw.nativeFailureCapture.callback.status,precedesPostCancelDump:captured?true:null},causeProven:false};
}
export function splitRenderNativeFacts(raw,mode){
  assert.equal(raw.limitMiB,250);
  assert.equal(raw.formula,"peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory");
  assert.equal(raw.nativeMemory.error,null);
  assert.equal(raw.nativeMemory.intervalMs,100);
  assert.ok(Number.isFinite(raw.blankBaseline.privateBytes)&&raw.blankBaseline.privateBytes>0);
  assert.ok(raw.blankBaseline.privateBytes<=raw.startupSettlement.earlyWindow.privateBytes);
  assert.equal(raw.startupSettlement.minimumMs,300000);assert.ok(raw.startupSettlement.actualMs>=300000);
  const phases=raw.nativeMemory.phases.filter(row=>/^pre-conversion-|^conversion-/.test(row.phase));
  assert.ok(phases.length>=2);const peaks=phases.map(row=>row.peak).filter(Boolean).sort((a,b)=>b[3]-a[3]);assert.ok(peaks.length);
  for(const peak of peaks){
    assert.ok(Number.isFinite(peak[3])&&peak[3]>0&&peak[6]===null&&Array.isArray(peak[7]));
    assert.equal(peak[7].reduce((sum,process)=>sum+process[1],0),peak[3]);
    const identities=peak[7].map(process=>raw.nativeMemory.identities[process[0]]);assert.ok(identities.every(Boolean));
    assert.ok(identities.some(row=>row.pid===raw.ownedPids.chrome),"Whole simultaneous tree includes original Chrome root");
  }
  const nativePeak=peaks[0],cimPeak=raw.runs[0].cimPeakPrivateBytes;
  assert.ok(cimPeak===null||(Number.isFinite(cimPeak)&&cimPeak>0));
  const actualPeakPrivateBytes=Math.max(nativePeak[3],cimPeak??-Infinity);
  const observedIncrementalPrivateMiB=(actualPeakPrivateBytes-raw.blankBaseline.privateBytes)/1048576;
  return {mode,blankPrivateBytes:raw.blankBaseline.privateBytes,actualPeakPrivateBytes,observedIncrementalPrivateMiB,
    nativePeakSequence:nativePeak[0],nativePeakTimestamp:nativePeak[1],nativePeakProcessRows:nativePeak[7],
    lastLoopReportedIncrementalMiB:raw.runs[0].incrementalPrivateMiB,
    primaryLimitExceededInObservedWindow:observedIncrementalPrivateMiB>250,latePhasePeaksIncluded:true,
    phaseCoverage:phases.map(row=>({phase:row.phase,validSamples:row.validSamples,unavailableSamples:row.unavailableSamples})),
    completeChromiumMemoryAcceptance:false};
}
