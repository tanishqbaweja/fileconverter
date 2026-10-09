// Same verified copy stager, with bounded one-frame scalar observation in session.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),source=await readFile(path.join(root,"scripts/stage-split-copy-kernel.mjs"),"utf8");
const patches=[
  ['const root=path.resolve(import.meta.dirname,".."),action=',`const root=${JSON.stringify(root)},action=`],
  ['"./lib/split-copy-kernel-recipe.mjs"',JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/split-copy-layout-recipe.mjs")).href)],
  ['"./lib/stable-ui-headless-baseline-recipe.mjs"',JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/stable-ui-headless-baseline-recipe.mjs")).href)],
];
let generated=source;for(const[before,after]of patches){assert.equal(generated.split(before).length,2);generated=generated.replace(before,after);}
let recovered=generated;for(const[before,after]of patches.toReversed())recovered=recovered.replace(after,before);assert.equal(recovered,source);
const runtime=await createOwnedRuntimeScratch("split-copy-layout-stager-");
try{const file=path.join(runtime.directory,"stage.mjs");await writeFile(file,generated,{flag:"wx"});await import(pathToFileURL(file).href);}
finally{await runtime.close();}
