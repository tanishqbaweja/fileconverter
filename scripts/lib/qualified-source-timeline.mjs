import assert from "node:assert/strict";
import {createHash} from "node:crypto";
export const ORIGINAL_SOURCE_TIMELINE=Object.freeze({sourceBytes:2958573265,
  sourceSha256:"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34",
  frames:296160,orderedTimestampSha256:"4da5643ccd06096fd3b25f4a33eab23303e5e1dd4329427a52c01523272b365c"});
export const sourceTimestampAt=index=>{assert.ok(Number.isInteger(index)&&index>=0&&index<296160);return Math.round(index*1000/24)/1000;};
export function verifyOriginalSourceTimelineProof(proof) {
  const expected=ORIGINAL_SOURCE_TIMELINE;
  assert.equal(proof.status,"full-source-diagnostic-completed-not-browser-acceptance");assert.equal(proof.failure,null);
  assert.deepEqual(proof.protectedBefore,proof.protectedAfter);assert.equal(proof.protectedAfter.bytes,expected.sourceBytes);assert.equal(proof.protectedAfter.sha256,expected.sourceSha256);
  assert.equal(proof.stderr.bytes,0);assert.equal(proof.stderr.tail,"");assert.equal(proof.runtimeRemoved,true);
  assert.equal(proof.launch.maximumMs,1800000);assert.equal(proof.launch.maximumStdoutBytes,33554432);assert.equal(proof.stream.maximumBytes,33554432);
  assert.equal(proof.qualification.threads,4);assert.equal(proof.qualification.sourceOnly,true);
  assert.deepEqual(proof.sourcePins,proof.postSourcePins);
  assert.equal(proof.stream.strictFrames,expected.frames);assert.equal(proof.stream.floatFrames,expected.frames);assert.equal(proof.stream.nonemptyIgnored,0);
  assert.deepEqual(proof.stream.disagreements,[]);assert.equal(proof.stream.strictTimestampSha256,expected.orderedTimestampSha256);
  assert.equal(proof.executedParser.frames,expected.frames);assert.equal(proof.executedParser.orderedTimestampSha256,expected.orderedTimestampSha256);
  assert.equal(proof.executedParser.exactExecutedFunctionReplayed,true);assert.equal(proof.captured.sha256,proof.stream.stdoutSha256);
  assert.equal(proof.acceptanceParserChanged,false);assert.equal(proof.conversionPerformed,false);
  return expected;
}
// Only this hash-bound original fixture. This is NOT a CFR assumption for arbitrary media.
export function createQualifiedSourceTimeline(proof) {
  const expected=verifyOriginalSourceTimelineProof(proof),values=new Float64Array(expected.frames),hash=createHash("sha256");
  for(let index=0;index<values.length;index++){values[index]=sourceTimestampAt(index);hash.update(values[index].toFixed(6)+"\n");}
  assert.equal(hash.digest("hex"),expected.orderedTimestampSha256,"Every reconstructed source timestamp must match independently decoded reference");
  return values;
}
export function verifyEveryCapturedSourceTimestamp(stdout,proof) {
  const expected=verifyOriginalSourceTimelineProof(proof);assert.ok(Buffer.byteLength(stdout)<=33554432);
  assert.equal(createHash("sha256").update(stdout).digest("hex"),proof.captured.sha256);
  let count=0;for(const line of stdout.split(/\r?\n/)) {
    if(!line)continue;const field=line.split(",",1)[0];
    assert.equal(field,sourceTimestampAt(count).toFixed(6),`Exact native source timestamp ${count}`);count++;
  }
  assert.equal(count,expected.frames);return {all296160ActualNativeTimestampFieldsEqual:true,frames:count,
    orderedTimestampSha256:expected.orderedTimestampSha256,referenceOnlyNotOutputAcceptance:true};
}
