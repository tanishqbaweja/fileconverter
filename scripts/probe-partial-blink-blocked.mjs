import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makePartialBlinkControl } from "./lib/partial-blink-control-recipe.mjs";
const root=path.resolve(import.meta.dirname,"..");
const host=await inspectStressHostMemory();console.log(JSON.stringify({scope:"partial-record-synthetic-control-preflight",host}));
await assert.rejects(access(path.join(root,"evidence/partial-blink-blocked-control-2026-10-08.json")),{code:"ENOENT"});
await assert.rejects(access(path.join(root,"outputs/reports/2026-10-08-partial-blink-blocked-control-partial-blink-trace.json.gz")),{code:"ENOENT"});
if(!host.safeToStart){console.log("Held before any scratch/browser/synthetic storage; unchanged2GiB physicalANDvirtual");process.exitCode=1;}
else{
  const runtime=await createOwnedRuntimeScratch("partial-blink-blocked-driver-");
  try{
    const source=makePartialBlinkControl(await readFile(path.join(root,"scripts/probe-native-budget-failure.mjs"),"utf8"),root,s=>import.meta.resolve(s));
    const driver=path.join(runtime.directory,"control.mjs");await writeFile(driver,source,{flag:"wx"});
    await import(pathToFileURL(driver).href);
  }finally{await runtime.close();}
  await assert.rejects(access(runtime.directory),{code:"ENOENT"});
}
