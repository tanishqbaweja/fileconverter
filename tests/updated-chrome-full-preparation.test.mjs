import assert from "node:assert/strict";
import {access,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {gzipSync,gunzipSync} from "node:zlib";
import {createOwnedRuntimeScratch} from "../scripts/lib/owned-runtime-scratch.mjs";
import {materializeUpdatedFullArchive} from "../scripts/lib/updated-chrome-full-sources.mjs";
import {materializeLayeredFullSourceArchive} from "../scripts/lib/threaded-validation-full-sources.mjs";
import {sha} from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const proof=JSON.parse(await read("evidence/2026-10-16T16-59-54-263Z-updated-chrome-full-preparation.json"));
test("actual750-source full preparation preserves every726 parent preimage and all new generated code",async()=>{
  assert.equal(proof.status,"prepared-not-executed");assert.equal(proof.executions,0);assert.equal(proof.failure,null);assert.deepEqual(proof.cleanupErrors,[]);
  assert.equal(Object.keys(proof.sourcePins).length,750);assert.deepEqual(proof.sourcePins,proof.postSourcePins);
  const archive=await materializeUpdatedFullArchive(root,proof.sourceArchive);
  assert.equal(Object.keys(archive.extensionPins).length,24);assert.equal(archive.limits.extensionFiles,128);assert.equal(archive.limits.extensionRestoredBytes,2097152);
  assert.equal(archive.all726ParentPreimagesRetained,true);
  const parent=await materializeLayeredFullSourceArchive(root,proof.parent.sourceArchive);
  assert.equal(Object.keys(parent.sourcePreimages).length,726);
  for(const [file,hash]of Object.entries(parent.sourcePins))assert.equal(archive.pins[file],hash);
  let reversed=archive.driver;for(const [before,after]of archive.edits.toReversed())reversed=reversed.replace(after,before);
  assert.equal(reversed,parent.generated);
  assert.deepEqual(proof.browserPinBefore,proof.browserPinAfter);assert.equal(proof.browserPinAfter.version,"155.0.8059.80");
  assert.deepEqual(proof.nativeQualification,proof.nativeQualificationAfter);assert.deepEqual(proof.protectedBefore,proof.protectedAfter);
  assert.equal(proof.protectedAfter.bytes,2958573265);assert.equal(proof.protectedAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.wrapperRemoved,true);assert.equal(proof.candidateRemoved,true);assert.equal(proof.productionRestored,true);
  await assert.rejects(access(proof.wrapper),{code:"ENOENT"});await assert.rejects(access(proof.candidateDirectory),{code:"ENOENT"});
  assert.equal(proof.fullOriginalAcceptance,false);assert.equal(proof.completeChromiumMemoryAcceptance,false);assert.equal(proof.publicAcceptance,false);
});
test("archive replay rejects weakened source caps, missing parent sources and oversized runtime code",async()=>{
  const runtime=await createOwnedRuntimeScratch("updated-full-archive-test-");
  try {
    const original=JSON.parse(gunzipSync(await read(proof.sourceArchive.path),{maxOutputLength:8388608}));
    const mutations=[value=>{value.limits.extensionFiles=129;},value=>{delete value.pins[Object.keys(value.pins)[0]];},value=>{value.driver="x".repeat(1048577);}];
    for(let index=0;index<mutations.length;index++) {
      const value=structuredClone(original);mutations[index](value);const raw=Buffer.from(JSON.stringify(value)),zip=gzipSync(raw);
      const file=path.join(runtime.directory,`negative-${index}.json.gz`);await writeFile(file,zip,{flag:"wx"});
      await assert.rejects(materializeUpdatedFullArchive(root,{path:path.relative(root,file).replaceAll("\\","/"),bytes:zip.length,sha256:sha(zip),restoredBytes:raw.length,restoredSha256:sha(raw),sourceCount:Object.keys(value.pins).length}));
    }
  }finally{await runtime.close();}
});
