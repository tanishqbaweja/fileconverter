// Portable behavior coverage, independent of the historically pinned installed Chrome.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { versionCommand, isReadonlyPreflight, retryReadonlyPreflight } from "../scripts/lib/reliable-readonly-preflight.mjs";
test("only exact hidden readonly preflights qualify; retries preserve failures and bounded attempts", async () => {
  const args=["-NoProfile","-NonInteractive","-Command",versionCommand], options={windowsHide:true,timeout:5000,maxBuffer:16384};
  assert.equal(isReadonlyPreflight("powershell.exe",args,options),true);
  for(const [file,values,opts] of [["ffmpeg",args,options],["powershell.exe",[...args,"extra"],options],
    ["powershell.exe",args,{...options,windowsHide:false}],["powershell.exe",args,{...options,timeout:21600000}],
    ["powershell.exe",[...args.slice(0,3),versionCommand+";Remove-Item x"],options]]) assert.equal(isReadonlyPreflight(file,values,opts),false);
  let attempts=0; const pauses=[];
  assert.equal(await retryReadonlyPreflight(async()=>{if(++attempts<3)throw new Error("unavailable");return "actual";},{pause:async ms=>{pauses.push(ms);}}),"actual");
  assert.equal(attempts,3); assert.deepEqual(pauses,[250,250]);
  const failure=new Error("unavailable" ); attempts=0;
  await assert.rejects(retryReadonlyPreflight(async()=>{attempts++;throw failure;},{pause:async()=>{}}),error=>error===failure);
  assert.equal(attempts,3);
});
test("ordinary hidden subprocess callback and promisified results are not converted into successes or fabricated values",async()=>{
  const {stdout,stderr}=await promisify(execFile)(process.execPath,["-e","process.stdout.write('bounded');process.stderr.write('diagnostic')"],{windowsHide:true,timeout:5000,maxBuffer:16384});
  assert.equal(stdout,"bounded");assert.equal(stderr,"diagnostic");
  await assert.rejects(promisify(execFile)(process.execPath,["-e","process.exitCode=7"],{windowsHide:true,timeout:5000,maxBuffer:16384}),error=>error.code===7);
});
