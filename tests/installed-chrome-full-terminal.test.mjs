import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/installed-chrome-full-sources.mjs";
import { validateCompositeAllocationFailureRecord } from "../scripts/lib/realloc-full-failure-record.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),stamp="2026-10-14T16-27-26-406Z";
const proof=JSON.parse(await read(`evidence/${stamp}-installed-chrome-realloc-full-terminal-analysis.json`));
async function rawReport(){const zip=await read(proof.rawArchive.path);assert.equal(sha(zip),proof.rawArchive.sha256);const bytes=gunzipSync(zip,{maxOutputLength:33554432});assert.equal(sha(bytes),proof.rawArchive.restoredSha256);return JSON.parse(bytes);}
test("actual full34348-frame failure captures CURRENT273954B initial NULL-buffer realloc API, not33.7MB heap extent or invented malloc chunk",async()=>{
  const raw=await rawReport(),row=raw.abortDiagnostic.records[0];assert.equal(validateCompositeAllocationFailureRecord(row),row);
  assert.equal(row.reallocAttempt.sequence,73389);assert.equal(row.reallocAttempt.allocationApiRequestedBytes,273954);assert.equal(row.reallocAttempt.oldBufferRefAddress,0);assert.equal(row.reallocAttempt.reallocPointerAddress,0);
  assert.equal(row.reallocAttempt.wordsRead,16);assert.equal(row.validatedScalarWords,16);assert.equal(row.failedIndividualAllocationBytes,null);
  assert.equal(proof.nativeFailure.requestedHeapExtentBytes,33759232);assert.equal(proof.nativeFailure.failedIndividualMallocChunkBytes,null);assert.equal(proof.frames,34348);
  assert.equal(proof.completedValidatedConversions,0);assert.equal(proof.independentFullFidelityValidation,null);assert.equal(proof.fullOriginalAcceptance,false);
});
test("bounded383-header inventory proves no inventoried chunk meets request while aggregatefree>2MiB; lifetime/origin inference explicitly unproven",()=>{
  const failure=proof.nativeFailure,inventory=failure.abortRecord.allocatorFreeBlocks;
  assert.equal(inventory.complete,true);assert.equal(inventory.totalFreeChunkBytes,2071568);assert.equal(inventory.largestFreeChunkBytes,246016);assert.equal(inventory.freeChunks,74);assert.equal(inventory.headerWordsRead,383);
  assert.ok(inventory.largestFreeChunkBytes<failure.allocationApiRequestedBytes);assert.ok(inventory.totalFreeChunkBytes>failure.allocationApiRequestedBytes);
  assert.equal(failure.underlyingLifetimeOrFragmentationOriginProven,false);assert.equal(failure.abortRecord.originalFailureCauseProven,false);
  for(const flag of ["payloadRead","heapCopied","nativeFunctionsCalled","allocatorMutated"])assert.equal(inventory[flag],false);
});
test("exact failed-window230.09375MiB/not acceptance; source508 and raw/checkpoint seven phase counts recover without cap/cutoff changes",async()=>{
  const raw=await rawReport(),memory=proof.failedWindowMemory;
  assert.equal(memory.baselinePrivateBytes,246951936);assert.equal(memory.peakPrivateBytes,488222720);assert.equal((memory.peakPrivateBytes-memory.baselinePrivateBytes)/1048576,230.09375);
  assert.equal(memory.activePhaseSamples,11268);assert.equal(memory.runPeakSnapshotSamples,11278);assert.equal(memory.acceptance,false);assert.equal(memory.nativeSequence,14388);
  assert.equal(raw.nativeMemory.receiptClockFence.samplesDropped,0);assert.equal(raw.nativeMemory.receiptClockFence.timestampsRewritten,0);
  const archive=await materializeLayeredFullSourceArchive(root,proof.sourceArchive);assert.equal(Object.keys(archive.sourcePins).length,508);
  for(const [file,hash] of Object.entries(archive.sourcePins)){assert.equal(sha(await read(file)),hash,file);assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data,"base64")),hash,file);}
  const zip=await read(proof.durableCheckpoint.path);assert.equal(sha(zip),proof.durableCheckpoint.sha256);const bytes=gunzipSync(zip,{maxOutputLength:2097152});assert.equal(sha(bytes),proof.durableCheckpoint.restoredSha256);
  const checkpoint=JSON.parse(bytes);assert.equal(checkpoint.coverageThroughSequence,14388);assert.equal(proof.durableCheckpoint.phases.length,7);
  assert.equal(proof.sourceCapsChanged,false);assert.equal(proof.completeChromiumMemoryAcceptance,false);assert.equal(proof.speedGainProven,false);
});
test("actual626MB partial removed,27 recorded births absent/protected whole SHA stable and stock restored; supervisor0 never conversionpass",async()=>{
  const raw=await rawReport(),terminal=JSON.parse(await read(proof.terminal.path)),supervisor=JSON.parse(await read(proof.supervisor.path));
  assert.equal(sha(await read(proof.terminal.path)),proof.terminal.sha256);assert.equal(sha(await read(proof.supervisor.path)),proof.supervisor.sha256);
  assert.equal(supervisor.childExit.code,0);assert.equal(supervisor.status,"command-completed-not-conversion-acceptance");assert.equal(terminal.candidate.actualExitCode,1);assert.equal(terminal.candidate.completedConversions,0);
  assert.equal(proof.partialOutputBytesDeleted,626767162);assert.equal(proof.birthChecks.length,27);for(const row of proof.birthChecks)assert.equal(row.ownedBirthAbsent,true);
  for(const directory of [terminal.wrapper,terminal.candidateDirectory,raw.runtimeDirectory,supervisor.runtimeDirectory])await assert.rejects(access(directory),{code:"ENOENT"});
  assert.deepEqual(terminal.browserPinBefore,terminal.browserPinAfter);assert.equal(proof.browserPin.version,"155.0.8059.40");assert.deepEqual(terminal.protectedBefore,terminal.protectedAfter);
  assert.equal(proof.protectedOriginal.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(sha(await read(proof.ownSource.path)),proof.ownSource.sha256);assert.equal(sha(Buffer.from(proof.ownSource.preimage,"base64")),proof.ownSource.sha256);
  assert.equal(proof.noConversionRelaunched,true);assert.equal(proof.etaSleepSeconds,1800);assert.equal(proof.publicAcceptance,false);
});
