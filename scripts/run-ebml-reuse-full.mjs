// Single hidden supervisor/full-caller entry. No duplicate/retry/pin downgrade.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeEbmlFullCaller,makeEbmlFullSupervisor } from "./lib/ebml-reuse-full-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),args=process.argv.slice(2);
process.env.WITHIN_EBML_REUSE_CONTROL_RECEIPT="evidence/2026-10-14T18-11-48-138Z-ebml-reuse-browser-control-executed-sources.json";
if((args.length===1&&args[0]==="--supervise")||args[0]==="--worker") {
  if(args[0]==="--supervise")process.argv.splice(2,1,"--full");
  const recipe=makeEbmlFullSupervisor(await readFile(path.join(root,"scripts/launch-packet-largest-idle-supervisor.mjs"),"utf8"),root);
  await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
}else {
  assert.ok(args.length===0||(args.length===1&&args[0]==="--prepare-only"));
  const recipe=await makeEbmlFullCaller(root),runtime=await createOwnedRuntimeScratch("ebml-reuse-full-caller-");
  try {const file=path.join(runtime.directory,"caller.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);}
  finally{await runtime.close();}
}
