import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeCompositeReallocControlCaller } from "./lib/realloc-composite-control-recipe.mjs";
assert.equal(process.argv.length,2);
const root = path.resolve(import.meta.dirname,".."), runtime = await createOwnedRuntimeScratch("realloc-composite-launcher-");
try {
  const recipe = makeCompositeReallocControlCaller(await readFile(path.join(root,"scripts/check-realloc-abort-control.mjs"),"utf8"),root);
  const file = path.join(runtime.directory,"caller.mjs"); await writeFile(file,recipe.generated,{flag:"wx"}); await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
