// Current real headless Chrome diagnostic only. Never invokes media conversion.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeDurationDrainBrowserControl } from "./lib/duration-drain-control-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, "..");
const recipe = makeDurationDrainBrowserControl(await readFile(path.join(root, "scripts/check-ebml-reuse-browser-control.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("duration-drain-control-caller-");
try {
  const file = path.join(runtime.directory, "caller.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
