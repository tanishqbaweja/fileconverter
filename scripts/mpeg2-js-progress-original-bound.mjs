import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeBoundJsProgressLauncher } from "./lib/mpeg2-js-progress-launch-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
let generated = makeBoundJsProgressLauncher(await readFile(path.join(root, "scripts/mpeg2-js-progress-original.mjs"), "utf8"), root);
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("mpeg2-js-launch-wrapper-");
try { const target = path.join(runtime.directory, "launcher.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
