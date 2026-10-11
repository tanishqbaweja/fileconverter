// Production staging/restore uses the exact browser-qualified hevc-plane stager.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeHevcPlaneStagerCaller } from "./lib/hevc-plane-full-recipe.mjs";
assert.ok(process.argv.length === 3 && ["stage", "restore"].includes(process.argv[2]));
const recipe = await makeHevcPlaneStagerCaller(), runtime = await createOwnedRuntimeScratch("hevc-plane-full-stage-");
try {
  const file = path.join(runtime.directory, "caller.mjs");
  await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
