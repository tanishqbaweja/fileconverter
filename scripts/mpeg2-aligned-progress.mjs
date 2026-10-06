import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAlignedProgressDriver } from "./lib/mpeg2-aligned-progress-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const name = process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR;
assert.match(name ?? "", /^mpeg2-split-pipeline-[0-9]{8,}$/);
const manifest = JSON.parse(await readFile(path.join(root, "work", name, "build-manifest.json")));
assert.equal(manifest.scope, "private-fixed-heap-alignment-reuse-candidate-not-browser-acceptance");
assert.equal(manifest.alignedReuse.actualLinkedWrapperVerified, true);
assert.equal(manifest.alignedReuse.browserConversionVerified, false);
const source = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
const generated = makeAlignedProgressDriver(source, root, specifier => import.meta.resolve(specifier));
const runtime = await createOwnedRuntimeScratch("mpeg2-aligned-driver-");
try {
  const file = path.join(runtime.directory, "progress.mjs");
  await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally {
  await runtime.close();
}
