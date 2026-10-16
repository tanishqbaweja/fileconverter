import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {StringDecoder} from "node:string_decoder";

// Diagnostic comparison, NOT a replacement or a relaxed acceptance parser.
export function createTimestampCsvDiagnostic({maximumBytes=33554432}={}) {
  assert.ok(maximumBytes>0&&maximumBytes<=33554432);
  const decoder=new StringDecoder("utf8"),rawHash=createHash("sha256"),strictHash=createHash("sha256"),floatHash=createHash("sha256");
  let carry="",bytes=0,lines=0,strictFrames=0,floatFrames=0,nonemptyIgnored=0,finished=false;
  const disagreements=[];
  const line=value=>{
    assert.ok(Buffer.byteLength(value)<=4096);if(value.endsWith("\r"))value=value.slice(0,-1);
    lines++;const strict=/^-?\d+(?:\.\d+)?(?:,|$)/.test(value),floating=Number.parseFloat(value);
    if(strict){const time=Number(value.split(",")[0]);assert.ok(Number.isFinite(time));strictFrames++;strictHash.update(time.toFixed(6)+"\n");}
    if(Number.isFinite(floating)){floatFrames++;floatHash.update(floating.toFixed(6)+"\n");}
    else if(value.trim())nonemptyIgnored++;
    assert.ok(strictFrames<=400000&&floatFrames<=400000);
    if(strict!==Number.isFinite(floating)&&disagreements.length<8)
      disagreements.push({line:lines,example:value.slice(0,256),endingCodePoints:Array.from(value.slice(-12),x=>x.codePointAt(0))});
  };
  const drain=text=>{carry+=text;let end;while((end=carry.indexOf("\n"))>=0){line(carry.slice(0,end));carry=carry.slice(end+1);}assert.ok(Buffer.byteLength(carry)<=4096);};
  return {
    push(chunk){assert.equal(finished,false);assert.ok(Buffer.isBuffer(chunk));bytes+=chunk.length;assert.ok(bytes<=maximumBytes);rawHash.update(chunk);drain(decoder.write(chunk));},
    snapshot(){return {bytes,lines,strictFrames,floatFrames,nonemptyIgnored,disagreements};},
    finish(){assert.equal(finished,false);drain(decoder.end());if(carry)line(carry);carry="";finished=true;
      return {...this.snapshot(),stdoutSha256:rawHash.digest("hex"),strictTimestampSha256:strictHash.digest("hex"),floatTimestampSha256:floatHash.digest("hex"),
        acceptanceParserChanged:false,maximumBytes,maximumLineBytes:4096,maximumExamples:8};},
  };
}

export function executedFrameTimesBody(driver) {
  const start=driver.indexOf("async function frameTimes(file) {"),end=driver.indexOf("async function audioHashes(file)",start);
  assert.ok(start>0&&end>start);const body=driver.slice(start,end);
  assert.ok(body.length<2048);assert.ok(body.includes('file===source?"4":"1"'));
  return body;
}
export async function replayExecutedFrameTimes(body,stdout) {
  assert.ok(body.length<2048&&Buffer.byteLength(stdout)<=33554432);
  let argumentsUsed;
  const frameTimes=new Function("native","source",body+"; return frameTimes;")(
    async(args,executable)=>{argumentsUsed={args,executable};return {stdout};},"QUALIFIED_READ_ONLY_SOURCE");
  const values=await frameTimes("QUALIFIED_READ_ONLY_SOURCE");assert.ok(values.length<=400000);
  const hash=createHash("sha256");for(const value of values){assert.ok(Number.isFinite(value));hash.update(value.toFixed(6)+"\n");}
  return {frames:values.length,orderedTimestampSha256:hash.digest("hex"),argumentsUsed,exactExecutedFunctionReplayed:true};
}
