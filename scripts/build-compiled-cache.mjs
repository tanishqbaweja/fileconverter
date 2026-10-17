import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeCompiledCacheBuilder } from "./lib/compiled-cache-candidate.mjs";
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("compiled-cache-builder-");
try {
  const source = await readFile(path.join(root, "scripts/build-staged-handoff-candidate.mjs"), "utf8");
  const file = path.join(runtime.directory, "builder.mjs");
  await writeFile(file, makeCompiledCacheBuilder(source, root), { flag: "wx" }); await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
