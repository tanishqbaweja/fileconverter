import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeReallocCollector } from "./lib/mpeg2-realloc-build-recipe.mjs";
assert.equal(process.argv.length, 3); const runId = process.argv[2]; assert.match(runId ?? "", /^[0-9]{8,}$/);
const root = path.resolve(import.meta.dirname, ".."), sourceFiles = ["scripts/collect-mpeg2-realloc-build.mjs", "scripts/lib/mpeg2-realloc-build-recipe.mjs",
  "scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs", "scripts/lib/alignment16-build-recipe.mjs", "scripts/lib/allocation-attempt-build-recipe.mjs",
  "scripts/collect-mpeg2-single-idle-build.mjs", "scripts/lib/hevc-plane-build-recipe.mjs", "scripts/lib/mpeg2-packet-cache-build-recipe.mjs",
  "scripts/lib/mpeg2-packet-cache-strict-build-recipe.mjs"];
const sourcePins = {}, preimages = {};
for (const file of sourceFiles) { const bytes = await readFile(path.join(root, file)); sourcePins[file] = sha(bytes); preimages[file] = bytes.toString("base64"); }
const recipe = makeReallocCollector(await readFile(path.join(root, "scripts/collect-mpeg2-single-idle-build.mjs"), "utf8"), root), runtime = await createOwnedRuntimeScratch("realloc-build-collector-");
let failure = null;
try { const file = path.join(runtime.directory, "collector.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const postSourcePins = {}; for (const file of sourceFiles) postSourcePins[file] = sha(await readFile(path.join(root, file))); assert.deepEqual(postSourcePins, sourcePins);
const output = `evidence/realloc-build-collector-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), runId, failure, recipe, sourcePins, postSourcePins, preimages,
  ownedRuntimeRemoved: true, browserConversions: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, failure })); assert.equal(failure, null);
