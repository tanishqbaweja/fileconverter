// Actual493-source preparation, zero browser conversions. No acceptance claim.
import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive,loadPreviousLargestIdleFullSources,SUPPLEMENTAL_LIMITS } from "../scripts/lib/realloc-full-sources.mjs";
const root=path.resolve(import.meta.dirname,".."),proof=JSON.parse(await readFile(path.join(root,"evidence/2026-10-14T09-36-15-026Z-realloc-original-full-preparation.json")));
test("actual preparation recovers ALL493 pre/current/post sources, previous439+qualified249 retained, unchanged380+128/2MiB caps",async()=>{
  assert.equal(proof.status,"prepared-not-executed");assert.equal(proof.failure,null);assert.equal(proof.executions,0);
  assert.equal(Object.keys(proof.sourcePins).length,493);assert.deepEqual(proof.sourcePins,proof.postSourcePins);
  const archive=await materializeLayeredFullSourceArchive(root,proof.sourceArchive);assert.deepEqual(archive.sourcePins,proof.sourcePins);
  for(const [file,hash] of Object.entries(proof.sourcePins)){assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data,"base64")),hash,file);assert.equal(sha(await readFile(path.join(root,file))),hash,file);}
  const previous=await loadPreviousLargestIdleFullSources(root);for(const file of Object.keys(previous.proof.sourcePins))assert.ok(proof.sourcePins[file]);
  assert.equal(proof.sourceLayers.supplementalFiles,113);assert.deepEqual(proof.sourceLayers.limits,SUPPLEMENTAL_LIMITS);
  assert.equal(proof.sourceLayers.omittedLegacyFiles,0);assert.equal(proof.sourceArchive.restoredBytes,1209450);
  for(const token of ["limitMiB: 250","ssim >= 0.98","suspension.frees,1","realloc-full-failure-record.mjs","blankBaseline","native-checkpoint.json"])
    assert.ok(archive.generated.includes(token),token);
});
test("actual preparation whole protected hash/memory/disk/no-output/owned cleanup prove readiness, NOT full250MiB/speed acceptance",async()=>{
  assert.deepEqual(proof.protectedBefore,proof.protectedAfter);assert.equal(proof.protectedAfter.bytes,2958573265);
  assert.equal(proof.protectedAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.hostPreflight.safeToStart,true);assert.ok(proof.diskPreflightBytes>=32*1024**3);
  assert.deepEqual(proof.cleanupErrors,[]);assert.equal(proof.wrapperAbsent,true);assert.equal(proof.candidateAbsent,true);assert.equal(proof.productionRestored,true);
  for(const directory of [proof.wrapper,proof.candidateDirectory])await assert.rejects(access(directory),{code:"ENOENT"});
  assert.equal(proof.requestedRuns,3);assert.equal(proof.primaryLimitMiB,250);assert.equal(proof.maximumConversionMsPerRun,21600000);
  assert.equal(proof.nativeBitRate,4000000);assert.equal(proof.originalFullSourceAcceptance,false);assert.equal(proof.completeChromiumMemoryAcceptance,false);
  assert.equal(proof.conversionSpeedAcceptance,false);assert.equal(proof.publicAcceptance,false);assert.equal(proof.browserMode,"headless");
});
