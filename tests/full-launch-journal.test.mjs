import assert from "node:assert/strict";
import {mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {createFullLaunchJournal,validateFullLaunchState} from "../scripts/lib/full-launch-journal.mjs";
import {createOwnedRuntimeScratch} from "../scripts/lib/owned-runtime-scratch.mjs";
const driverIdentity={pid:123,parentPid:122,createdAt:"2026-10-16T17:00:00.0000000Z"};
test("launch journal durably records runtime and exact child births before continuation",async()=>{
  const runtime=await createOwnedRuntimeScratch("launch-journal-test-");
  try {
    const root=runtime.directory,file=path.join(root,"outputs/reports/2026-10-16T17-00-00-000Z-private-mpeg2-updated-chrome-full-native-100ms-launches.json");
    await mkdir(path.dirname(file),{recursive:true});
    const journal=await createFullLaunchJournal({root,file,driverIdentity,wrapperDirectory:path.join(root,"work/wrapper"),candidateDirectory:path.join(root,"work/candidate")});
    assert.equal(JSON.parse(await readFile(file)).status,"starting");
    await journal.setRuntime(path.join(root,"work/profile-runtime"));
    const birth={pid:124,parentPid:123,createdAt:"2026-10-16T17:00:01.0000000Z"};
    await journal.record("headless-chrome-root",birth);
    const saved=JSON.parse(await readFile(file));assert.equal(saved.status,"launch-recorded");assert.deepEqual(saved.launches,[{role:"headless-chrome-root",identity:birth}]);
    await journal.finish();assert.equal(JSON.parse(await readFile(file)).status,"finished");
    await assert.rejects(createFullLaunchJournal({root,file,driverIdentity}),/Missing expected rejection|access/);
  }finally{await runtime.close();}
});
test("journal refuses wrong parent births, broad paths, missing identities and duplicate PIDs",()=>{
  const root=path.resolve(import.meta.dirname,".."),state={status:"starting",driverIdentity,wrapperDirectory:path.join(root,"work/wrapper"),candidateDirectory:path.join(root,"work/candidate"),runtimeDirectory:null,launches:[],conversionAcceptance:false};
  validateFullLaunchState(root,state);
  for(const changed of [{...state,wrapperDirectory:root},{...state,driverIdentity:null},{...state,conversionAcceptance:true},
    {...state,launches:[{role:"production-server",identity:{...driverIdentity,pid:124,parentPid:999}}]},
    {...state,launches:Array(2).fill({role:"production-server",identity:{...driverIdentity,pid:124,parentPid:123}})}])
    assert.throws(()=>validateFullLaunchState(root,changed));
});
