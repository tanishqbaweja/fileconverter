import assert from "node:assert/strict";
import {access} from "node:fs/promises";
import path from "node:path";
import {supervisorJournal} from "./bounded-supervisor-journal.mjs";

function identity(row) {
  assert.ok(Number.isSafeInteger(row?.pid)&&row.pid>0&&Number.isSafeInteger(row.parentPid));
  assert.ok(Number.isFinite(Date.parse(row.createdAt)));
}
export function validateFullLaunchState(root,state) {
  identity(state.driverIdentity);assert.ok(state.launches.length<=8);
  for(const directory of [state.wrapperDirectory,state.candidateDirectory,state.runtimeDirectory].filter(Boolean)) {
    assert.equal(path.dirname(directory),path.join(root,"work"));
    assert.ok(directory.length<=512);
  }
  assert.ok(["starting","runtime-created","launch-recorded","finished"].includes(state.status));
  assert.equal(state.conversionAcceptance,false);
  const pids=new Set();for(const row of state.launches) {
    identity(row.identity);assert.equal(row.identity.parentPid,state.driverIdentity.pid);
    assert.ok(!pids.has(row.identity.pid));pids.add(row.identity.pid);
    assert.ok(["production-server","headless-chrome-root","native-memory-observer"].includes(row.role));
  }
}
export async function createFullLaunchJournal({root,file,driverIdentity,wrapperDirectory,candidateDirectory}) {
  assert.equal(path.dirname(file),path.join(root,"outputs/reports"));
  assert.match(path.basename(file),/^\d{4}-\d\d-\d\dT[\d-]+Z-private-mpeg2-updated-chrome-full-native-100ms-launches\.json$/);
  await assert.rejects(access(file),{code:"ENOENT"});
  const write=supervisorJournal(file,32768);
  const state={schema:1,status:"starting",updatedAt:null,driverIdentity,wrapperDirectory,candidateDirectory,
    runtimeDirectory:null,launches:[],conversionAcceptance:false};
  const save=async()=>{state.updatedAt=new Date().toISOString();validateFullLaunchState(root,state);await write(state);};
  await save();
  return {
    async setRuntime(directory){state.runtimeDirectory=directory;state.status="runtime-created";await save();},
    async record(role,birth){state.launches.push({role,identity:birth});state.status="launch-recorded";await save();},
    async finish(){state.status="finished";await save();},
  };
}
