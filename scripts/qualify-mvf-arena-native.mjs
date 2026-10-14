// Preserve all old native controls; derive current ABI from actual changed bytes.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeMvfNativeQualifier } from "./lib/mvf-arena-native-recipe.mjs";
assert.ok(process.argv.length >= 3 && process.argv.length <= 4); const runId = process.argv[2]; assert.match(runId, /^[0-9]{8,}$/);
const revision = process.argv[3] ?? ""; assert.ok(["", "smoke-warnings"].includes(revision));
const root = path.resolve(import.meta.dirname, ".."), base = "scripts/qualify-ebml-reuse-native.mjs";
const sourcePins = {}, sourcePreimages = {};
for (const file of ["scripts/qualify-mvf-arena-native.mjs", "scripts/lib/mvf-arena-native-recipe.mjs", base]) {
  const bytes = await readFile(path.join(root, file)); sourcePins[file] = sha(bytes); sourcePreimages[file] = bytes.toString("base64");
}
const recipe = makeMvfNativeQualifier(await readFile(path.join(root, base), "utf8"), root, revision);
const runtime = await createOwnedRuntimeScratch("mvf-arena-native-qualifier-"); let failure = null;
try { const file = path.join(runtime.directory, "qualifier.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const postSourcePins = {}; for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await readFile(path.join(root, file)));
assert.deepEqual(postSourcePins, sourcePins);
const output = `evidence/mvf-arena-native-qualifier-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), runId, failure, recipe, sourcePins, sourcePreimages, postSourcePins,
  ownedRuntimeAbsent: true, originalRead: false, browserConversions: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, failure })); assert.equal(failure, null);
