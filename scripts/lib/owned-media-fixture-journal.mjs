// Durable native fixture identity before work; reclaim ONLY after owned runner
// birth is absent. No broad sweep, process killing, or media payload reads.
import assert from "node:assert/strict";
import { lstat,readFile,readdir,realpath,rm,writeFile } from "node:fs/promises";
import path from "node:path";
import { queryProcessIdentity,observeOwnedProcessExit } from "./owned-process-exit-observation.mjs";
function paths(root,directory,journal) {
  assert.equal(path.dirname(directory),path.join(root,"work"));assert.match(path.basename(directory),/^mpeg2-artwork-validation-[A-Za-z0-9]+$/);
  assert.equal(path.dirname(path.dirname(journal)),path.join(root,"work"));assert.match(path.basename(path.dirname(journal)),/^packet-cache-media-[A-Za-z0-9]+$/);
  assert.equal(path.basename(journal),"owned-fixture.json");
}
export async function registerOwnedMediaFixture(root,directory,journal) {
  paths(root,directory,journal);assert.equal(await realpath(directory),directory);assert.equal(await realpath(path.dirname(journal)),path.dirname(journal));
  const info=await lstat(directory,{bigint:true});assert.ok(info.isDirectory()&&!info.isSymbolicLink());
  const registrationIdentity=await queryProcessIdentity(process.pid);assert.equal(registrationIdentity?.pid,process.pid);
  const record={version:1,recordedAt:new Date().toISOString(),directory,dev:String(info.dev),ino:String(info.ino),birthtimeMs:String(info.birthtimeMs),registrationIdentity};
  const bytes=JSON.stringify(record);assert.ok(Buffer.byteLength(bytes)<=4096);await writeFile(journal,bytes,{flag:"wx"});return record;
}
export async function retireOwnedMediaFixtureJournal(root,journal,{runnerIdentity,observe=observeOwnedProcessExit}={}) {
  let bytes;try{bytes=await readFile(journal);}catch(error){if(error.code!=="ENOENT")throw error;return {status:"no-registered-fixture",registered:false,noProcessesKilled:true};}
  assert.ok(bytes.length<=4096);const record=JSON.parse(bytes);assert.equal(record.version,1);paths(root,record.directory,journal);
  assert.match(record.dev,/^[0-9]+$/);assert.match(record.ino,/^[0-9]+$/);assert.match(record.birthtimeMs,/^[0-9]+$/);
  assert.equal(record.registrationIdentity.parentPid,runnerIdentity?.pid,"Only recorded test worker child of this owned runner");
  const absence=await observe(runnerIdentity);assert.equal(absence.status,"owned-identity-absent","Never delete while recorded runner birth is live or unavailable");
  let current;try{current=await lstat(record.directory,{bigint:true});}catch(error){if(error.code!=="ENOENT")throw error;
    return {status:"registered-fixture-already-removed",registered:true,record,runnerAbsence:absence,removedBytes:0,ownedDirectoryAbsent:true,noProcessesKilled:true};}
  assert.ok(current.isDirectory()&&!current.isSymbolicLink());assert.equal(String(current.dev),record.dev);assert.equal(String(current.ino),record.ino);
  assert.equal(String(current.birthtimeMs),record.birthtimeMs);assert.equal(await realpath(record.directory),record.directory);
  const names=await readdir(record.directory);assert.ok(names.length<=6);let removedBytes=0;
  for(const name of names){assert.ok(["artwork.png","chapters.ffmetadata","source.mkv","hevc.mkv","cancel.mkv","result.mp4"].includes(name));
    const info=await lstat(path.join(record.directory,name));assert.ok(info.isFile()&&!info.isSymbolicLink());assert.ok(info.size<=33554432);removedBytes+=info.size;}
  assert.ok(removedBytes<=67108864);await rm(record.directory,{recursive:true,force:false,maxRetries:5,retryDelay:100});
  await assert.rejects(lstat(record.directory),{code:"ENOENT"});
  return {status:"owned-registered-disposable-fixture-removed-after-runner-absence",registered:true,record,runnerAbsence:absence,removedBytes,ownedDirectoryAbsent:true,noProcessesKilled:true};
}
