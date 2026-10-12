import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAttemptPlaneCandidate as createBase } from "./packet-cache-candidate.mjs";
import { makeAsyncifyStorageGlue } from "./asyncify-storage-glue-recipe.mjs";
import { verifyAsyncifyStorageCandidate } from "./asyncify-storage-media-recipe.mjs";
export const verifyAttemptPlaneCandidate = verifyAsyncifyStorageCandidate;
export async function createAttemptPlaneCandidate(root, directory) {
  const base = await createBase(root, directory), file = path.join(directory, "within-mpeg2-split.mjs");
  const recipe = makeAsyncifyStorageGlue(await readFile(file, "utf8"));
  const manifest = structuredClone(base.manifest);
  manifest.artifacts["within-mpeg2-split.mjs"] = recipe.generatedSha256;
  manifest.asyncifyStorage = { originalGlueSha256: recipe.originalSha256, generatedGlueSha256: recipe.generatedSha256,
    stackBytes: 262144, headerBytes: 12, reservationBytes: 262156, maximumLeases: 1, startupReservation: true,
    nativeWasmChanged: false, heapLimitsChanged: false, publicAcceptance: false };
  await writeFile(file, recipe.generated);
  await writeFile(path.join(directory, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  assert.deepEqual(await verifyAsyncifyStorageCandidate(root, directory), manifest);
  return { ...base, manifest, files: { ...base.files, "within-mpeg2-split.mjs": { path: "source-derived-private-glue",
    bytes: Buffer.byteLength(recipe.generated), sha256: recipe.generatedSha256 } }, asyncifyGlueRecipe: recipe,
    bytes: base.bytes - base.files["within-mpeg2-split.mjs"].bytes + Buffer.byteLength(recipe.generated), publicAcceptance: false };
}
