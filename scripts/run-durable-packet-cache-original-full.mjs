import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeDurablePacketCacheFullCaller } from "./lib/durable-packet-cache-full-recipe.mjs";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const recipe = await makeDurablePacketCacheFullCaller(), runtime = await createOwnedRuntimeScratch("durable-packet-cache-full-");
try {
  const file = path.join(runtime.directory, "caller.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
