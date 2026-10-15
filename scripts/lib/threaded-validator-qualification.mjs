// Replay actual native fixture/full-source qualification; never rerun or convert media.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const THREAD_VALIDATOR_PROOF="evidence/2026-10-15T21-54-44-094Z-source-frame-threads.json";
export function inspectThreadValidatorQualification(record) {
  assert.equal(record.status,"full-source-frame-timing-4-threads-passed-not-browser-acceptance");assert.equal(record.failure,null);
  assert.equal(record.conversionPerformed,false);assert.equal(record.fullOriginalAcceptance,false);assert.equal(record.publicAcceptance,false);
  assert.deepEqual(record.sourcePins,record.postSourcePins);assert.equal(Object.keys(record.sourcePins).length,7);
  assert.equal(record.native.defaultProbeThreads,1);assert.equal(record.native.candidateThreads,4);
  assert.equal(record.control.all96FixtureDecodedPixelsAndTimingsEqual,true);
  const [one,four]=record.control.timings;assert.equal(one.threads,1);assert.equal(four.threads,4);
  assert.equal(one.frames,96);assert.equal(four.frames,96);assert.equal(one.orderedTimestampSha256,four.orderedTimestampSha256);
  assert.equal(record.control.pixelHashes[0].framemd5Sha256,record.control.pixelHashes[1].framemd5Sha256);
  assert.equal(record.sourceResult.frames,296160);assert.equal(record.sourceResult.ignoredLines,0);
  assert.equal(record.sourceResult.orderedTimestampSha256,"4da5643ccd06096fd3b25f4a33eab23303e5e1dd4329427a52c01523272b365c");
  assert.equal(record.sourceResult.firstTimestampSeconds,0);assert.equal(record.sourceResult.lastTimestampSeconds,12339.958);
  assert.ok(record.sourceResult.maximumStepSeconds<=.042001);assert.equal(record.sourceResult.retainedTimestampArray,false);
  assert.equal(record.sourceResult.maximumBytes,33554432);assert.equal(record.sourceResult.stderrTail,"");
  assert.equal(record.launch.maximumMs,1800000);assert.ok(record.exit.elapsedMs<record.launch.maximumMs);
  assert.equal(record.exit.code,0);assert.equal(record.exit.signal,null);assert.equal(record.runtimeRemoved,true);
  assert.deepEqual(record.protectedBefore,record.protectedAfter);assert.equal(record.protectedAfter.bytes,2958573265);
  assert.equal(record.protectedAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  return {threads:4,sourceOnly:true,qualifiedFrames:296160,nativeMaximumMs:1800000,stdoutMaximumBytes:33554432,
    fullSourceElapsedMs:record.exit.elapsedMs,fixturePixelAndTimingIdentity:true,browserCodecSettingsChanged:false,
    qualityOrTimingThresholdChanged:false,fullOriginalAcceptance:false,publicAcceptance:false};
}
export async function verifyThreadValidatorQualification(root) {
  const bytes=await readFile(path.join(root,THREAD_VALIDATOR_PROOF)),record=JSON.parse(bytes),analysis=inspectThreadValidatorQualification(record);
  for(const [file,hash]of Object.entries(record.sourcePins)){
    assert.equal(sha(Buffer.from(record.sourcePreimages[file],"base64")),hash,file);assert.equal(sha(await readFile(path.join(root,file))),hash,file);
  }
  for(const row of [record.native.ffprobe,record.native.ffmpeg]) {
    const hash=createHash("sha256");for await(const chunk of createReadStream(row.path,{highWaterMark:1048576}))hash.update(chunk);
    assert.equal(hash.digest("hex"),row.sha256,row.path);
  }
  return {record,analysis,reference:{path:THREAD_VALIDATOR_PROOF,sha256:sha(bytes),...analysis},
    files:[THREAD_VALIDATOR_PROOF,...Object.keys(record.sourcePins),"tests/source-frame-threads-evidence.test.mjs"]};
}
