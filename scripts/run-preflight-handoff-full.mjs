// Opt-in before any frozen helper imports: exact readonly preflight queries only.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeEbmlFullCaller,makeEbmlFullSupervisor } from "./lib/preflight-handoff-full-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),args=process.argv.slice(2);
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT="evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
assert.match(process.env.WITHIN_COMPOSITED_HANDOFF_MEDIA??"",/^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-composited-handoff-media\.json$/);
if((args.length===1&&args[0]==="--supervise")||args[0]==="--worker") {
  if(args[0]==="--supervise")process.argv.splice(2,1,"--full");
  const recipe=await makeEbmlFullSupervisor(await readFile(path.join(root,"scripts/launch-packet-largest-idle-supervisor.mjs"),"utf8"),root);
  await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
}else {
  assert.ok(args.length===0||(args.length===1&&args[0]==="--prepare-only"));
  const recipe=await makeEbmlFullCaller(root),runtime=await createOwnedRuntimeScratch("preflight-handoff-full-caller-");
  try{const file=path.join(runtime.directory,"caller.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);}
  finally{await runtime.close();}
}
