import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { loadInstalledChromeFullQualification } from "../scripts/lib/installed-chrome-full-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/installed-chrome-full-sources.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
test("actual125 fatal +255 genuine media preimages/pin/runtime/quality/native composition join current, no full-memory or speed claim",async()=>{
  const q=await loadInstalledChromeFullQualification(root);assert.equal(q.pin.version,"155.0.8059.40");assert.equal(q.media.analysis.genuineValidatedConversions,4);
  assert.equal(q.seal.sourceCounts.control,125);assert.equal(q.seal.sourceCounts.media,255);assert.equal(q.seal.allEightOutputHashesMatchGolden,true);
  assert.equal(q.media.analysis.previous.normal.ordinalSsim,.983095);assert.equal(q.media.analysis.previous.normal.qualityThreshold,.98);
  assert.equal(q.seal.primaryIncrementalPrivateMiB,null);assert.equal(q.seal.speedGainProven,false);assert.equal(q.seal.publicAcceptance,false);assert.equal(q.seal.headedCoverageVerified,false);
  assert.equal(sha(await read(q.seal.ownSource.path)),q.seal.ownSource.sha256);assert.equal(sha(Buffer.from(q.seal.ownSource.preimage,"base64")),q.seal.ownSource.sha256);
});
test("actual new preparation retains508 exact current/post/preimages, same native/input and source caps; no converter launched",async()=>{
  const p=JSON.parse(await read("evidence/2026-10-14T16-13-48-481Z-installed-chrome-realloc-original-full-preparation.json"));
  assert.equal(p.executions,0);assert.equal(p.failure,null);assert.equal(p.status,"prepared-not-executed");assert.equal(Object.keys(p.sourcePins).length,508);
  const archive=await materializeLayeredFullSourceArchive(root,p.sourceArchive);assert.deepEqual(archive.sourcePins,p.sourcePins);assert.deepEqual(p.sourcePins,p.postSourcePins);
  for(const [file,hash] of Object.entries(p.sourcePins)){assert.equal(sha(await read(file)),hash,file);assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data,"base64")),hash,file);}
  assert.equal(p.sourceLayers.supplementalFiles,128);assert.equal(p.sourceLayers.omittedLegacyFiles,0);assert.equal(p.sourceLayers.limits.supplementalRestoredBytes,2097152);
  assert.deepEqual(p.browserPinBefore,p.browserPinAfter);assert.equal(p.qualifiedBrowser.runtimeVersion,"155.0.8059.40");
  assert.deepEqual(p.protectedBefore,p.protectedAfter);assert.equal(p.protectedAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(p.requestedRuns,3);assert.equal(p.primaryLimitMiB,250);assert.equal(p.nativeBitRate,4000000);assert.equal(p.originalFullSourceAcceptance,false);
  assert.deepEqual(p.cleanupErrors,[]);for(const directory of [p.wrapper,p.candidateDirectory])await assert.rejects(access(directory),{code:"ENOENT"});
});
test("actual normal fixture cleanup/process exit/original whole hash and lossless report retention do not relabel PID checks birth inventory",async()=>{
  const q=await loadInstalledChromeFullQualification(root);assert.equal(q.seal.birthChecks.length,15);assert.equal(q.seal.sampledPidChecks.length,22);
  for(const row of q.seal.birthChecks)assert.equal(row.ownedBirthAbsent,true);for(const row of q.seal.sampledPidChecks){assert.equal(row.sampledProcessGone,true);assert.equal(row.birthWasNotRecordedInConversionSample,true);}
  const journal=JSON.parse(await read(q.seal.journal.path));await assert.rejects(access(journal.record.directory),{code:"ENOENT"});
  await assert.rejects(access(q.media.cleanup.ownedWrapper),{code:"ENOENT"});await assert.rejects(access(path.join(root,q.media.report.path)),{code:"ENOENT"});
  assert.equal(q.seal.removedRedundantRawJson.bytes,974072);assert.equal(q.seal.originalWholePrePostCurrentSha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
});
