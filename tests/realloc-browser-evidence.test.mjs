// Actual headless synthetic control; not media/correctness/full-memory acceptance.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { verifyReallocNativeEnvelope } from "../scripts/lib/realloc-native-envelope.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const witness=JSON.parse(await read("evidence/2026-10-14T08-18-27-711Z-realloc-abort-control-executed-sources.json"));
const proofBytes=await read(witness.proof.path),proof=JSON.parse(proofBytes);assert.equal(sha(proofBytes),witness.proof.sha256);
test("actual runtime constructor and six native realloc stack frames capture16 pending words/44 headers, preserve fatal/prior and no original request invention",()=>{
  assert.equal(proof.status,"passed-synthetic-abort-control");assert.equal(proof.failure,null);assert.equal(witness.failure,null);
  const {loaded,terminal}=proof.result,row=terminal.emitted;
  assert.equal(loaded.runtimeSlotAddress,1918912);assert.equal(loaded.runtimeSlotWords,16);assert.equal(loaded.shared,true);assert.equal(loaded.originIsolated,true);
  assert.equal(loaded.capture.first,null);assert.equal(loaded.capture.captureStarted,false);
  assert.equal(row.qualifiedReallocCallPath,true);assert.equal(row.qualifiedBufferReallocCallPath,true);
  assert.equal(row.allocationApiRequestedBytes,33554432);assert.equal(row.failedIndividualAllocationBytes,null);assert.equal(row.heapLiveBytes,null);
  assert.equal(row.reallocAttempt.phase,"av-realloc-pending");assert.equal(row.reallocAttempt.sequence,1);assert.equal(row.reallocAttempt.oldBufferRefAddress,0);
  assert.equal(row.validatedScalarWords,16);assert.equal(row.maximumScalarWords,16);assert.equal(row.allocatorFreeBlocks.headerWordsRead,44);
  assert.equal(row.allocatorFreeBlocks.complete,true);assert.equal(row.allocatorFreeBlocks.payloadRead,false);assert.equal(row.allocatorFreeBlocks.nativeFunctionsCalled,false);
  assert.equal(row.originalFailureCauseProven,false);assert.equal(row.fragmentationCauseProven,false);
  assert.equal(terminal.originalCalls,1);assert.equal(terminal.beforeLimit,terminal.afterLimit);assert.match(terminal.failure.message,/Cannot enlarge memory arrays/);
  assert.deepEqual(proof.result.symbolizedAbortFrames.map(x=>x.functionIndex),[4442,4437,4440,4475,4192,4474]);
  assert.equal(terminal.converterInvoked,false);assert.equal(terminal.controlCellBytes,4);
  assert.equal(proof.primaryMemoryAcceptance,false);assert.equal(proof.primaryIncrementalPrivateMiB,null);assert.equal(proof.browserConversionsPerformed,0);
});
test("all114 executed/current/pre/post preimages and actual86-source native envelope recover under unchanged caps",async()=>{
  assert.equal(Object.keys(witness.sourcePins).length,114);assert.deepEqual(witness.sourcePins,witness.postSourcePins);
  assert.deepEqual(witness.nativeEnvelope,witness.nativeEnvelopePost);
  const record=witness.archive,zipped=await read(record.path);assert.equal(zipped.length,record.bytes);assert.equal(sha(zipped),record.sha256);
  const bytes=gunzipSync(zipped,{maxOutputLength:2097152});assert.equal(bytes.length,1661849);assert.equal(sha(bytes),record.restoredSha256);
  const archive=JSON.parse(bytes);assert.deepEqual(archive.sourcePins,witness.sourcePins);
  for(const [file,hash] of Object.entries(witness.sourcePins)){assert.equal(sha(await read(file)),hash,file);assert.equal(sha(Buffer.from(archive.preimages[file],"base64")),hash,file);}
  const buildBytes=await read("evidence/mpeg2-realloc-attempt-build-38526781934.json"),build=JSON.parse(buildBytes);
  const branch=JSON.parse(await read("evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json"));
  assert.deepEqual(await verifyReallocNativeEnvelope(root,build,buildBytes,branch),witness.nativeEnvelope);
  assert.equal(proof.exportOnlyControl.onlyExportSectionChanged,true);assert.equal(proof.exportOnlyControl.allCodeDataTypesImportsTablesMemoryExact,true);
  assert.equal(proof.exportOnlyControl.originalCompiledCoreChanged,false);assert.equal(proof.exportOnlyControl.usableForMediaOrAcceptance,false);
  assert.equal(proof.exportOnlyControl.controlSha256,"29652ed98ff2b20d553431b78b3cf020c72d3ed30dacd4e306f6b3fc59ddaae5");
});
test("actual headless control privacy/11 sampled birth cleanup and temporary code/profile deletion, no user file or converted copy",async()=>{
  assert.ok(proof.flags.includes("--headless=new"));assert.deepEqual(proof.forbiddenRequests,[]);assert.deepEqual(proof.cleanup.errors,[]);
  for(const flag of ["workerTerminated","normalBrowserCloseRequested","serverClosed","allSampledNativeBirthsAbsent","runtimeProfileRemoved"])assert.equal(proof.cleanup[flag],true);
  assert.equal(proof.cleanup.checkedNativeIdentities,11);assert.equal(proof.cleanup.rootExit.status,"owned-identity-absent");assert.deepEqual(proof.cleanup.observedProcesses,[]);
  assert.equal(witness.syntheticExportOnlyBinaryRemovedWithCallerScratch,true);
  await assert.rejects(access(witness.ownedCaller),{code:"ENOENT"});await assert.rejects(access(proof.runtimeDirectory),{code:"ENOENT"});
  assert.equal(proof.protectedSourceRead,false);assert.equal(witness.protectedSourceRead,false);assert.equal(proof.publicAcceptance,false);
});
