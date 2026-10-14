import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeMvfArenaCollector } from "./lib/mvf-arena-build-recipe.mjs";
assert.equal(process.argv.length, 3); const runId = process.argv[2]; assert.match(runId, /^[0-9]{8,}$/);
const root = path.resolve(import.meta.dirname, ".."), base = "scripts/collect-mpeg2-single-idle-build.mjs";
const files = ["scripts/collect-mvf-arena-build.mjs", "scripts/lib/mvf-arena-build-recipe.mjs", "scripts/lib/ebml-reuse-collector-v2.mjs",
  "scripts/lib/mpeg2-ebml-reuse-build-recipe.mjs", "scripts/lib/mpeg2-realloc-build-recipe.mjs", "scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs",
  "scripts/lib/mpeg2-packet-cache-strict-build-recipe.mjs", "scripts/lib/mpeg2-packet-cache-build-recipe.mjs", "scripts/lib/hevc-plane-build-recipe.mjs",
  "scripts/lib/alignment16-build-recipe.mjs", "scripts/lib/allocation-attempt-build-recipe.mjs", base];
const sourcePins = {}, sourcePreimages = {}; for (const file of files) { const bytes = await readFile(path.join(root, file)); sourcePins[file] = sha(bytes); sourcePreimages[file] = bytes.toString("base64"); }
const recipe = makeMvfArenaCollector(await readFile(path.join(root, base), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("mvf-arena-collector-"); let failure = null;
try { const file = path.join(runtime.directory, "collector.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const postSourcePins = {}; for (const file of files) postSourcePins[file] = sha(await readFile(path.join(root, file)));
assert.deepEqual(postSourcePins, sourcePins);
const output = `evidence/mvf-arena-build-collector-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), runId, failure, recipe, sourcePins, sourcePreimages, postSourcePins,
  ownedRuntimeAbsent: true, originalRead: false, browserConversions: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, failure })); assert.equal(failure, null);
