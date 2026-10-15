import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeReliableCompositedCaller } from "./lib/reliable-composited-media.mjs";
assert.ok(process.argv.length===3||(process.argv.length===4&&process.argv[3]==="--prepare"));
const root=path.resolve(import.meta.dirname,".."),runtime=await createOwnedRuntimeScratch("reliable-composited-qualifier-");
try {
  const recipe=makeReliableCompositedCaller(await readFile(path.join(root,"scripts/qualify-ebml-reuse-media.mjs"),"utf8"),root);
  const file=path.join(runtime.directory,"qualifier.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);
}finally{await runtime.close();}
