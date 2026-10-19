// One headless changed-candidate qualification; no automatic restart.
import "./lib/reliable-readonly-preflight.mjs";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { deriveLtoBrowserCaller } from "./lib/lto-browser-control.mjs";
const root=path.resolve(import.meta.dirname,".."),runtime=await createOwnedRuntimeScratch("lto-browser-caller-");
try{
  process.env.WITHIN_RECORDED_TIMELINE_CALLER_DIRECTORY=runtime.directory;
  const source=await readFile(path.join(root,"scripts/run-updated-chrome-full.mjs"),"utf8");
  const recipe=await deriveLtoBrowserCaller(source,root),file=path.join(runtime.directory,"caller.mjs");
  await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);
}finally{await runtime.close();}
