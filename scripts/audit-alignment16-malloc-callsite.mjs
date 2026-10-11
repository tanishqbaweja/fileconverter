// Static-only inspection. Own and preserve exact executed generated source.
import assert from "node:assert/strict";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAlignment16StaticCollector } from "./lib/alignment16-static-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const files = ["scripts/audit-alignment16-malloc-callsite.mjs", "scripts/lib/alignment16-static-recipe.mjs",
  "scripts/audit-attempt-alignment-callsite.mjs", "scripts/lib/wasm-static-function-slice.mjs",
  "scripts/lib/wasm-function-metadata.mjs", "scripts/lib/selected-wasm-disassembly.mjs", "tests/alignment16-static.test.mjs"];
const sourcePins = {}, sourcePreimages = {};
for (const file of files) { const bytes = await read(file); sourcePins[file] = sha(bytes); sourcePreimages[file] = { encoding: "base64", data: bytes.toString("base64") }; }
const recipe = makeAlignment16StaticCollector((await read(files[2])).toString(), root);
const before = new Set(await readdir(path.join(root, "evidence"))), runtime = await createOwnedRuntimeScratch("alignment16-static-caller-");
let failure = null, receipt = null;
try {
  const file = path.join(runtime.directory, "collector.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
  const names = (await readdir(path.join(root, "evidence"))).filter(name => !before.has(name) && name.endsWith("-alignment16-malloc-static.json"));
  assert.equal(names.length, 1); const filePath = "evidence/" + names[0], bytes = await read(filePath), value = JSON.parse(bytes);
  receipt = { path: filePath, sha256: sha(bytes), failure: value.failure };
  assert.equal(value.failure, null); assert.equal(value.cleanup.runtimeCacheAndToolRemoved, true);
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const postSourcePins = {}; for (const file of files) postSourcePins[file] = sha(await read(file)); assert.deepEqual(postSourcePins, sourcePins);
const proof = { recordedAt: new Date().toISOString(), status: failure ? "failed-static-only-collector" : "actual-first-malloc-static-bodies-retained-not-fixed",
  sourcePins, postSourcePins, sourcePreimages, recipe, receipt, failure, ownedWrapperAbsent: true,
  originalVideoRead: false, originalFunctionsExecuted: 0, mediaConversions: 0, publicAcceptance: false };
const output = "evidence/alignment16-malloc-static-executed-sources-2026-10-12.json";
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, failure, receipt })); assert.equal(failure, null);
