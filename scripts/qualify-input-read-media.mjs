// One headless diagnostic suite; actual production I/O, no retry or support promotion.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeInputReadMediaCaller } from "./lib/input-read-media-recipe.mjs";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("input-read-media-caller-");
try {
  const recipe = makeInputReadMediaCaller(await readFile(path.join(root, "scripts/validate-mpeg2-encoder-plane-goldens.mjs"), "utf8"), root);
  const file = path.join(runtime.directory, "caller.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
