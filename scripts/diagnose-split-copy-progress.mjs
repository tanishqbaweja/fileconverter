// ONE real full-source matched transport diagnostic. Cancellation never passes acceptance.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeSplitCopyController } from "./lib/split-copy-controller-recipe.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),source=await readFile(path.join(root,"scripts/diagnose-split-render-progress.mjs"),"utf8");
const prior=JSON.parse(await readFile(path.join(root,"evidence/2026-10-08T23-33-58-528Z-split-render-progress.json")));
assert.equal(sha(source),prior.sourcePins["scripts/diagnose-split-render-progress.mjs"]);
const recipe=makeSplitCopyController(source,root),runtime=await createOwnedRuntimeScratch("split-copy-progress-controller-");
try{
  const controller=path.join(runtime.directory,"controller.mjs");await writeFile(controller,recipe.generated,{flag:"wx"});
  await import(pathToFileURL(controller).href);
}finally{await runtime.close();}
