// Headless synthetic control only. Never invokes the converter or reads media.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeMvfBrowserControl } from "./lib/mvf-arena-control-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, "..");
const recipe = makeMvfBrowserControl(await readFile(path.join(root, "scripts/check-ebml-reuse-browser-control.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("mvf-arena-control-caller-");
try { const file = path.join(runtime.directory, "caller.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
