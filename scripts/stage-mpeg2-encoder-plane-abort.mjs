// Exact existing decoder fatal observer, separately verified changed encoder.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeEncoderPlaneAbortStager } from "./lib/encoder-plane-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const runtime = await createOwnedRuntimeScratch("encoder-plane-abort-caller-");
try {
  const source = await readFile(path.join(root, "scripts/stage-mpeg2-single-idle-abort.mjs"), "utf8");
  const recipe = makeEncoderPlaneAbortStager(source, root);
  const file = path.join(runtime.directory, "stage.mjs");
  await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
