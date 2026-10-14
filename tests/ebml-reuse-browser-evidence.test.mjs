import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const stamp="2026-10-14T18-18-41-950Z";
test("actual Chrome155 failure control binds current703 decoder and typed stack, 16 scalars/44 headers, all11 native births cleaned",async()=>{
  const witness=JSON.parse(await read("evidence/2026-10-14T18-11-48-138Z-ebml-reuse-browser-control-executed-sources.json"));
  const bytes=await read(witness.proof.path);assert.equal(sha(bytes),witness.proof.sha256);const proof=JSON.parse(bytes);
  assert.equal(proof.status,"passed-synthetic-abort-control");assert.equal(proof.browserVersion,"155.0.8059.40");
  assert.equal(proof.exportOnlyControl.originalSha256,"7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25");
  assert.equal(proof.exportOnlyControl.usableForMediaOrAcceptance,false);
  assert.deepEqual(proof.result.symbolizedAbortFrames.map(row=>row.functionIndex),[4443,4438,4441,4475,4193,4474]);
  const row=proof.result.terminal.emitted;assert.equal(row.validatedScalarWords,16);assert.equal(row.allocationApiRequestedBytes,33554432);
  assert.equal(row.allocatorFreeBlocks.headerWordsRead,44);assert.equal(row.failedIndividualAllocationBytes,null);
  assert.equal(proof.cleanup.checkedNativeIdentities,11);assert.equal(proof.cleanup.allSampledNativeBirthsAbsent,true);
  assert.equal(witness.sourceSealScopes.distinctTotalFiles,126);assert.equal(witness.nativeEnvelope.sourceCount,93);
  assert.equal(witness.sourceSealScopes.browser.actualFiles,35);assert.deepEqual(witness.sourcePins,witness.postSourcePins);
  await assert.rejects(access(witness.ownedCaller),{code:"ENOENT"});
});
test("actual 273 media-source preimages retain old255+new18 without omissions and both immutable byte budgets",async()=>{
  const media=JSON.parse(await read(`evidence/${stamp}-ebml-reuse-media.json`));
  const extra=JSON.parse(await read("evidence/2026-10-14T18-18-41-941Z-ebml-reuse-media-supplement.json"));
  for(const [receipt,record,limit,text]of [[media,media.generatedArchive,8388608,true],[extra,extra.archive,2097152,false]]) {
    const zip=await read(record.path);assert.equal(sha(zip),record.sha256);const raw=gunzipSync(zip,{maxOutputLength:limit});assert.equal(sha(raw),record.restoredSha256);
    const archive=JSON.parse(raw);assert.deepEqual(archive.sourcePins,receipt.sourcePins);assert.deepEqual(receipt.sourcePins,receipt.postSourcePins);
    for(const [file,hash]of Object.entries(receipt.sourcePins)) {assert.equal(sha(text?archive.sources[file]:Buffer.from(archive.preimages[file],"base64")),hash);assert.equal(sha(await read(file)),hash);}
  }
  assert.equal(Object.keys(media.sourcePins).length,255);assert.equal(Object.keys(extra.sourcePins).length,18);
  assert.equal(new Set([...Object.keys(media.sourcePins),...Object.keys(extra.sourcePins)]).size,273);
  assert.equal(extra.legacy.maximumFiles,256);assert.equal(extra.supplemental.maximumFiles,128);
});
test("four genuine new-decoder/browser outputs preserve full golden hash/fidelity/recovery; short timings and memory are not stress acceptance",async()=>{
  const seal=JSON.parse(await read(`evidence/${stamp}-ebml-reuse-independent-qualification.json`));
  const media=JSON.parse(await read(seal.media.path));assert.equal(sha(await read(seal.media.path)),seal.media.sha256);
  assert.equal(seal.analysis.genuineValidatedConversions,4);assert.equal(seal.allEightOutputHashesMatchGolden,true);
  assert.equal(seal.outputSha256,"554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27");
  assert.equal(seal.analysis.previous.normal.ordinalSsim,.983095);assert.equal(seal.analysis.previous.normal.frames,96);
  assert.equal(seal.analysis.previous.recovery.completedValidatedRecoveryConversions,2);
  assert.equal(seal.analysis.validatedInputFailureRecovery.caseStatus,"passed");
  assert.equal(seal.actualRuntimeVersions.length,4);assert.equal(media.browserMode,"headless");
  assert.equal(seal.primaryIncrementalPrivateMiB,null);assert.equal(seal.fullOriginalAcceptance,false);
  assert.equal(seal.publicAcceptance,false);assert.equal(seal.speedGainProven,false);
});
test("actual original whole pre/post/current SHA stable,14 exact births and23 PID-only observations distinct; duplicate raw deleted after recoverable archive",async()=>{
  const seal=JSON.parse(await read(`evidence/${stamp}-ebml-reuse-independent-qualification.json`));
  assert.equal(seal.originalWholePrePostCurrentSha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(seal.birthChecks.length,14);assert.ok(seal.birthChecks.every(row=>row.ownedBirthAbsent));
  assert.equal(seal.sampledPidChecks.length,23);assert.ok(seal.sampledPidChecks.every(row=>row.birthWasNotRecordedInConversionSample&&row.sampledProcessGone));
  const record=seal.removedRedundantRawJson;assert.equal(record.bytes,1012381);
  const raw=gunzipSync(await read(record.archive.path));assert.equal(sha(raw),record.sha256);
  await assert.rejects(access(path.join(root,record.path)),{code:"ENOENT"});
  assert.equal(seal.noProcessesKilled,true);assert.equal(seal.noDocker,true);
});
