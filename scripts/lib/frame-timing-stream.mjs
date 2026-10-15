import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
export function createFrameTimingCollector({maximumBytes=33554432,maximumFrames=400000,maximumLineBytes=4096}={}) {
  assert.ok(maximumBytes>0&&maximumBytes<=33554432&&maximumFrames>0&&maximumFrames<=400000);
  const decoder=new StringDecoder("utf8"),hash=createHash("sha256");
  let carry="",bytes=0,frames=0,ignoredLines=0,first=null,last=null,maximumStepSeconds=0,finished=false;
  const line=value=>{
    assert.ok(Buffer.byteLength(value)<=maximumLineBytes,"Timestamp line cap");
    const time=Number.parseFloat(value);if(!Number.isFinite(time)){if(value.trim())ignoredLines++;return;}
    assert.ok(time>=0,"Negative/unavailable timestamps are not zero");assert.ok(frames<maximumFrames,"Frame count cap");
    if(last!==null){assert.ok(time>last,"Decoded frame presentation timestamps must increase");maximumStepSeconds=Math.max(maximumStepSeconds,time-last);}
    first??=time;last=time;frames++;hash.update(time.toFixed(6)+"\n");
  };
  const drain=text=>{
    carry+=text;let end;
    while((end=carry.indexOf("\n"))!==-1){line(carry.slice(0,end));carry=carry.slice(end+1);}
    assert.ok(Buffer.byteLength(carry)<=maximumLineBytes,"Timestamp carry cap");
  };
  return {
    push(chunk){assert.equal(finished,false);bytes+=chunk.length;assert.ok(bytes<=maximumBytes,"32MiB original validator stdout cap");drain(decoder.write(chunk));},
    snapshot(){return{frames,bytes,ignoredLines,firstTimestampSeconds:first,lastTimestampSeconds:last,maximumStepSeconds};},
    finish(expectedFrames){assert.equal(finished,false);drain(decoder.end());if(carry)line(carry);carry="";finished=true;
      assert.equal(frames,expectedFrames,"Every decoded frame must have a finite timestamp");
      return {...this.snapshot(),orderedTimestampSha256:hash.digest("hex"),retainedTimestampArray:false,maximumBytes,maximumLineBytes};},
  };
}
