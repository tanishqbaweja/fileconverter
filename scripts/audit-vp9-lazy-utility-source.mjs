// One small pinned PUBLIC consumer file, not media or a conversion.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
assert.equal(process.argv.length,2);const root=path.resolve(import.meta.dirname,"..");
const url="https://raw.githubusercontent.com/webmproject/libvpx/v1.16.0/vp9/encoder/vp9_picklpf.c";
const response=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.equal(response.status,200);
const reader=response.body.getReader(),buffer=Buffer.alloc(65536);let size=0;
try{for(;;){const item=await reader.read();if(item.done)break;assert.ok(size+item.value.length<=buffer.length);buffer.set(item.value,size);size+=item.value.length;}}
finally{await reader.cancel();}
const exactSource=buffer.subarray(0,size).toString(),sha256=createHash("sha256").update(exactSource).digest("hex");
assert.equal(sha256,"33258b68dc898d4babe9beb5c2368f6fd78e67478a233849f07819a64bcfeee6");
const utility=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-vp9-utility-buffer-source-audit.json")));
const report={scope:"Pinned loop-filter consumer preimage plus exact utility-function hashes, NOT accepted lazy allocation",
  url,sha256,bytes:size,exactSource,functionPins:Object.fromEntries(Object.entries(utility.functions).map(([name,row])=>[name,row.sha256])),
  actualMemoryReductionBytes:null,userMediaReadOrConverted:false,publicAcceptance:false};
await writeFile(path.join(root,"evidence/2026-11-06-vp9-lazy-utility-source.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({sha256,bytes:size,functionPins:report.functionPins}));
