import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {gzipSync,gunzipSync} from "node:zlib";
import {createQualifiedSourceTimeline,ORIGINAL_SOURCE_TIMELINE} from "./qualified-source-timeline.mjs";
import {sha} from "./stable-ui-headless-baseline-recipe.mjs";
const hashSource=async file=>{const hash=createHash("sha256");for await(const chunk of createReadStream(file,{highWaterMark:1048576}))hash.update(chunk);return hash.digest("hex");};

// Independent validator only. The real conversion stays in Chromium. Native
// deadline/buffer caps and the exact historical CSV parser remain unchanged.
export function createRecordedFrameValidator({root,source,diagnosticProof,referenceProof,frameTimesBody,native,ffprobePath,reportPrefix,sourceHash=hashSource}) {
  assert.equal(source,path.join(root,"test.mkv"));assert.equal(path.dirname(reportPrefix),path.join(root,"outputs/reports"));
  assert.equal(ffprobePath,"C:/ffmpeg/bin/ffprobe.exe");assert.ok(frameTimesBody.length<2048);assert.equal(typeof native,"function");
  assert.equal(sha(frameTimesBody),diagnosticProof.actualFailedDriver.frameTimesSha256,"Replay the exact executed parser, not a substitute");
  assert.equal(referenceProof.status,"all-native-source-timestamps-exactly-reconstructible-reference-only");
  assert.equal(referenceProof.analysis.all296160ActualNativeTimestampFieldsEqual,true);
  assert.deepEqual(referenceProof.source,diagnosticProof.protectedAfter);
  assert.equal(referenceProof.analysis.orderedTimestampSha256,ORIGINAL_SOURCE_TIMELINE.orderedTimestampSha256);
  const timeline=createQualifiedSourceTimeline(diagnosticProof);let calls=0;
  const recordNative=async(args,logicalExecutable)=>{
    assert.equal(logicalExecutable,"ffprobe");assert.deepEqual(args.slice(0,4),["-v","error","-threads","1"]);
    const id=++calls;assert.ok(id<=8);const recordPath=`${reportPrefix}-output-timestamps-${id}.json`;
    const begin=Date.now(),record={status:"running-independent-frame-probe",recordedAt:new Date().toISOString(),executable:ffprobePath,args,
      maximumMs:1800000,maximumStdoutBytes:33554432,logicalExecutable,stdout:null,stderr:null,frames:null,
      expectedFrames:296160,countMatchesExpected:null,fullOriginalAcceptance:false,publicAcceptance:false,failure:null};
    const capture=async result=>{
      assert.equal(typeof result.stdout,"string");assert.equal(typeof result.stderr,"string");assert.ok(Buffer.byteLength(result.stdout)<=33554432);
      record.stdout={bytes:Buffer.byteLength(result.stdout),sha256:sha(result.stdout)};
      record.stderr={bytes:Buffer.byteLength(result.stderr),sha256:sha(result.stderr),tail:result.stderr.slice(-8192)};
      const zip=gzipSync(result.stdout,{level:9});assert.equal(gunzipSync(zip,{maxOutputLength:33554432}).toString(),result.stdout);
      const file=`${reportPrefix}-output-timestamps-${id}.csv.gz`;await writeFile(file,zip,{flag:"wx"});
      record.stdout.archive={path:path.relative(root,file).replaceAll("\\","/"),bytes:zip.length,sha256:sha(zip)};
      record.frames=result.stdout.split(/\r?\n/).filter(line=>/^-?\d+(?:\.\d+)?(?:,|$)/.test(line)).length;
      record.countMatchesExpected=record.frames===record.expectedFrames;
    };
    await writeFile(recordPath,JSON.stringify(record,null,2)+"\n",{flag:"wx"});
    try {
      const result=await native(args,ffprobePath);await capture(result);
      record.status="captured-independent-frame-probe";
      assert.equal(result.stderr,"","FFprobe error-level stderr cannot be silently discarded");
      return result;
    }catch(error){
      if(!record.stdout&&typeof error.stdout==="string"&&typeof error.stderr==="string")await capture({stdout:error.stdout,stderr:error.stderr});
      record.status="failed-independent-frame-probe";record.failure={name:error.name,message:String(error.message).slice(0,8192),
      code:error.code??null,signal:error.signal??null,nativeValidation:error.nativeValidation??null};
      error.frameValidationReceipt=path.relative(root,recordPath).replaceAll("\\","/");throw error;
    }finally{record.elapsedMs=Date.now()-begin;await writeFile(recordPath,JSON.stringify(record,null,2)+"\n");}
  };
  const legacy=new Function("native","source",frameTimesBody+";return frameTimes;")(recordNative,source);
  return async file=>{
    if(file===source) {
      assert.equal(await sourceHash(source),ORIGINAL_SOURCE_TIMELINE.sourceSha256,"Reference applies only to the unchanged exact original source");
      return timeline;
    }
    const values=await legacy(file);
    try{assert.equal(values.length,timeline.length,"Every output frame must have a finite parsed timestamp");}
    catch(error){error.frameValidationReceipt=path.relative(root,`${reportPrefix}-output-timestamps-${calls}.json`).replaceAll("\\","/");throw error;}
    return values; // The full driver's unchanged <=1ms per-frame comparison still follows.
  };
}
