// Current actual receipts/preimages/outputs/cleanup, no browser replay.
import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectReallocMediaReport } from "../scripts/lib/realloc-media-report-inspector.mjs";
import { reallocMediaComponents } from "../scripts/lib/realloc-media-components.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),json=async file=>JSON.parse(await read(file));
const stamp="2026-10-14T09-09-29-345Z",proofFile=`evidence/${stamp}-journaled-realloc-media.json`;
async function restore(record,maximum) {
  const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
  const bytes=gunzipSync(zip,{maxOutputLength:maximum});assert.equal(bytes.length,record.restoredBytes);assert.equal(sha(bytes),record.restoredSha256);return JSON.parse(bytes);
}
test("actual combined fatal callback121-source closure retains native API/current slot/error and no media attribution",async()=>{
  const parts=await reallocMediaComponents(root),row=parts.proof.result.terminal.emitted;
  assert.equal(row.maximumScalarWords,32);assert.equal(row.validatedScalarWords,16);assert.equal(row.reallocAttempt.wordsRead,16);
  assert.equal(row.allocationAttempt,null);assert.equal(row.latePoolRequest,null);assert.equal(row.failedIndividualAllocationBytes,null);
  assert.equal(row.allocationApiRequestedBytes,33554432);assert.equal(row.allocatorFreeBlocks.headerWordsRead,44);
  assert.equal(parts.proof.result.terminal.originalCalls,1);assert.equal(parts.proof.cleanup.checkedNativeIdentities,12);
  assert.equal(parts.proof.result.terminal.converterInvoked,false);assert.equal(parts.witness.protectedSourceRead,false);
});
test("actual249-source pre/current/post exact media closure under256/8MiB caps retains all old210 and new121 sources",async()=>{
  const proof=await json(proofFile),archive=await restore(proof.generatedArchive,8388608);assert.equal(Object.keys(proof.sourcePins).length,249);
  assert.deepEqual(proof.sourcePins,proof.postSourcePins);assert.deepEqual(proof.sourcePins,archive.sourcePins);
  for(const [file,hash] of Object.entries(proof.sourcePins)){assert.equal(sha(await read(file)),hash,file);assert.equal(sha(archive.sources[file]),hash,file);}
  const parts=await reallocMediaComponents(root);
  for(const [file,hash] of Object.entries({...parts.previous.sourcePins,...parts.witness.sourcePins}))assert.equal(proof.sourcePins[file],hash,file);
  assert.equal(archive.generated.composition.manifest.artifacts["within-mpeg2-split.wasm"],"eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c");
  assert.equal(archive.generated.asyncifyGlueRecipe.originalSha256,"57fab45eaf3c9a3a89b87ada328c82bde87083c15a877dc7e794a8a6c3e8925c");
  assert.equal(archive.generated.infrastructureTimeout.individualTestTimeoutMs,60000);assert.equal(archive.generated.infrastructureTimeout.conversionAcceptanceThresholdsChanged,false);
});
test("four ACTUAL genuine outputs/recovery retain exact golden/SSIM/plane encoder/leases; wrong binary/missing recovery refused, no stress acceptance",async()=>{
  const proof=await json(proofFile),report=await restore(proof.report.archive,2097152),baseline=(await json(proof.baseline.path)).reports[0].report,build=await json(proof.build.path);
  assert.equal(proof.failure,null);assert.deepEqual(inspectReallocMediaReport(report,baseline,build),proof.analysis);
  assert.equal(proof.analysis.genuineValidatedConversions,4);assert.equal(proof.completeChromiumMemoryAcceptance,false);assert.equal(proof.originalFullSourceAcceptance,false);assert.equal(proof.publicAcceptance,false);
  const rows=report.rows.filter(x=>(!x.kind&&x.status==="passed")||x.kind==="independent-frame-diagnostic");assert.equal(rows.length,8);
  for(const row of rows){assert.equal(row.outputSha256,"554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27");assert.equal(row.outputBytes,2245558);}
  assert.equal(proof.analysis.previous.normal.ordinalSsim,.983095);assert.equal(proof.analysis.previous.normal.qualityThreshold,.98);
  for(const row of [...proof.analysis.previous.actualAsyncifyLifecycleSamples,...proof.analysis.actualExtraAsyncifyLifecycle]){assert.equal(row.allocations,1);assert.equal(row.frees,1);assert.equal(row.retainedBytes,0);}
  const altered=structuredClone(report);altered.manifest.artifacts["within-mpeg2-split.wasm"]="7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439";
  assert.throws(()=>inspectReallocMediaReport(altered,baseline,build));
  const missing=structuredClone(report);missing.rows=missing.rows.filter(x=>x.kind!=="validated-same-page-recovery");assert.throws(()=>inspectReallocMediaReport(missing,baseline,build));
});
test("actual fixture identity/parent close/raw archive/source-bound independent verification and original preservation, no broad delete/public claim",async()=>{
  const proof=await json(proofFile),file=`evidence/${stamp}-journaled-realloc-media-independent-qualification.json`,independent=await json(file);
  assert.equal(independent.receipt.sha256,sha(await read(proofFile)));assert.equal(sha(await read(independent.ownSource.path)),independent.ownSource.sha256);
  assert.equal(sha(Buffer.from(independent.ownSource.preimage,"base64")),independent.ownSource.sha256);
  assert.equal(independent.journal.registered,true);assert.equal(independent.journal.status,"registered-fixture-already-removed");
  assert.equal(independent.birthChecks.length,15);assert.equal(independent.sampledPidChecks.length,23);
  for(const row of independent.birthChecks)assert.equal(row.ownedBirthAbsent,true);
  for(const row of independent.sampledPidChecks){assert.equal(row.sampledProcessGone,true);assert.equal(row.birthWasNotRecordedInConversionMemorySample,true);}
  for(const directory of [proof.cleanup.ownedWrapper,proof.cleanup.helpers.runtime,independent.journal.record.directory])await assert.rejects(access(directory),{code:"ENOENT"});
  await assert.rejects(access(path.join(root,proof.report.path)),{code:"ENOENT"});await restore(proof.report.archive,2097152);
  assert.equal(independent.removedRedundantRawJson.bytes,984007);assert.equal(independent.primaryIncrementalPrivateMiB,null);assert.equal(independent.speedGainProven,false);
  assert.equal(independent.headedCoverageVerified,false);assert.deepEqual(proof.protectedPre,proof.protectedPost);
  assert.equal(independent.originalWholePrePostCurrentSha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
});
test("actual failed180s attempt remains distinct243-source evidence, not rewritten to passing suite; owned20.7MB residue gone",async()=>{
  const failure=await json("evidence/2026-10-14T08-57-06-152Z-realloc-media-watchdog-failure.json");
  assert.equal(failure.status,"failed-suite-watchdog-not-four-conversion-acceptance");assert.equal(failure.fourConversionsIndependentlyQualified,false);
  assert.equal(failure.fullTerminalBrowserReportRetained,false);assert.equal(failure.originalSuiteGlobalWatchdogMs,180000);assert.equal(failure.individualTestTimeoutMs,60000);
  const archive=await restore(failure.archive,8388608);assert.equal(Object.keys(archive.sourcePins).length,243);
  for(const [file,hash] of Object.entries(archive.sourcePins)){assert.equal(sha(archive.sources[file]),hash);assert.equal(sha(await read(file)),hash);}
  assert.equal(failure.leftoverOutputOnly.nativeFullDecodePassed,true);assert.equal(failure.cleanup.removedBytes,20696643);
  await assert.rejects(access(failure.cleanup.path),{code:"ENOENT"});assert.equal(sha(await read(failure.ownSource.path)),failure.ownSource.sha256);
});
