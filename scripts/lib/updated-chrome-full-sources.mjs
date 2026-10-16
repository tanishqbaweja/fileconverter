import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {gzipSync,gunzipSync} from "node:zlib";
import {materializeLayeredFullSourceArchive} from "./threaded-validation-full-sources.mjs";
import {sha} from "./stable-ui-headless-baseline-recipe.mjs";
export const UPDATED_FULL_PARENT="evidence/2026-10-15T22-27-06-823Z-threaded-validation-full-live.json";
const recoveryPath="evidence/2026-10-16T16-36-10-030Z-threaded-validation-reboot-recovery.json";
export const UPDATED_FULL_SOURCE_LIMITS=Object.freeze({parentFiles:726,extensionFiles:128,extensionRestoredBytes:2097152,
  perFileBytes:2097152,externalFiles:16,runtimeArchiveBytes:8388608});
function safe(file) {
  assert.equal(typeof file,"string");assert.ok(file.length>0&&file.length<=512);
  assert.ok(!/[\\:\0]/.test(file)&&!file.startsWith("/")&&file.split("/").every(x=>x&&x!=="."&&x!==".."));
}
async function parentSources(root) {
  const bytes=await readFile(path.join(root,UPDATED_FULL_PARENT)),proof=JSON.parse(bytes);
  assert.equal(proof.sourceArchive.sha256,"de225152dfb7dd326856109d2d045cec1ddea6fae7d7f339a112874a9e710fe1");
  const archive=await materializeLayeredFullSourceArchive(root,proof.sourceArchive);
  assert.deepEqual(archive.sourcePins,proof.sourcePins);assert.equal(Object.keys(proof.sourcePins).length,726);
  const recoveryBytes=await readFile(path.join(root,recoveryPath)),recovery=JSON.parse(recoveryBytes);
  assert.equal(recovery.status,"reboot-interrupted-attempt-audited-restored-and-cleaned-not-acceptance");
  assert.equal(recovery.live.sha256,sha(bytes));assert.deepEqual(recovery.sourceArchive,proof.sourceArchive);
  assert.equal(recovery.all726ExecutedCurrentPreimagesVerified,true);
  return {archive,reference:{path:UPDATED_FULL_PARENT,sha256:sha(bytes),sourceArchive:proof.sourceArchive,
    interruptedNotAccepted:true,recovery:{path:recoveryPath,sha256:sha(recoveryBytes)}}};
}
export async function captureUpdatedFullSources(root,requested) {
  const previous=await parentSources(root),parentPins=previous.archive.sourcePins;
  const files=[...new Set([...Object.keys(parentPins),...requested,UPDATED_FULL_PARENT,recoveryPath,previous.reference.sourceArchive.path])];
  for(let index=0;index<files.length;index++) {
    const file=files[index];safe(file);if(!file.endsWith(".mjs"))continue;
    for(const match of (await readFile(path.join(root,file),"utf8")).matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
      const imported=path.relative(root,path.resolve(root,path.dirname(file),match[1])).replaceAll("\\","/");safe(imported);
      if(!files.includes(imported))files.push(imported);
    }
  }
  const extensionFiles=files.filter(file=>!Object.hasOwn(parentPins,file)).sort();assert.ok(extensionFiles.length<=128);
  const rows=[];for(const file of extensionFiles){const bytes=await readFile(path.join(root,file));assert.ok(bytes.length<=2097152);rows.push({file,bytes});}
  const external=new Set(rows.filter(row=>/^(?:evidence|outputs\/reports)\//.test(row.file)&&row.bytes.length>=50000)
    .sort((a,b)=>b.bytes.length-a.bytes.length||a.file.localeCompare(b.file)).slice(0,16).map(row=>row.file));
  const extensionPins={},extensionPreimages={};
  for(const {file,bytes}of rows) {
    extensionPins[file]=sha(bytes);extensionPreimages[file]=external.has(file)?{encoding:"qualified-external",path:file,bytes:bytes.length,sha256:sha(bytes)}:
      {encoding:"base64",data:bytes.toString("base64")};
  }
  assert.ok(Buffer.byteLength(JSON.stringify({extensionPins,extensionPreimages}))<=2097152);
  return {pins:{...parentPins,...extensionPins},parent:previous.reference,extensionPins,extensionPreimages,extensionFiles,
    limits:UPDATED_FULL_SOURCE_LIMITS,all726ParentPreimagesRetained:true};
}
export async function writeUpdatedFullArchive(root,stamp,snapshot,runtimeSources) {
  assert.match(stamp,/^\d{4}-\d\d-\d\dT[\d-]+Z$/);
  assert.deepEqual(await captureUpdatedFullSources(root,Object.keys(snapshot.pins)),snapshot);
  for(const key of ["driver","traceHelper","stager","supervisor"])assert.ok(Buffer.byteLength(runtimeSources[key])<=1048576);
  const value={...snapshot,...runtimeSources},raw=Buffer.from(JSON.stringify(value));assert.ok(raw.length<=8388608);
  const zip=gzipSync(raw,{level:9});assert.deepEqual(gunzipSync(zip),raw);
  const file=`outputs/reports/${stamp}-updated-chrome-full-sources.json.gz`;await writeFile(path.join(root,file),zip,{flag:"wx"});
  return {path:file,bytes:zip.length,sha256:sha(zip),restoredBytes:raw.length,restoredSha256:sha(raw),sourceCount:Object.keys(snapshot.pins).length};
}
export async function materializeUpdatedFullArchive(root,record) {
  safe(record.path);const zip=await readFile(path.join(root,record.path));assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
  const raw=gunzipSync(zip,{maxOutputLength:8388608});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);
  const value=JSON.parse(raw),snapshot=await captureUpdatedFullSources(root,Object.keys(value.pins));
  for(const key of ["driver","traceHelper","stager","supervisor"])assert.ok(typeof value[key]==="string"&&Buffer.byteLength(value[key])<=1048576);
  for(const key of Object.keys(snapshot))assert.deepEqual(value[key],snapshot[key]);
  assert.equal(record.sourceCount,Object.keys(value.pins).length);
  return value;
}
