import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/threaded-validation-full-sources.mjs";
const root=path.resolve(import.meta.dirname,"..");
const preparation="evidence/2026-10-15T22-21-04-092Z-threaded-validation-original-full-preparation.json";
async function actual(){const proof=JSON.parse(await readFile(path.join(root,preparation)));return{proof,archive:await materializeLayeredFullSourceArchive(root,proof.sourceArchive)};}
test("actual726-source preparation replays every source and both native pins with no conversion or scratch",async()=>{
  const {proof,archive}=await actual();assert.equal(proof.status,"prepared-not-executed");assert.equal(proof.executions,0);
  assert.equal(proof.failure,null);assert.deepEqual(proof.cleanupErrors,[]);assert.deepEqual(proof.sourcePins,proof.postSourcePins);
  assert.equal(Object.keys(proof.sourcePins).length,726);assert.deepEqual(archive.sourcePins,proof.sourcePins);assert.equal(archive.allPreimagesRecovered,true);
  assert.equal(proof.sourceArchive.parentPreimages,714);assert.equal(proof.sourceArchive.extensionPreimages,12);
  assert.equal(proof.sourceLayers.limits.extensionFiles,128);assert.equal(proof.sourceLayers.limits.extensionRestoredBytes,2097152);
  assert.deepEqual(proof.nativeValidatorQualification,proof.nativeValidatorQualificationAfter);
  assert.equal(proof.nativeValidatorQualification.threads,4);assert.equal(proof.nativeValidatorQualification.sourceOnly,true);
  assert.equal(proof.nativeValidatorQualification.nativeMaximumMs,1800000);
  assert.equal(proof.primaryLimitMiB,250);assert.equal(proof.requestedRuns,3);assert.equal(proof.maximumConversionMsPerRun,21600000);
  assert.deepEqual(proof.protectedBefore,proof.protectedAfter);assert.equal(proof.protectedAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.productionRestored,true);assert.equal(proof.wrapperAbsent,true);assert.equal(proof.candidateAbsent,true);
  for(const directory of [proof.wrapper,proof.candidateDirectory])await assert.rejects(access(directory),{code:"ENOENT"});
});
test("actual generated native error wrapper preserves failure identity, deadline/buffer options and explicit exit fields",async()=>{
  const {archive}=await actual(),start=archive.generated.indexOf("const native = async"),end=archive.generated.indexOf("\nasync function probe",start);
  assert.ok(start>=0&&end>start);const snippet=archive.generated.slice(start,end)+"\nglobalThis.actualNative=native;";
  const failure=Object.assign(new Error("test independent validator exit"),{code:7,signal:null,killed:false});
  let call=null,ticks=100;
  const context={MiB:1048576,performance:{now:()=>ticks+=100},exec:async(...args)=>{call=args;throw failure;}};
  vm.runInNewContext(snippet,context);
  await assert.rejects(context.actualNative(["-v","error"],"ffprobe"),error=>error===failure);
  assert.equal(call[0],"ffprobe");assert.equal(call[2].timeout,1800000);assert.equal(call[2].maxBuffer,33554432);
  assert.equal(failure.nativeValidation.code,7);assert.equal(failure.nativeValidation.signal,null);assert.equal(failure.nativeValidation.killed,false);
  assert.equal(failure.nativeValidation.elapsedMs,100);assert.equal(failure.nativeValidation.maximumMs,1800000);
});
