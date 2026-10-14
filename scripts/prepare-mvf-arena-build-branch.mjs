import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeMvfArenaBranchCaller } from "./lib/mvf-arena-build-recipe.mjs";
assert.ok(process.argv.length <= 3); const revision = process.argv[2] ?? ""; assert.ok(["", "smoke-warnings"].includes(revision));
const root = path.resolve(import.meta.dirname, ".."), base = "scripts/prepare-alignment16-build-branch.mjs";
const files = ["scripts/prepare-mvf-arena-build-branch.mjs", "scripts/lib/mvf-arena-build-recipe.mjs",
  "scripts/lib/ebml-reuse-collector-v2.mjs", "scripts/lib/mpeg2-ebml-reuse-build-recipe.mjs", "scripts/lib/mpeg2-realloc-build-recipe.mjs",
  "scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs", "scripts/lib/mpeg2-packet-cache-strict-build-recipe.mjs",
  "scripts/lib/mpeg2-packet-cache-build-recipe.mjs", "scripts/lib/hevc-plane-build-recipe.mjs", "scripts/lib/alignment16-build-recipe.mjs", base];
const sourcePins = {}, sourcePreimages = {};
for (const file of files) { const bytes = await readFile(path.join(root, file)); sourcePins[file] = sha(bytes); sourcePreimages[file] = bytes.toString("base64"); }
const recipe = makeMvfArenaBranchCaller(await readFile(path.join(root, base), "utf8"), root, revision);
const runtime = await createOwnedRuntimeScratch("mvf-arena-build-branch-");
try { const file = path.join(runtime.directory, "branch.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const postSourcePins = {}; for (const file of files) postSourcePins[file] = sha(await readFile(path.join(root, file)));
assert.deepEqual(postSourcePins, sourcePins);
const output = `evidence/mvf-arena-build-branch-executed-sources-2026-10-15${revision ? "-" + revision : ""}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), recipe, sourcePins, sourcePreimages, postSourcePins,
  ownedRuntimeAbsent: true, actualBuildStarted: false, originalRead: false, browserConversions: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output }));
