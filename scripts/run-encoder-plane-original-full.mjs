// One changed full-video attempt; the exact frozen caller supplies all gates.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeEncoderPlaneFullCaller } from "./lib/encoder-plane-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const runtime = await createOwnedRuntimeScratch("encoder-plane-full-caller-");
try {
  const source = await readFile(path.join(root, "scripts/run-single-idle-original-full.mjs"), "utf8");
  const recipe = makeEncoderPlaneFullCaller(source, root);
  const file = path.join(runtime.directory, "caller.mjs");
  await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
