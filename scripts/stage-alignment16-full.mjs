// Production staging/restore uses the exact browser-qualified alignment16 stager.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAlignment16StagerCaller } from "./lib/alignment16-full-recipe.mjs";
assert.ok(process.argv.length === 3 && ["stage", "restore"].includes(process.argv[2]));
const recipe = await makeAlignment16StagerCaller(), runtime = await createOwnedRuntimeScratch("alignment16-full-stage-");
try {
  const file = path.join(runtime.directory, "caller.mjs");
  await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
