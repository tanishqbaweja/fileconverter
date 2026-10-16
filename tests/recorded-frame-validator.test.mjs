import assert from "node:assert/strict";
import {mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import test from "node:test";
import {createRecordedFrameValidator} from "../scripts/lib/recorded-frame-validator.mjs";
import {executedFrameTimesBody} from "../scripts/lib/timestamp-csv-diagnostic.mjs";
import {createOwnedRuntimeScratch} from "../scripts/lib/owned-runtime-scratch.mjs";
const repo=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(repo,file));
const diagnosticProof=JSON.parse(await read("evidence/2026-10-16T21-01-48-525Z-source-timestamp-csv-diagnostic.json"));
const referenceProof=JSON.parse(await read("evidence/2026-10-16T21-01-48-525Z-qualified-source-timeline-reference.json"));
const terminal=JSON.parse(await read("evidence/2026-10-16T17-01-47-260Z-updated-chrome-full-terminal.json"));
const archive=JSON.parse(gunzipSync(await read(terminal.sourceArchive.path),{maxOutputLength:8388608}));
const frameTimesBody=executedFrameTimesBody(archive.driver);
async function setup(native,sourceHash=async()=>referenceProof.source.sha256) {
  const runtime=await createOwnedRuntimeScratch("recorded-validator-test-");
  const root=runtime.directory,source=path.join(root,"test.mkv"),reportPrefix=path.join(root,"outputs/reports/focused-native-validator");await mkdir(path.dirname(reportPrefix),{recursive:true});
  const validate=createRecordedFrameValidator({root,source,reportPrefix,diagnosticProof,referenceProof,frameTimesBody,native,sourceHash,ffprobePath:"C:/ffmpeg/bin/ffprobe.exe"});
  return {runtime,root,source,reportPrefix,validate};
}
test("exact immutable source reference avoids another decode and refuses changed source bytes",async()=>{
  let nativeCalls=0;const item=await setup(async()=>{nativeCalls++;throw Error("Source must not decode again");});
  try {const times=await item.validate(item.source);assert.equal(times.length,296160);assert.equal(times.at(-1),12339.958);assert.equal(nativeCalls,0);}
  finally{await item.runtime.close();}
  const changed=await setup(async()=>{},async()=>"0".repeat(64));
  try{await assert.rejects(changed.validate(changed.source),/unchanged exact original/);}finally{await changed.runtime.close();}
});
test("refuse a substituted parser before any native command",async()=>{
  const item=await setup(async()=>{throw Error("Must not run");});
  try {
    assert.throws(()=>createRecordedFrameValidator({root:item.root,source:item.source,reportPrefix:item.reportPrefix,
      diagnosticProof,referenceProof,frameTimesBody:frameTimesBody+" ",native:async()=>{},ffprobePath:"C:/ffmpeg/bin/ffprobe.exe"}),/exact executed parser/);
  }finally{await item.runtime.close();}
});
test("opaque short timestamp count is rejected and its raw evidence is retained",async()=>{
  const item=await setup(async(args,exe)=>{assert.equal(exe,"C:/ffmpeg/bin/ffprobe.exe");return {stdout:"0.000000\n0.042000\n",stderr:""};});
  try {
    await assert.rejects(item.validate(path.join(item.root,"work/output.mp4")),/Every output frame/);
    const record=JSON.parse(await readFile(item.reportPrefix+"-output-timestamps-1.json"));
    assert.equal(record.frames,2);assert.equal(record.maximumMs,1800000);assert.equal(record.maximumStdoutBytes,33554432);
    assert.equal(record.expectedFrames,296160);assert.equal(record.countMatchesExpected,false);
    assert.equal(record.stderr.bytes,0);assert.equal(record.fullOriginalAcceptance,false);
    const raw=gunzipSync(await readFile(path.join(item.root,record.stdout.archive.path)),{maxOutputLength:33554432});assert.equal(raw.toString(),"0.000000\n0.042000\n");
  }finally{await item.runtime.close();}
});
test("native failure preserves bounded stdout, stderr and original error identity",async()=>{
  const failure=Object.assign(new Error("native failure"),{stdout:"0.000000\n",stderr:"native error\n",code:7,signal:null});
  const item=await setup(async()=>{throw failure;});
  try {
    await assert.rejects(item.validate(path.join(item.root,"work/output.mp4")),error=>error===failure);
    const record=JSON.parse(await readFile(item.reportPrefix+"-output-timestamps-1.json"));
    assert.equal(record.failure.code,7);assert.equal(record.stderr.tail,"native error\n");assert.equal(record.stdout.bytes,9);assert.equal(record.frames,1);
  }finally{await item.runtime.close();}
});
test("successful exit with FFprobe error stderr fails and records the diagnostic",async()=>{
  const item=await setup(async()=>({stdout:"0.000000\n",stderr:"decode failed\n"}));
  try {
    await assert.rejects(item.validate(path.join(item.root,"work/output.mp4")),/error-level stderr/);
    const record=JSON.parse(await readFile(item.reportPrefix+"-output-timestamps-1.json"));
    assert.equal(record.status,"failed-independent-frame-probe");assert.equal(record.stderr.tail,"decode failed\n");assert.equal(record.frames,1);
  }finally{await item.runtime.close();}
});
test("all expected output timestamps pass the unchanged strict parser",async()=>{
  let nativeCalls=0;const stdout=Array.from({length:296160},(_,index)=>(Math.round(index*1000/24)/1000).toFixed(6)).join("\n")+"\n";
  const item=await setup(async(args,exe)=>{nativeCalls++;assert.equal(exe,"C:/ffmpeg/bin/ffprobe.exe");assert.deepEqual(args.slice(0,4),["-v","error","-threads","1"]);return {stdout,stderr:""};});
  try {
    const times=await item.validate(path.join(item.root,"work/output.mp4"));assert.equal(times.length,296160);assert.equal(times.at(-1),12339.958);assert.equal(nativeCalls,1);
    const record=JSON.parse(await readFile(item.reportPrefix+"-output-timestamps-1.json"));assert.equal(record.frames,296160);assert.equal(record.countMatchesExpected,true);
    assert.equal(record.fullOriginalAcceptance,false);
  }finally{await item.runtime.close();}
});
