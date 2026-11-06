import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {makeWebCodecsOriginalSource} from "../media/ffmpeg/webcodecs-original-recipe.mjs";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f));
test("authenticated platform native variant compiles explicit1920 wrapper with fixed nonshared32MiB and one native thread",async()=>{
  const r=await json("evidence/2026-11-06-webcodecs-vp9-original-native-42231818045.json"),c=r.nativeContract;
  assert.equal(r.head,"d31883e623a11464e8a3fb63561cc8830751dacf");assert.equal(r.runId,42231818045);
  assert.equal(Object.keys(c.artifacts).length,14);assert.equal(r.retainedBytes,6197437);
  assert.equal(r.artifact.sha256,"a3220e2726964100f7f9c2dd3328e1919c31a33f8e0924449caf0ce9a62a3167");
  assert.equal(c.artifacts["within-webcodecs-vp9.wasm"].sha256,"821e9b2a5a79b45ffcccced7be1c3607d061affdbc8574b828b3e660dbc7c41c");
  assert.deepEqual(c.memoryLimits,[{imported:false,initialPages:512,maximumPages:512,shared:false}]);
  assert.equal(c.nativeThreads,1);assert.equal(c.workerPool,0);assert.equal(c.originalWidthCandidate.privateVp9ExplicitWidth,1920);
  const candidate=makeWebCodecsOriginalSource((await read("media/ffmpeg/within_remux.c")).toString());
  assert.equal(c.originalWidthCandidate.compiledWrapperSha256,candidate.generatedSha256);
  assert.equal(c.artifacts["within_remux.original.c"].sha256,candidate.generatedSha256);
  assert.equal(createHash("sha256").update(await read("media/ffmpeg/webcodecs-original-recipe.mjs")).digest("hex"),c.sources["media/ffmpeg/webcodecs-original-recipe.mjs"]);
  assert.equal(c.nodeInstantiated,false);assert.equal(c.browserConversionVerified,false);assert.equal(r.completeChromiumMemoryMeasured,false);
  assert.equal(r.speedGainProven,false);assert.equal(r.publicAcceptance,false);
});
test("terminal success retains transient bounded download failures rather than treating them as a second dispatch",async()=>{
  const r=await json("evidence/2026-11-06-webcodecs-vp9-original-build-42231818045-terminal.json");
  assert.equal(r.conclusion,"success");assert.equal(r.cleanupStepsPassed,true);
  assert.deepEqual(r.focusedTests,{tests:43,pass:43,fail:0});assert.equal(r.log.errorLines.length,3);
  assert.ok(r.log.errorLines.every(line=>line.includes("curl:")));assert.equal(r.browserConversions,0);
});
