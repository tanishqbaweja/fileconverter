// Qualified bitrate-only adapter with the unchanged failure observer.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeEncoderPlaneBitrateAbortStager } from "./lib/encoder-plane-bitrate-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const runtime = await createOwnedRuntimeScratch("encoder-plane-bitrate-abort-caller-");
try {
  const recipe = makeEncoderPlaneBitrateAbortStager(await readFile(path.join(root, "scripts/stage-mpeg2-single-idle-abort.mjs"), "utf8"), root);
  const file = path.join(runtime.directory, "stage.mjs");
  await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
