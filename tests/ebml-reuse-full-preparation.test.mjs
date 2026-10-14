import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/ebml-reuse-full-sources.mjs";
const root=path.resolve(import.meta.dirname,"..");
test("actual preparation recovers all546 executed/current/post preimages, preserves old508+bounded38 and original driver gates",async()=>{
  const file="evidence/2026-10-14T18-50-10-851Z-ebml-reuse-original-full-preparation.json";
  const proof=JSON.parse(await readFile(path.join(root,file)));
  assert.equal(proof.status,"prepared-not-executed");assert.equal(proof.executions,0);
  assert.equal(Object.keys(proof.sourcePins).length,546);assert.deepEqual(proof.sourcePins,proof.postSourcePins);
  const archive=await materializeLayeredFullSourceArchive(root,proof.sourceArchive);
  assert.deepEqual(archive.sourcePins,proof.sourcePins);assert.equal(Object.keys(archive.sourcePreimages).length,546);
  for(const [file,hash]of Object.entries(proof.sourcePins)) {
    assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data,"base64")),hash);
    assert.equal(sha(await readFile(path.join(root,file))),hash);
  }
  assert.equal(proof.sourceLayers.parentFilesRetained,508);assert.equal(proof.sourceLayers.extensionFiles,38);
  assert.equal(proof.sourceLayers.limits.extensionFiles,128);assert.equal(proof.sourceLayers.limits.extensionRestoredBytes,2097152);
  assert.equal(proof.sourceLayers.omittedLegacyFiles,0);
  assert.ok(archive.generated.includes("-private-mpeg2-ebml-reuse-full-native-100ms"));
  assert.ok(archive.generated.includes("scripts/stage-ebml-reuse-full.mjs"));
});
test("actual preparation protects whole original/host/disk and cleans candidate without claiming browser/full acceptance",async()=>{
  const proof=JSON.parse(await readFile(path.join(root,"evidence/2026-10-14T18-50-10-851Z-ebml-reuse-original-full-preparation.json")));
  assert.equal(proof.protectedBefore.bytes,2958573265);assert.equal(proof.protectedBefore.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(proof.protectedBefore,proof.protectedAfter);assert.equal(proof.hostPreflight.safeToStart,true);
  assert.ok(proof.diskPreflightBytes>=32*1024**3);assert.equal(proof.composition.manifest.artifacts["within-mpeg2-split.wasm"],"7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25");
  assert.equal(proof.composition.manifest.artifacts["split-encoder.wasm"],"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(proof.requestedRuns,3);assert.equal(proof.maximumConversionMsPerRun,21600000);assert.equal(proof.primaryLimitMiB,250);
  assert.equal(proof.wrapperAbsent,true);assert.equal(proof.candidateAbsent,true);assert.equal(proof.productionRestored,true);
  for(const directory of [proof.wrapper,proof.candidateDirectory])await assert.rejects(access(directory),{code:"ENOENT"});
  assert.equal(proof.originalFullSourceAcceptance,false);assert.equal(proof.completeChromiumMemoryAcceptance,false);assert.equal(proof.publicAcceptance,false);
});
