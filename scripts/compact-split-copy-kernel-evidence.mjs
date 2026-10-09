// Remove ONLY redundant, identity/hash/losslessly verified JSON evidence copies.
import assert from "node:assert/strict";
import { access,lstat,readFile,realpath,rm,writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync,gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),receiptPath="evidence/2026-10-09T04-15-41-611Z-split-copy-kernel-goldens.json";
async function identity(file){
  const full=path.resolve(root,file);assert.ok(full.startsWith(root+path.sep));assert.equal(await realpath(full),full);
  const state=await lstat(full);assert.ok(state.isFile()&&!state.isSymbolicLink()&&state.size<=2097152);
  return{full,size:state.size,dev:state.dev,ino:state.ino,mtimeMs:state.mtimeMs};
}
const receiptIdentity=await identity(receiptPath),bytes=await readFile(receiptIdentity.full),receipt=JSON.parse(bytes);
assert.equal(receipt.status,"headless-changed-copy-kernel-five-goldens-passed");assert.equal(receipt.failure,null);assert.equal(receipt.cleanup.normalProductionRestored,true);
await assert.rejects(access(receipt.cleanup.ownedRuntime),{code:"ENOENT"});
for(const[file,hash]of Object.entries(receipt.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash);
assert.match(receipt.report.rawPath,/^output\/playwright\/2026-10-09T04-15-53\.498Z-mpeg2-split-pipeline-37739125738-direct-artwork\.json$/);
const rawIdentity=await identity(receipt.report.rawPath),raw=await readFile(rawIdentity.full),archive=await readFile(path.join(root,receipt.report.archivePath));
assert.equal(raw.length,receipt.report.rawBytes);assert.equal(sha(raw),receipt.report.rawSha256);
assert.equal(archive.length,receipt.report.archiveBytes);assert.equal(sha(archive),receipt.report.archiveSha256);assert.deepEqual(gunzipSync(archive,{maxOutputLength:2097152}),raw);
const compressed=gzipSync(bytes,{level:9}),compressedPath=receiptPath+".gz";assert.deepEqual(gunzipSync(compressed),bytes);
await writeFile(path.join(root,compressedPath),compressed,{flag:"wx"});const saved=await readFile(path.join(root,compressedPath));
assert.deepEqual(saved,compressed);assert.deepEqual(gunzipSync(saved,{maxOutputLength:2097152}),bytes);
for(const[state,content,file]of[[receiptIdentity,bytes,receiptPath],[rawIdentity,raw,receipt.report.rawPath]]){
  assert.deepEqual(await identity(file),state);assert.deepEqual(await readFile(state.full),content);
}
// Both exact targets resolved under the repo, with unchanged file identities.
await rm(rawIdentity.full);await rm(receiptIdentity.full);
const proof={recordedAt:new Date().toISOString(),scope:"two-redundant-JSON-copies-only-not-conversion-acceptance",
  receipt:{rawPath:receiptPath,rawBytes:bytes.length,rawSha256:sha(bytes),compressedPath,compressedBytes:compressed.length,compressedSha256:sha(compressed)},
  report:receipt.report,identitySizeHashAndLosslessVerified:true,removed:[receipt.report.rawPath,receiptPath],
  savedBytes:bytes.length+raw.length-compressed.length,mediaDeletedByThisCommand:false,otherFilesTouched:false};
const output=receiptPath.replace(/\.json$/,"-compaction.json");await writeFile(path.join(root,output),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify(proof));
