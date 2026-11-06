// Compact authenticated compiler controls only, not source/media copies.
import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
assert.equal(process.argv.length,3); const runId=process.argv[2];assert.match(runId,/^\d{8,14}$/);
const root=path.resolve(import.meta.dirname,".."), native=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-vp9-original-width-native-"+runId+".json")));
assert.equal(native.nativeContract.engine,"private-vp9-allocation-diagnostic");
const directory=path.join(root,"work/vp9-duration-input-"+runId);assert.equal(await realpath(directory),directory);
const load=async name=>{
  const file=path.join(directory,name);assert.equal(await realpath(file),file);const bytes=await readFile(file);
  assert.ok(bytes.length<=65536);const pin=native.nativeContract.artifacts[name];
  assert.equal(bytes.length,pin.bytes);assert.equal(createHash("sha256").update(bytes).digest("hex"),pin.sha256);return JSON.parse(bytes);
};
const link=await load("vp9-allocation-link-proof.json"), source=await load("vp9-allocation-diagnostic-proof.json");
const report={ scope:"Compact authenticated actual compiler outcomes and mocked allocator controls, NOT browser heap measurements",
  runId:Number(runId),head:native.head,artifactSha256:native.artifact.sha256,linkControls:link,
  frameAllocatorCControls:source.cUnit,sdkHeaderPins:source.installedSdkHeaderPins,
  actualBrowserHeapMeasurements:null,publicAcceptance:false };
const output=path.join(root,"evidence/2026-11-06-vp9-allocation-compiler-controls-"+runId+".json");
await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,defaultAllocatorCode:link.cases[0].code,productionAllocatorCode:link.cases[1].code,mediaRead:false}));
