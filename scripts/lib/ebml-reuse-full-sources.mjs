// Preserve the complete executed508-source parent, including380+128 old caps.
// The new additive seal is independently capped128/2MiB; no old source omitted.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync,gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { loadHistoricalFullSourceBase,materializeLayeredFullSourceArchive as materializeParent } from "./installed-chrome-full-sources.mjs";
export { loadHistoricalFullSourceBase };
export const EBML_FULL_BASE_RECEIPT="evidence/2026-10-14T16-27-26-406Z-installed-chrome-realloc-original-full-terminal.json";
export const EBML_FULL_LIMITS=Object.freeze({parentFiles:508,parentLegacyFiles:380,parentSupplementalFiles:128,
  extensionFiles:128,extensionRestoredBytes:2097152,perFileBytes:2097152,externalFiles:16,runtimeArchiveBytes:8388608});
async function parentSources(root) {
  const bytes=await readFile(path.join(root,EBML_FULL_BASE_RECEIPT)),proof=JSON.parse(bytes);
  assert.equal(Object.keys(proof.sourcePins).length,508);assert.deepEqual(proof.sourcePins,proof.postSourcePins);
  assert.equal(proof.sourceArchive.sha256,"b1fba973d37223954aa7d4e67562fd66f517ad85bc2aeaf4a33a9dc2ff65395e");
  const archive=await materializeParent(root,proof.sourceArchive);assert.deepEqual(archive.sourcePins,proof.sourcePins);
  for(const [file,hash]of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await readFile(path.join(root,file))),hash,file);
    assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data,"base64")),hash,file);
  }
  return {proof,archive,reference:{path:EBML_FULL_BASE_RECEIPT,sha256:sha(bytes),sourceArchive:proof.sourceArchive,sourceCount:508}};
}
function safe(file) {
  assert.equal(typeof file,"string");assert.ok(file.length>0&&file.length<=512);
  assert.ok(!/[\\:\0]/.test(file)&&!file.startsWith("/")&&file.split("/").every(x=>x&&x!=="."&&x!==".."));
  assert.match(file,/\.(?:mjs|js|ts|tsx|css|c|h|cs|ps1|json(?:\.gz)?|yml|yaml|md|wat|wasm|sh|patch)$/);
}
export async function captureLayeredFullSourcePins(root,requestedFiles) {
  assert.ok(Array.isArray(requestedFiles));const previous=await parentSources(root);
  const files=[...new Set([...Object.keys(previous.proof.sourcePins),...requestedFiles])];
  for(let i=0;i<files.length;i++) {
    safe(files[i]);if(!files[i].endsWith(".mjs"))continue;
    const text=(await readFile(path.join(root,files[i]))).toString();
    for(const match of text.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
      const file=path.relative(root,path.resolve(root,path.dirname(files[i]),match[1])).replaceAll("\\","/");
      safe(file);if(!files.includes(file))files.push(file);
    }
  }
  const extensionFiles=files.filter(file=>!Object.hasOwn(previous.proof.sourcePins,file)).sort();assert.ok(extensionFiles.length<=128);
  const extensionPins={},extensionPreimages={};let externalCount=0;
  for(const file of extensionFiles) {
    const bytes=await readFile(path.join(root,file));assert.ok(bytes.length<=2097152);extensionPins[file]=sha(bytes);
    // Large, already retained immutable evidence remains a hash-bound external
    // preimage. It is verified/recovered on every materialization, never omitted.
    if((file.startsWith("evidence/")||file.startsWith("outputs/reports/"))&&bytes.length>=50000) {
      externalCount++;assert.ok(externalCount<=16);
      extensionPreimages[file]={encoding:"qualified-external",path:file,bytes:bytes.length,sha256:sha(bytes)};
    } else extensionPreimages[file]={encoding:"base64",data:bytes.toString("base64")};
  }
  const envelopeBytes=Buffer.byteLength(JSON.stringify({extensionPins,extensionPreimages}));assert.ok(envelopeBytes<=2097152);
  const pins={...previous.proof.sourcePins,...extensionPins};
  return {files:Object.keys(pins),pins,parent:previous.reference,extensionFiles,extensionPins,extensionPreimages,
    base:previous.archive.base,limits:EBML_FULL_LIMITS,historicalFilesRetained:256,legacyFilesRetained:508,
    additiveFiles:extensionFiles,supplementalRestoredBytes:envelopeBytes,omittedLegacyFiles:0,externalCount};
}
export async function writeLayeredFullSourceArchive(root,stamp,snapshot,runtimeSources) {
  assert.match(stamp,/^\d{4}-\d\d-\d\dT[\d-]+Z$/);
  for(const name of ["generated","traceHelper","generatedCaller"])assert.ok(typeof runtimeSources[name]==="string"&&Buffer.byteLength(runtimeSources[name])<=1048576);
  assert.deepEqual(snapshot,await captureLayeredFullSourcePins(root,snapshot.files));
  const value={...runtimeSources,sourcePins:snapshot.pins,parent:snapshot.parent,extensionPins:snapshot.extensionPins,
    extensionPreimages:snapshot.extensionPreimages,limits:EBML_FULL_LIMITS,allParent508PreimagesReferencedNotDropped:true};
  const raw=Buffer.from(JSON.stringify(value));assert.ok(raw.length<=8388608);const zip=gzipSync(raw,{level:9});assert.deepEqual(gunzipSync(zip),raw);
  const file=`outputs/reports/${stamp}-ebml-reuse-full-executed-sources.json.gz`;
  await writeFile(path.join(root,file),zip,{flag:"wx"});assert.equal(sha(await readFile(path.join(root,file))),sha(zip));
  return {path:file,bytes:zip.length,sha256:sha(zip),restoredBytes:raw.length,restoredSha256:sha(raw),
    driverSha256:sha(value.generated),traceHelperSha256:sha(value.traceHelper),generatedCallerSha256:sha(value.generatedCaller),
    preimageCount:snapshot.files.length,parentPreimages:508,extensionPreimages:snapshot.extensionFiles.length};
}
export async function materializeLayeredFullSourceArchive(root,record) {
  const zip=await readFile(path.join(root,record.path));assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
  const raw=gunzipSync(zip,{maxOutputLength:8388608});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);
  const value=JSON.parse(raw),previous=await parentSources(root);assert.deepEqual(value.parent,previous.reference);
  assert.deepEqual(value.limits,EBML_FULL_LIMITS);assert.equal(value.allParent508PreimagesReferencedNotDropped,true);
  assert.deepEqual(Object.keys(value.extensionPins).sort(),Object.keys(value.extensionPreimages).sort());
  assert.ok(Object.keys(value.extensionPins).length<=128);
  assert.ok(Buffer.byteLength(JSON.stringify({extensionPins:value.extensionPins,extensionPreimages:value.extensionPreimages}))<=2097152);
  const recovered={...previous.archive.sourcePreimages};let externalCount=0;
  for(const [file,hash]of Object.entries(value.extensionPins)) {
    safe(file);assert.equal(Object.hasOwn(previous.proof.sourcePins,file),false);const row=value.extensionPreimages[file];let bytes;
    if(row.encoding==="qualified-external") {
      externalCount++;assert.ok(externalCount<=16);assert.equal(row.path,file);assert.equal(row.sha256,hash);
      bytes=await readFile(path.join(root,file));assert.equal(bytes.length,row.bytes);
    } else {assert.equal(row.encoding,"base64");bytes=Buffer.from(row.data,"base64");assert.equal(bytes.toString("base64"),row.data);}
    assert.equal(sha(bytes),hash);recovered[file]={encoding:"base64",data:bytes.toString("base64")};
  }
  assert.deepEqual(value.sourcePins,{...previous.proof.sourcePins,...value.extensionPins});
  assert.equal(Object.keys(recovered).length,record.preimageCount);return {...value,sourcePreimages:recovered};
}
