import "./lib/reliable-readonly-preflight.mjs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { deriveCatalogueSlotUiHarness } from "./lib/catalogue-slot-reuse.mjs";
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("catalogue-slot-validator-");
try {
  const source = await readFile(path.join(root, "scripts/validate-bounded-catalogue.mjs"), "utf8");
  const file = path.join(runtime.directory, "validator.mjs");
  await writeFile(file, deriveCatalogueSlotUiHarness(source, root).generated, { flag: "wx" }); await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
