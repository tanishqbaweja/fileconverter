// Joins ACTUAL old210-source media + new121-source fatal + native86 evidence.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { verifyReallocNativeEnvelope } from "./realloc-native-envelope.mjs";
import { makeReallocAsyncifyGlue } from "./realloc-asyncify-glue-recipe.mjs";
import { REALLOC_DECODER_SHA256 } from "./realloc-attempt-abort-capture.mjs";
import { readWasmFunctionMetadata } from "./wasm-function-metadata.mjs";
export const REALLOC_TOOL_DIRECTORY = "work/mpeg2-realloc-attempt-38526781934";
export async function reallocMediaComponents(root) {
  const read = file => readFile(path.join(root,file));
  const unpack = async (record,maximum) => {
    const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
    const raw=gunzipSync(zip,{maxOutputLength:maximum});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);return JSON.parse(raw);
  };
  const previousPath="evidence/2026-10-13T00-57-52-406Z-packet-largest-idle-media.json",previousBytes=await read(previousPath),previous=JSON.parse(previousBytes);
  assert.equal(sha(previousBytes),"a3cff63fbda9bbc41c80de30dd25ff206bbcc042e389c4d74546aa71e357c1eb");
  assert.equal(previous.failure,null);assert.equal(previous.analysis.genuineValidatedConversions,4);
  const previousArchive=await unpack(previous.generatedArchive,8388608);assert.deepEqual(previous.sourcePins,previous.postSourcePins);
  assert.deepEqual(previousArchive.sourcePins,previous.sourcePins);assert.equal(Object.keys(previous.sourcePins).length,210);
  for(const [file,hash] of Object.entries(previous.sourcePins)) {
    assert.equal(typeof previousArchive.sources[file],"string");assert.equal(sha(previousArchive.sources[file]),hash,file);assert.equal(sha(await read(file)),hash,file);
  }
  const baselineManifest=previousArchive.generated.composition.manifest,previousReport=await unpack(previous.report.archive,2097152);
  assert.deepEqual(previousReport.manifest,baselineManifest);
  const witnessPath="evidence/2026-10-14T08-50-39-535Z-realloc-composite-control-executed-sources.json",witnessBytes=await read(witnessPath),witness=JSON.parse(witnessBytes);
  const proofBytes=await read(witness.proof.path),proof=JSON.parse(proofBytes);
  assert.equal(sha(proofBytes),"9cfef97c5aed1e2d347d565848aa7b72da483070e936a2a049bc2a36d8e01ec5");assert.equal(witness.proof.sha256,sha(proofBytes));
  assert.equal(witness.failure,null);assert.equal(proof.status,"passed-synthetic-abort-control");assert.equal(proof.failure,null);
  assert.equal(proof.exportOnlyControl.originalSha256,REALLOC_DECODER_SHA256);assert.equal(proof.exportOnlyControl.usableForMediaOrAcceptance,false);
  const row=proof.result.terminal.emitted;assert.equal(row.qualifiedReallocCallPath,true);assert.equal(row.validatedScalarWords,16);assert.equal(row.maximumScalarWords,32);
  assert.equal(row.allocationApiRequestedBytes,33554432);assert.equal(row.reallocAttemptUnavailable,null);assert.equal(row.allocatorFreeBlocksUnavailable,null);
  assert.equal(row.allocationAttempt,null);assert.equal(row.latePoolRequest,null);assert.equal(row.failedIndividualAllocationBytes,null);
  assert.equal(proof.cleanup.allSampledNativeBirthsAbsent,true);assert.equal(proof.cleanup.runtimeProfileRemoved,true);
  assert.equal(witness.syntheticExportOnlyBinaryRemovedWithCallerScratch,true);await assert.rejects(access(witness.ownedCaller),{code:"ENOENT"});
  const archive=await unpack(witness.archive,2097152);assert.deepEqual(witness.sourcePins,witness.postSourcePins);assert.deepEqual(archive.sourcePins,witness.sourcePins);
  assert.equal(Object.keys(witness.sourcePins).length,121);assert.ok(Object.keys(witness.sourcePins).length<=128);
  for(const [file,hash] of Object.entries(witness.sourcePins)) {assert.equal(sha(Buffer.from(archive.preimages[file],"base64")),hash,file);assert.equal(sha(await read(file)),hash,file);}
  const buildPath="evidence/mpeg2-realloc-attempt-build-38526781934.json",buildBytes=await read(buildPath),build=JSON.parse(buildBytes);
  const branchPath="evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json",branch=JSON.parse(await read(branchPath));
  const envelope=await verifyReallocNativeEnvelope(root,build,buildBytes,branch);assert.deepEqual(envelope,witness.nativeEnvelope);assert.deepEqual(envelope,witness.nativeEnvelopePost);
  assert.equal(build.manifest.artifacts["within-mpeg2-split.wasm"],REALLOC_DECODER_SHA256);
  for(const file of build.files) {const bytes=await read(`${REALLOC_TOOL_DIRECTORY}/${file.file}`);assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);}
  const glue=await makeReallocAsyncifyGlue(root,(await read(`${REALLOC_TOOL_DIRECTORY}/within-mpeg2-split.mjs`)).toString());
  const binary=await read(`${REALLOC_TOOL_DIRECTORY}/within-mpeg2-split.wasm`);
  const expectedFunctions=new Map([["av_buffer_allocz",4189],["av_malloc",4314],["av_refstruct_pool_get",4381],["mpeg2_packets",4471],["__wrap_posix_memalign",4473],["sbrk",4442]]);
  const observerTypedFunctions=readWasmFunctionMetadata(binary,new Set(expectedFunctions.keys())).map(value=>{
    assert.equal(value.functionIndex,expectedFunctions.get(value.name));assert.deepEqual(value.results,["i32"]);
    assert.deepEqual(value.params,["__wrap_posix_memalign","mpeg2_packets"].includes(value.name)?["i32","i32"]:["i32"]);
    return {...value,bodySha256:sha(binary.subarray(value.bodyStart,value.bodyEnd))};
  });
  return {previousPath,previousBytes,previous,baselineManifest,witnessPath,witnessBytes,witness,proof,buildPath,buildBytes,build,branchPath,branch,envelope,glue,observerTypedFunctions};
}
