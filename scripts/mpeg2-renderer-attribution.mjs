import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeRendererAttributionDriver } from "./lib/mpeg2-renderer-attribution-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const proof = JSON.parse(await readFile(path.join(root, "evidence/renderer-attribution-prerequisite-2026-10-06.json")));
assert.equal(proof.status, "completed-diagnostic"); assert.equal(proof.result.status, "completed-diagnostic");
assert.equal(proof.converterLoaded, false); assert.equal(proof.originalRead, false);
assert.equal(proof.identicalOriginalFlags, true);
for (const [source, digest] of Object.entries(proof.sourcePins))
  assert.equal(createHash("sha256").update(await readFile(path.join(root, source))).digest("hex"), digest, source);
const failure = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-settled-original-failure-2026-10-06.json")));
assert.equal(failure.incrementalPrivateMiB, 277.97265625); assert.equal(failure.allocationSource, null);
assert.equal(failure.completeOriginalConversion, false);
const name = process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR;
assert.match(name ?? "", /^mpeg2-split-pipeline-[0-9]{8,}$/);
const manifest = JSON.parse(await readFile(path.join(root, "work", name, "build-manifest.json")));
assert.equal(manifest.scope, "private-fixed-heap-alignment-reuse-candidate-not-browser-acceptance");
assert.equal(manifest.alignedReuse.actualLinkedWrapperVerified, true);
const source = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
const generated = makeRendererAttributionDriver(source, root, specifier => import.meta.resolve(specifier));
const runtime = await createOwnedRuntimeScratch("mpeg2-renderer-attribution-driver-");
try {
  const file = path.join(runtime.directory, "full-source.mjs"); await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
