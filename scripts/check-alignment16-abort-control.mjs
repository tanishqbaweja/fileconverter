// One actual new-binary headless fatal control. No media, no automatic retry.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAlignment16ControlCaller } from "./lib/alignment16-control-recipe.mjs";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("alignment16-control-wrapper-");
try {
  const recipe = makeAlignment16ControlCaller(await readFile(path.join(root, "scripts/check-allocation-attempt-abort-control.mjs"), "utf8"), root);
  const file = path.join(runtime.directory, "caller.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
