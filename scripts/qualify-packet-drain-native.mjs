// Every native source is joined to the actual executed Git head; derive fresh ABI.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makePacketDrainNativeQualifier } from "./lib/packet-drain-native-recipe.mjs";
assert.equal(process.argv.length, 3); const runId = process.argv[2]; assert.match(runId, /^[0-9]{8,}$/);
const root = path.resolve(import.meta.dirname, ".."), base = "scripts/qualify-ebml-reuse-native.mjs";
const files = ["scripts/qualify-packet-drain-native.mjs", "scripts/lib/packet-drain-native-recipe.mjs", "scripts/lib/mvf-arena-native-recipe.mjs", base];
const sourcePins = {}, sourcePreimages = {};
for (const file of files) { const bytes = await readFile(path.join(root, file)); sourcePins[file] = sha(bytes); sourcePreimages[file] = bytes.toString("base64"); }
const recipe = makePacketDrainNativeQualifier(await readFile(path.join(root, base), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("packet-drain-native-qualifier-"); let failure = null;
try {
  const file = path.join(runtime.directory, "qualifier.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const postSourcePins = {};
for (const file of files) postSourcePins[file] = sha(await readFile(path.join(root, file)));
assert.deepEqual(postSourcePins, sourcePins);
const output = `evidence/packet-drain-native-qualifier-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), runId, failure, recipe,
  sourcePins, sourcePreimages, postSourcePins, ownedRuntimeAbsent: true, originalRead: false,
  browserConversions: 0, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, failure })); assert.equal(failure, null);
