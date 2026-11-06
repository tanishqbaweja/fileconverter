import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {makeWebCodecsOriginalSource} from "../media/ffmpeg/webcodecs-original-recipe.mjs";
const read=f=>readFile(new URL("../"+f,import.meta.url),"utf8"),source=await read("media/ffmpeg/within_remux.c");
test("private platform wrapper composes only exact explicit-width and established CFR metadata edits",()=>{
  const r=makeWebCodecsOriginalSource(source);let reverse=r.generated;
  for(const [before,after]of r.edits.toReversed())reverse=reverse.replace(after,before);assert.equal(reverse,source);
  assert.equal(r.edits.length,3);assert.equal(r.decoderHeapBytes,33554432);assert.equal(r.decoderThreads,1);
  assert.equal(r.maximumPacketBytes,1048576);assert.equal(r.maximumFramesInFlight,1);
  for(const field of ["platformEncoderChanged","defaultWidthPolicyChanged","codecSettingsChanged","ioChanged","memoryLimitsRaised","browserValidated","speedGainProven","publicAcceptance"])
    assert.equal(r[field],false);
  assert.throws(()=>makeWebCodecsOriginalSource(source+" "));
});
test("native build selects isolated changed source and retains compiled C/proof without raising memory or changing bridge",async()=>{
  const script=await read("media/ffmpeg/build-webcodecs-vp9.sh");
  assert.ok(script.includes('WRAPPER_SOURCE="${BUILD_ROOT}/within_remux.original.c"'));
  assert.ok(script.includes('emcc "${WRAPPER_SOURCE}"'));assert.ok(script.includes('-sMAXIMUM_MEMORY=33554432'));
  const bash=process.platform==="win32"?"D:/Program Files/Git/bin/bash.exe":"/bin/bash",
    result=spawnSync(bash,["--noprofile","--norc","-n"],{input:script,windowsHide:true,encoding:"utf8",timeout:10000,maxBuffer:65536});
  assert.equal(result.status,0,result.stderr||String(result.error));
  const verifier=await read("scripts/verify-webcodecs-vp9-native.mjs");
  assert.ok(verifier.includes('artifacts[artifact].sha256,sources[source]'));
  assert.ok(verifier.includes('privateVp9ExplicitWidth:1920'));assert.ok(verifier.includes('nodeInstantiated: false'));
});
