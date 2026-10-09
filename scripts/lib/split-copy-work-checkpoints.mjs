// Additional early OBSERVATIONS, not smaller input/output acceptance or stopping points.
import assert from "node:assert/strict";
export const OUTPUT_WORK_CHECKPOINTS=Object.freeze([4194304,8388608,16777216,33554432,67108864]);
export function recordOutputWorkCheckpoint(probe,state){
  if(state?.jobState!=="running")return;
  const metrics=state.metrics;
  if(!metrics||![metrics.inputBytes,metrics.outputBytes].every(value=>Number.isSafeInteger(value)&&value>=0)||!Number.isFinite(metrics.elapsedMs)||metrics.elapsedMs<0){probe.unavailableProgressSamples++;return;}
  assert.ok(probe.workCheckpoints.length<=OUTPUT_WORK_CHECKPOINTS.length);
  const current={inputBytes:metrics.inputBytes,outputBytes:metrics.outputBytes,elapsedMs:metrics.elapsedMs},previous=probe.lastProgressObservation;
  if(previous)assert.ok(current.elapsedMs>=previous.elapsedMs&&current.outputBytes>=previous.outputBytes,"Reject reset/nonmonotonic work counters");
  for(const thresholdBytes of OUTPUT_WORK_CHECKPOINTS)if(current.outputBytes>=thresholdBytes&&!probe.workCheckpoints.some(row=>row.thresholdBytes===thresholdBytes)){
    assert.ok(!previous||previous.outputBytes<thresholdBytes);probe.workCheckpoints.push({thresholdBytes,before:previous??null,after:current,
      crossingTimeIsExact:false,lowerElapsedMs:previous?.elapsedMs??null,upperElapsedMs:current.elapsedMs});
  }
  probe.lastProgressObservation=current;
}
export function compareOutputWorkWindows(baseline,candidate){
  return OUTPUT_WORK_CHECKPOINTS.map(thresholdBytes=>{
    const a=baseline.find(row=>row.thresholdBytes===thresholdBytes),b=candidate.find(row=>row.thresholdBytes===thresholdBytes);
    if(!a||!b||a.lowerElapsedMs==null||b.lowerElapsedMs==null)return {thresholdBytes,status:"unavailable",candidateMinusBaselineMs:null};
    for(const row of[a,b])assert.ok(row.before.outputBytes<thresholdBytes&&row.after.outputBytes>=thresholdBytes&&row.upperElapsedMs>=row.lowerElapsedMs);
    const minimum=b.lowerElapsedMs-a.upperElapsedMs,maximum=b.upperElapsedMs-a.lowerElapsedMs;
    return {thresholdBytes,status:maximum<0?"candidate-earlier-window":minimum>0?"candidate-later-window":"overlapping-windows",
      baselineElapsedWindowMs:[a.lowerElapsedMs,a.upperElapsedMs],candidateElapsedWindowMs:[b.lowerElapsedMs,b.upperElapsedMs],candidateMinusBaselineMs:[minimum,maximum],
      scope:"Partial observed output timing, no exact crossing/full-conversion/validated speed acceptance"};
  });
}
