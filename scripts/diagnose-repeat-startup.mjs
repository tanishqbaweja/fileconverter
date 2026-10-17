import "./lib/reliable-readonly-preflight.mjs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { deriveRepeatStartupRunner } from "./lib/repeat-startup-diagnostic.mjs";

const root = path.resolve(import.meta.dirname, "..");
const runtime = await createOwnedRuntimeScratch("repeat-startup-caller-");
try {
  const source = await readFile(path.join(root, "scripts/qualify-updated-chrome-media.mjs"), "utf8");
  const file = path.join(runtime.directory, "runner.mjs");
  await writeFile(file, deriveRepeatStartupRunner(source, root), { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
