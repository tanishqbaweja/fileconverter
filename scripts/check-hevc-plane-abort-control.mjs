// One actual new-core headless fatal control; zero media and no automatic retry.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeHevcPlaneControlCaller } from "./lib/hevc-plane-control-recipe.mjs";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("hevc-plane-control-wrapper-");
try {
  const recipe = makeHevcPlaneControlCaller(await readFile(path.join(root, "scripts/check-allocation-attempt-abort-control.mjs"), "utf8"), root);
  const file = path.join(runtime.directory, "caller.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
