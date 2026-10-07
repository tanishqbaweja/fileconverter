import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeOffscreenMatrixDriver } from "./lib/ui-offscreen-matrix-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("ui-offscreen-matrix-wrapper-");
try {
  const source = makeOffscreenMatrixDriver(await readFile(path.join(root, "scripts/diagnose-ui-largest-blink.mjs"), "utf8"), root);
  const file = path.join(runtime.directory, "driver.mjs"); await writeFile(file, source, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" }); console.log("Offscreen-matrix wrapper scratch removed");
