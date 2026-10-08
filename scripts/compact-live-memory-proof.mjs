// Exact two TERMINAL proof targets only. Keep their executed bytes recoverable, never alter their claims.
import assert from "node:assert/strict";
import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),files=[
  "evidence/2026-10-08T22-41-09-984Z-live-memory.json",
  "evidence/2026-10-08T22-41-09-984Z-live-memory-analysis.json",
];
const records=[];
for(const file of files){
  const full=path.resolve(root,file);assert.equal(path.dirname(full),path.join(root,"evidence"));
  const identity=await lstat(full,{bigint:true});assert.ok(identity.isFile()&&!identity.isSymbolicLink());assert.equal(await realpath(full),full);
  const bytes=await readFile(full);assert.ok(bytes.length<2*1048576);const value=JSON.parse(bytes);
  assert.equal(value.publicAcceptance,false);assert.equal(value.originalFullSourceAcceptance,false);
  if(value.execution){assert.equal(value.execution.actualExitCode,1);assert.equal(value.runtimeRemoved,true);assert.equal(value.productionRestored,true);assert.equal(value.failure,null);}
  else{assert.equal(value.status,"verified-live-memory-category-diagnostic-not-acceptance");assert.equal(value.cleanupIdentities.originalIdentitiesAbsent,true);assert.equal(value.protectedFullPostHashVerified,true);}
  const gzip=gzipSync(bytes,{level:9});assert.deepEqual(gunzipSync(gzip),bytes);
  const archivePath=file+".gz";await writeFile(path.join(root,archivePath),gzip,{flag:"wx"});
  assert.equal(sha(gunzipSync(await readFile(path.join(root,archivePath)))),sha(bytes));
  const current=await lstat(full,{bigint:true});assert.equal(current.dev,identity.dev);assert.equal(current.ino,identity.ino);assert.equal(sha(await readFile(full)),sha(bytes));
  await unlink(full);
  records.push({original:{path:file,bytes:bytes.length,sha256:sha(bytes)},archive:{path:archivePath,bytes:gzip.length,sha256:sha(gzip)},
    originalRemovedAfterIdentityAndByteExactLosslessValidation:true,bytesSaved:bytes.length-gzip.length});
}
const proof={recordedAt:new Date().toISOString(),status:"two-terminal-proof-jsons-losslessly-compacted",
  compactor:{path:"scripts/compact-live-memory-proof.mjs",sha256:sha(await readFile(new URL(import.meta.url)))},
  records,totalBytesSaved:records.reduce((sum,row)=>sum+row.bytesSaved,0),semanticsChanged:false,sourceMediaTouched:false,newBrowserRuns:0};
await writeFile(path.join(root,"evidence/2026-10-08T22-41-09-984Z-live-memory-compaction.json"),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(proof));
