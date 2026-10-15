import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeCompositedHandoffBuilder } from "./lib/composited-handoff-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."), runtime=await createOwnedRuntimeScratch("composited-handoff-builder-");
try {
  const recipe=makeCompositedHandoffBuilder(await readFile(path.join(root,"scripts/build-staged-handoff-candidate.mjs"),"utf8"),root);
  const file=path.join(runtime.directory,"build.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);
} finally {await runtime.close();}
