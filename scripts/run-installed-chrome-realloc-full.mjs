// One file is both hidden supervisor entry and explicit full-caller target.
// All executing code stays in the existing bounded complete source closure.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeInstalledChromeFullCaller,makeInstalledChromeFullSupervisor } from "./lib/installed-chrome-full-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),args=process.argv.slice(2);
if((args.length===1&&args[0]==="--supervise")||args[0]==="--worker") {
  if(args[0]==="--supervise")process.argv.splice(2,1,"--full");
  const recipe=makeInstalledChromeFullSupervisor(await readFile(path.join(root,"scripts/launch-packet-largest-idle-supervisor.mjs"),"utf8"),root);
  await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
}else {
  assert.ok(args.length===0||(args.length===1&&args[0]==="--prepare-only"));
  const recipe=await makeInstalledChromeFullCaller(root),runtime=await createOwnedRuntimeScratch("installed-chrome-full-caller-");
  try {const file=path.join(runtime.directory,"caller.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);}
  finally {await runtime.close();}
}
