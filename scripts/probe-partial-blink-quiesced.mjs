import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeQuiescedBlinkControl } from "./lib/partial-blink-quiesced-control-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),sha=b=>createHash("sha256").update(b).digest("hex");
const prior=JSON.parse(await readFile(path.join(root,"evidence/partial-blink-blocked-control-verification-2026-10-08.json")));
assert.equal(prior.globalDumpSucceeded,false);assert.equal(prior.target.blinkTypesAvailable,false);
assert.equal(prior.cleanup.bothRuntimeDirectoriesAbsent,true);assert.equal(prior.rawTraceReconstructionAndReparseVerified,true);
const blocked=JSON.parse(await readFile(path.join(root,prior.input.path)));
for(const[file,hash]of Object.entries(blocked.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash,file);
const host=await inspectStressHostMemory();console.log(JSON.stringify({scope:"quiesced-record-synthetic-control-preflight",host}));
await assert.rejects(access(path.join(root,"evidence/partial-blink-quiesced-control-2026-10-08.json")),{code:"ENOENT"});
await assert.rejects(access(path.join(root,"outputs/reports/2026-10-08-partial-blink-quiesced-control-partial-blink-trace.json.gz")),{code:"ENOENT"});
if(!host.safeToStart){console.log("Held before any scratch/browser/synthetic storage; unchanged2GiB physicalANDvirtual");process.exitCode=1;}
else{
  const runtime=await createOwnedRuntimeScratch("partial-blink-quiesced-driver-");
  try{
    const source=makeQuiescedBlinkControl(await readFile(path.join(root,"scripts/probe-native-budget-failure.mjs"),"utf8"),root,s=>import.meta.resolve(s));
    const driver=path.join(runtime.directory,"control.mjs");await writeFile(driver,source,{flag:"wx"});await import(pathToFileURL(driver).href);
  }finally{await runtime.close();}
  await assert.rejects(access(runtime.directory),{code:"ENOENT"});
}
