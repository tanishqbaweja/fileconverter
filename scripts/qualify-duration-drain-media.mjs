// Genuine production browser cases plus independent encoded-packet diagnostics.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeDurationDrainMediaCaller } from "./lib/duration-drain-media-caller-recipe.mjs";
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === "--prepare"));
const root = path.resolve(import.meta.dirname, "..");
const recipe = makeDurationDrainMediaCaller(await readFile(path.join(root, "scripts/qualify-ebml-reuse-media.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("duration-drain-media-qualifier-");
try {
  const file = path.join(runtime.directory, "qualifier.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
