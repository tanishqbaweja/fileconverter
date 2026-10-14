// Reuse the isolated-index branch mechanism; canonical workflow stays unchanged.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeEbmlReuseBranchCaller } from "./lib/mpeg2-ebml-reuse-build-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), file = "scripts/prepare-alignment16-build-branch.mjs";
const files = ["scripts/prepare-mpeg2-ebml-reuse-build-branch.mjs", "scripts/lib/mpeg2-ebml-reuse-build-recipe.mjs",
  "scripts/lib/mpeg2-realloc-build-recipe.mjs", "scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs",
  "scripts/lib/mpeg2-packet-cache-strict-build-recipe.mjs", "scripts/lib/mpeg2-packet-cache-build-recipe.mjs",
  "scripts/lib/hevc-plane-build-recipe.mjs", "scripts/lib/alignment16-build-recipe.mjs", file];
const sourcePins = {}, sourcePreimages = {};
for (const name of files) {
  const bytes = await readFile(path.join(root, name)); sourcePins[name] = sha(bytes); sourcePreimages[name] = bytes.toString("base64");
}
const recipe = makeEbmlReuseBranchCaller(await readFile(path.join(root, file), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("ebml-reuse-build-branch-");
try {
  const target = path.join(runtime.directory, "branch.mjs"); await writeFile(target, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(target).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const postSourcePins = {};
for (const name of files) postSourcePins[name] = sha(await readFile(path.join(root, name)));
assert.deepEqual(postSourcePins, sourcePins);
const output = "evidence/ebml-reuse-build-branch-executed-sources-2026-10-14.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), recipe,
  sourcePins, postSourcePins, sourcePreimages, ownedWrapperAbsent: true, actualBuildStarted: false,
  originalVideoRead: false, browserConversions: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output }));
