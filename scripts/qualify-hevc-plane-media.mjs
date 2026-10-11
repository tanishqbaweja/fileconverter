// One changed-core real media/recovery qualification. No automatic retries.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAttemptMediaCaller } from "./lib/hevc-plane-media-recipe.mjs";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("hevc-plane-media-caller-");
try {
  const recipe = makeAttemptMediaCaller(await readFile(path.join(root, "scripts/validate-mpeg2-encoder-plane-goldens.mjs"), "utf8"), root);
  const file = path.join(runtime.directory, "caller.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
