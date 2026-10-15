import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeStagedHandoffMediaCaller } from "./lib/staged-handoff-media-caller.mjs";
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === "--prepare"));
const root = path.resolve(import.meta.dirname, "..");
const recipe = makeStagedHandoffMediaCaller(await readFile(path.join(root, "scripts/qualify-ebml-reuse-media.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("staged-handoff-media-qualifier-");
try { const file = path.join(runtime.directory, "qualifier.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
