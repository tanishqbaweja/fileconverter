import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const file="evidence/2026-10-14T19-03-00-388Z-ebml-reuse-full-terminal-analysis.json";
test("actual changed full remains failed0/3; supervisor0 is not converter1 pass, pool request not heapextent or old demux request",async()=>{
  const p=JSON.parse(await read(file));assert.equal(p.actualDriverExitCode,1);assert.equal(p.supervisor.exitCode,0);assert.equal(p.supervisor.notConversionPass,true);
  assert.equal(p.completedValidatedRuns,0);assert.equal(p.requestedRuns,3);assert.equal(p.frames,34334);
  assert.equal(p.capturedPoolRequest.payloadBytes,1163520);assert.equal(p.capturedPoolRequest.refcountHeaderBytes,16);
  assert.equal(p.capturedPoolRequest.failedIndividualAllocationBytes,1163536);assert.equal(p.capturedPoolRequest.liveEntriesBeforeRequest,5);
  assert.equal(p.capturedPoolRequest.cachedEntriesInRequestedPoolBeforeRequest,0);assert.equal(p.capturedPoolRequest.poolName,null);
  assert.equal(p.internalMallocChunkBytes,null);assert.equal(p.poolNameCertified,false);
});
test("complete217-header free inventory proves immediate contiguous shortage, never an underlying policy/lifetime proof",async()=>{
  const p=JSON.parse(await read(file)),free=p.allocatorFreeInventory;
  assert.equal(free.headerWordsRead,217);assert.equal(free.freeChunks,29);assert.equal(free.totalFreeChunkBytes,1712080);
  assert.equal(free.largestFreeChunkBytes,770000);assert.equal(p.optimisticTopPlusTailBytes,915920);
  assert.ok(p.optimisticTopPlusTailBytes<p.capturedPoolRequest.failedIndividualAllocationBytes);
  assert.equal(p.contiguousSpaceShortageSupported,true);assert.equal(p.underlyingFragmentationLifetimeOriginProven,false);
  for(const flag of ["heapCopied","payloadRead","nativeFunctionsCalled","allocatorMutated","fragmentationCauseProven"])assert.equal(free[flag],false);
});
test("failed-window210.6328125MiB/14,354 samples preserves two cutoff counts, missingfinally phase and deferred native lease; not memory acceptance",async()=>{
  const p=JSON.parse(await read(file)),memory=p.failedWindowMemory;
  assert.equal(memory.incrementalPrivateMiB,(464683008-243818496)/1048576);assert.equal(memory.activePhaseValidSamples,11274);
  assert.equal(memory.runNativeSnapshotValidSamples,11281);assert.equal(memory.nativeSequence,14354);
  assert.equal(memory.phases.length,6);assert.equal(memory.finallyCleanupNativePhasePresent,false);assert.equal(memory.completeAcceptance,false);
  const lease=p.asyncifyFinal[0];assert.equal(lease.allocations,1);assert.equal(lease.frees,0);assert.equal(lease.retainedBytes,262156);
  assert.equal(lease.abortedReleaseDeferredUntilWorkerTermination,true);assert.equal(p.completeChromiumMemoryAcceptance,false);
  assert.equal(p.originalFullAcceptance,false);assert.equal(p.speedGainProven,false);assert.equal(p.publicAcceptance,false);
});
test("all546 sources/27 exact births/originalSHA and625MB partial cleanup verified; checkpoint duplicate removed only after exact archive",async()=>{
  const p=JSON.parse(await read(file));assert.equal(p.sourceCount,546);assert.equal(p.allExecutedCurrentPostPreimagesVerified,true);
  assert.equal(p.birthChecks.length,27);assert.ok(p.birthChecks.every(row=>row.ownedBirthAbsent));
  assert.equal(p.originalWholePrePostCurrentSha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(p.partialOutputBytes,625007256);assert.equal(p.partialOutputRemoved,true);
  const record=p.verifiedRemovedDuplicateCheckpoint;const zip=await read(record.archive.path);assert.equal(sha(zip),record.archive.sha256);
  const bytes=gunzipSync(zip);assert.equal(bytes.length,29633);assert.equal(sha(bytes),record.sha256);
  await assert.rejects(access(path.join(root,record.path)),{code:"ENOENT"});
});
test("post-execution audit lint correction retains exact executed preimage and does not rewrite/replay sealed results",async()=>{
  const correction=JSON.parse(await read("evidence/ebml-terminal-post-execution-lint-correction-2026-10-15.json"));
  const proof=JSON.parse(await read(file)),old=Buffer.from(proof.ownSource.preimage,"base64").toString();
  assert.equal(sha(old),correction.executedSourceSha256);assert.equal(sha(await read(correction.analyzer)),correction.currentSourceSha256);
  assert.equal(old.replace(correction.before,correction.after),(await read(correction.analyzer)).toString());
  assert.equal(correction.originalEvidenceUnmodified,true);assert.equal(correction.actualSixPhaseResultsEqual,true);
  assert.equal(correction.analyzerReplayed,false);assert.equal(correction.conversionReplayed,false);assert.equal(correction.validationGatesChanged,false);
});
