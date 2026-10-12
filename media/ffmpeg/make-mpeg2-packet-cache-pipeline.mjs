import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makePacketCachePipelineGenerator } from "./mpeg2-packet-cache-builder-recipe.mjs";
assert.equal(process.argv.length, 3);
const root = path.resolve(import.meta.dirname, "../.."), recipe = makePacketCachePipelineGenerator(await readFile(path.join(root, "media/ffmpeg/make-mpeg2-split-pipeline.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("packet-cache-pipeline-");
try {
  const file = path.join(runtime.directory, "pipeline.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
