// Isolated index, same canonical-worktree protection; no checkout/media copies.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makePacketCacheBranchCaller } from "./lib/mpeg2-packet-cache-build-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), file = "scripts/prepare-alignment16-build-branch.mjs";
const sourceFiles = ["scripts/prepare-mpeg2-packet-cache-build-branch.mjs", "scripts/lib/mpeg2-packet-cache-build-recipe.mjs", file, "scripts/lib/alignment16-build-recipe.mjs",
  "scripts/prepare-hevc-plane-build-branch.mjs", "scripts/lib/hevc-plane-build-recipe.mjs"];
const sourcePins = {}, sourcePreimages = {};
for (const name of sourceFiles) { const bytes = await readFile(path.join(root, name)); sourcePins[name] = sha(bytes); sourcePreimages[name] = bytes.toString("base64"); }
const recipe = makePacketCacheBranchCaller(await readFile(path.join(root, file), "utf8"), root), runtime = await createOwnedRuntimeScratch("packet-cache-branch-caller-");
try {
  const target = path.join(runtime.directory, "branch.mjs"); await writeFile(target, recipe.generated, { flag: "wx" }); await import(pathToFileURL(target).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const postSourcePins = {}; for (const name of sourceFiles) postSourcePins[name] = sha(await readFile(path.join(root, name))); assert.deepEqual(postSourcePins, sourcePins);
const output = "evidence/packet-cache-branch-executed-sources-2026-10-12.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), recipe, sourcePins, postSourcePins, sourcePreimages,
  ownedWrapperAbsent: true, actualBuildStarted: false, originalVideoRead: false, browserConversions: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output }));

