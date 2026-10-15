import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeEbmlFullCaller as parentCaller,makeEbmlFullSupervisor as parentSupervisor,makeEbmlFullDriver as parentDriver } from "./preflight-handoff-full-recipe.mjs";
import { THREAD_PARENT_FULL } from "./threaded-validation-full-sources.mjs";
import { verifyThreadValidatorQualification } from "./threaded-validator-qualification.mjs";
export { loadQualifiedEbmlMedia,createAttemptPlaneCandidate,verifyAttemptPlaneCandidate } from "./preflight-handoff-full-recipe.mjs";
export const THREADED_FULL_FILES=["scripts/lib/threaded-validation-full-recipe.mjs","scripts/lib/threaded-validation-full-sources.mjs",
  "scripts/lib/threaded-validator-qualification.mjs","scripts/run-threaded-validation-full.mjs","tests/threaded-validation-full.test.mjs",
  THREAD_PARENT_FULL,"evidence/2026-10-15T17-48-11-250Z-composited-handoff-full-terminal-analysis.json"];
export function patchThreadedValidationDriver(source,newFiles) {
  assert.ok(newFiles.length<=128);assert.equal(new Set(newFiles).size,newFiles.length);
  const named=source.replaceAll("-private-mpeg2-composited-handoff-full-native-100ms","-private-mpeg2-threaded-validation-full-native-100ms");
  const originalNative=`const native = (args, executable = "ffmpeg") => exec(executable, args,
  { timeout: 30 * 60_000, maxBuffer: 32 * MiB });`;
  const native=`const native = async (args, executable = "ffmpeg") => {
  const begin=performance.now();
  try { return await exec(executable,args,{timeout:30*60_000,maxBuffer:32*MiB}); }
  catch(error) {
    error.nativeValidation={scope:"independent-native-validator-not-browser-converter",executable,
      elapsedMs:performance.now()-begin,maximumMs:30*60_000,maxBuffer:32*MiB,
      code:error.code??null,signal:error.signal??null,killed:typeof error.killed==="boolean"?error.killed:null};
    throw error;
  }
};`;
  const oldGate=`const fullSourceFiles = [...new Set([...sourceFiles,...historicalSourceFiles,...additiveSourceFiles,...legacySourceFiles,...supplementalSourceFiles,...extensionSourceFiles])];
assert.equal(fullSourceFiles.length,legacySourceFiles.length+supplementalSourceFiles.length+extensionSourceFiles.length);`;
  const newGate=`const executedParentSourceFiles = [...new Set([...sourceFiles,...historicalSourceFiles,...additiveSourceFiles,...legacySourceFiles,...supplementalSourceFiles,...extensionSourceFiles])];
assert.equal(executedParentSourceFiles.length,714);
const validatorExtensionSourceFiles=${JSON.stringify(newFiles)};assert.ok(validatorExtensionSourceFiles.length<=128);
assert.ok(validatorExtensionSourceFiles.every(file=>!executedParentSourceFiles.includes(file)));
const fullSourceFiles=[...executedParentSourceFiles,...validatorExtensionSourceFiles];
assert.equal(fullSourceFiles.length,714+validatorExtensionSourceFiles.length);`;
  return exactPatch(source,[[source,named],[originalNative,native],[oldGate,newGate],
    ['  const { stdout } = await native(["-v", "error", "-select_streams", "v:0", "-show_frames",',
      '  const { stdout } = await native(["-v", "error", "-threads", file===source?"4":"1", "-select_streams", "v:0", "-show_frames",'],
    ['failure = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1;',
      'failure = {name:error.name,message:String(error.message??error).slice(0,8192),stack:String(error.stack??"").slice(0,8192),nativeValidation:error.nativeValidation??null,code:error.code??null,signal:error.signal??null,killed:typeof error.killed==="boolean"?error.killed:null,stderrTail:typeof error.stderr==="string"?error.stderr.slice(-8192):null}; process.exitCode = 1;'],
  ]);
}
export async function makeEbmlFullDriver(root,runtime,name,files) {
  const previous=JSON.parse(await readFile(path.join(root,THREAD_PARENT_FULL))),parentFiles=Object.keys(previous.sourcePins);
  assert.equal(parentFiles.length,714);for(const file of parentFiles)assert.ok(files.includes(file),file);
  const additions=files.filter(file=>!parentFiles.includes(file));assert.ok(additions.length<=128);
  const parent=await parentDriver(root,runtime,name,parentFiles),qualification=await verifyThreadValidatorQualification(root);
  return {...parent,...patchThreadedValidationDriver(parent.generated,additions),nativeValidatorQualification:qualification.reference,
    browserCodecIoQualityMemoryRepeatAndCleanupGatesChanged:false};
}
export async function makeEbmlFullCaller(root) {
  const parent=await parentCaller(root),qualification=await verifyThreadValidatorQualification(root);
  const previous=JSON.parse(await readFile(path.join(root,THREAD_PARENT_FULL)));
  const extra=[...new Set([...parent.extraFiles,...Object.keys(previous.sourcePins),...THREADED_FULL_FILES,...qualification.files])];
  const uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const before=uri("preflight-handoff-full-recipe.mjs"),after=uri("threaded-validation-full-recipe.mjs");
  assert.equal(parent.generated.split(before).length-1,3);
  const named=parent.generated.replaceAll(before,after)
    .replaceAll("${stamp}-composited-handoff-full-live","${stamp}-threaded-validation-full-live")
    .replaceAll("${stamp}-composited-handoff-original-full","${stamp}-threaded-validation-original-full")
    .replaceAll("-private-mpeg2-composited-handoff-full-native-100ms.json","-private-mpeg2-threaded-validation-full-native-100ms.json")
    .replaceAll("|composited-handoff)-full-live","|composited-handoff|threaded-validation)-full-live");
  return {...parent,...exactPatch(parent.generated,[[parent.generated,named],
    [uri("composited-handoff-full-sources.mjs"),uri("threaded-validation-full-sources.mjs")],
    [`import { inspectStressHostMemory } from ${JSON.stringify(uri("host-memory-preflight.mjs"))};`,
      `import { inspectStressHostMemory } from ${JSON.stringify(uri("host-memory-preflight.mjs"))};\nimport { verifyThreadValidatorQualification } from ${JSON.stringify(uri("threaded-validator-qualification.mjs"))};`],
    ['const callerFiles = [','const callerFiles = ['+extra.map(file=>JSON.stringify(file)).join(",")+','],
    ['  qualifiedBrowser:browserQualification.reference,','  nativeValidatorQualification:'+JSON.stringify(qualification.reference)+',nativeValidatorQualificationAfter:null,qualifiedBrowser:browserQualification.reference,'],
    ['  const actions = [async () => { proof.browserPinAfter=',
      '  const actions = [async () => {proof.nativeValidatorQualificationAfter=(await verifyThreadValidatorQualification(root)).reference;assert.deepEqual(proof.nativeValidatorQualificationAfter,proof.nativeValidatorQualification);},async () => { proof.browserPinAfter='],
    ['parentFilesRetained:588,parentLegacyFilesRetained:380,parentSupplementalFilesRetained:128,parentExtensionFilesRetained:80,',
      'parentFilesRetained:714,previousHistoricalParentFiles:588,parentLegacyFilesRetained:380,parentSupplementalFilesRetained:128,parentExtensionFilesRetained:80,'],
  ]),extraFiles:extra,nativeValidatorQualification:qualification.reference,browserCodecIoQualityMemoryRepeatAndCleanupGatesChanged:false};
}
export async function makeEbmlFullSupervisor(source,root) {
  const parent=await parentSupervisor(source,root),before="scripts/run-preflight-handoff-full.mjs",after="scripts/run-threaded-validation-full.mjs";
  assert.equal(parent.generated.split(before).length-1,3);
  const named=parent.generated.replaceAll(before,after).replaceAll("composited-handoff-supervisor","threaded-validation-supervisor");
  return {...parent,...exactPatch(parent.generated,[[parent.generated,named]]),noAutomaticRestart:true};
}
