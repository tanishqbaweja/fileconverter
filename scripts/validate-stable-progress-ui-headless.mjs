// Next browser runs are headless; never invoke the old headed launcher directly.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeHeadlessStableUiLauncher } from "./lib/headless-stable-ui-golden-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, "..");
const generated = makeHeadlessStableUiLauncher(await readFile(path.join(root, "scripts/validate-stable-progress-ui-goldens.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("stable-ui-headless-launch-");
try {
  const file = path.join(runtime.directory, "run.mjs"); await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
