import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeBoundedTypeDriver } from "./lib/bounded-name-detailed-blink-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("bounded-type-blink-wrapper-");
try {
  const driver = makeBoundedTypeDriver(await readFile(path.join(root, "scripts/probe-single-detailed-blink-types.mjs"), "utf8"), root);
  const file = path.join(runtime.directory, "driver.mjs"); await writeFile(file, driver, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" });
console.log("Bounded-type wrapper scratch removed");
