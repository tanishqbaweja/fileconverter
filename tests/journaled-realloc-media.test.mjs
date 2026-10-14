import assert from "node:assert/strict";
import { access,readFile,rm,writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { registerOwnedMediaFixture,retireOwnedMediaFixtureJournal } from "../scripts/lib/owned-media-fixture-journal.mjs";
import { journaledReallocMediaSourceFiles,makeJournaledReallocMediaBrowserRecipe,makeJournaledReallocMediaCaller } from "../scripts/lib/journaled-realloc-media-recipe.mjs";
import { FROZEN_BROWSER_SOURCES } from "../scripts/lib/single-idle-browser-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=name=>readFile(path.join(root,name),"utf8"),json=async name=>JSON.parse(await read(name));
test("owned journal refuses live/unavailable runner, replaced identity, wrong ancestry/path and unknown files; finally reclaims only owned scratch",async()=>{
  const wrapper=await createOwnedRuntimeScratch("packet-cache-media-"),fixture=await createOwnedRuntimeScratch("mpeg2-artwork-validation-");
  try {
    const journal=path.join(wrapper.directory,"owned-fixture.json"),record=await registerOwnedMediaFixture(root,fixture.directory,journal);
    const runnerIdentity={pid:record.registrationIdentity.parentPid,parentPid:1,createdAt:new Date().toISOString()};
    await writeFile(path.join(fixture.directory,"result.mp4"),"UNIT MOCK NOT MEDIA");
    await assert.rejects(retireOwnedMediaFixtureJournal(root,journal,{runnerIdentity,observe:async()=>({status:"owned-identity-not-proven-absent"})}));
    await access(fixture.directory);
    await assert.rejects(retireOwnedMediaFixtureJournal(root,journal,{runnerIdentity:{...runnerIdentity,pid:runnerIdentity.pid+1},observe:async()=>({status:"owned-identity-absent"})}));
    const altered={...record,ino:String(BigInt(record.ino)+1n)};await writeFile(journal,JSON.stringify(altered));
    await assert.rejects(retireOwnedMediaFixtureJournal(root,journal,{runnerIdentity,observe:async()=>({status:"owned-identity-absent"})}));
    await writeFile(journal,JSON.stringify(record));
    const unknown=path.join(fixture.directory,"not-owned.txt");await writeFile(unknown,"UNIT MOCK");
    await assert.rejects(retireOwnedMediaFixtureJournal(root,journal,{runnerIdentity,observe:async()=>({status:"owned-identity-absent"})}));
    await rm(unknown);
    const result=await retireOwnedMediaFixtureJournal(root,journal,{runnerIdentity,observe:async()=>({status:"owned-identity-absent",syntheticUnitOnly:true})});
    assert.equal(result.removedBytes,19);assert.equal(result.ownedDirectoryAbsent,true);assert.equal(result.noProcessesKilled,true);
    await assert.rejects(access(fixture.directory),{code:"ENOENT"});
    assert.equal((await retireOwnedMediaFixtureJournal(root,journal,{runnerIdentity,observe:async()=>({status:"owned-identity-absent",syntheticUnitOnly:true})})).status,"registered-fixture-already-removed");
    await assert.rejects(registerOwnedMediaFixture(root,path.join(root,"test.mkv"),journal));
  }finally{await Promise.all([wrapper.close(),fixture.close()]);}
});
test("journalled four-case suite keeps identical conversion/validator bytes and per-test60s; parent cleanup precedes restore and reports ownership",async()=>{
  const files=await journaledReallocMediaSourceFiles(root);assert.ok(files.length<=256);
  const runtime=await createOwnedRuntimeScratch("packet-cache-media-");
  try {
    const sources={};for(const name of Object.keys(FROZEN_BROWSER_SOURCES))sources[name]=await read(name);
    const recipe=await makeJournaledReallocMediaBrowserRecipe(sources,root,runtime.directory,"2026-10-14T00-00-00-000Z",
      await json("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"),await json("evidence/mpeg2-encoder-plane-build-38044000567.json"));
    assert.equal(recipe.infrastructureTimeout.individualTestTimeoutMs,60000);assert.equal(recipe.infrastructureTimeout.conversionAcceptanceThresholdsChanged,false);
    assert.ok(recipe.spec.indexOf("await registerOwnedMediaFixture(")<recipe.spec.indexOf('await native(["-v", "error", "-f", "lavfi"'));
    assert.ok(recipe.driver.indexOf("await retireOwnedMediaFixtureJournal(")<recipe.driver.indexOf("// Restoration spawns"));
    assert.ok(recipe.spec.includes("toBeGreaterThanOrEqual(0.98)"));assert.ok(recipe.spec.includes("nativeFullDecodePassed: true"));
    assert.equal(recipe.config.includes('"timeout":60000,"globalTimeout":270000'),true);
    const file=path.join(runtime.directory,"driver.mjs");await writeFile(file,recipe.driver);
    const checked=spawnSync(process.execPath,["--check",file],{encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(checked.status,0,checked.stderr);
    const caller=makeJournaledReallocMediaCaller(await read("scripts/validate-mpeg2-encoder-plane-goldens.mjs"),root);
    for(const gate of ["Keep2GiB host guard","diskBytes >= 2147483648","2958573265","postSourcePins, sourcePins","Preserve failure; no automatic retry","unexpectedFixtureDirs, []","originalFullSourceAcceptance: false"])
      assert.ok(caller.generated.includes(gate),gate);
  }finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
});
