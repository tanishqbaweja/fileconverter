// Independent bounded derivation check; no conversion, browser, or mutation.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { deriveJspiFullDriver, deriveJspiFullCaller, deriveJspiFullSupervisor } from "./lib/jspi-full-control.mjs";
import { deriveJspiBrowserStager } from "./lib/jspi-browser-adapter.mjs";
import { makeJspiBrowserComposition } from "./lib/jspi-browser-native.mjs";
const root = path.resolve(import.meta.dirname, ".."), file = process.argv[2];
assert.match(file ?? "", /^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-jspi-full-preparation\.json$/);
const read = name => readFile(path.join(root, name)), receipt = JSON.parse(await read(file));
assert.equal(receipt.status, "prepared-not-executed"); assert.equal(receipt.failure, null); assert.deepEqual(receipt.cleanupErrors, []);
assert.equal(receipt.executions, 0); assert.equal(receipt.driverSpawned, false);
for (const key of ["wrapperRemoved", "candidateRemoved", "productionRestored"]) assert.equal(receipt[key], true);
const archive = await materializeUpdatedFullArchive(root, receipt.sourceArchive);
assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.deepEqual(archive.pins, receipt.sourcePins);
for (const [name, digest] of Object.entries(archive.pins)) assert.equal(sha(await read(name)), digest, name);
const original = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
const recipe = await deriveJspiFullDriver(original.driver, root, receipt.wrapper, path.basename(receipt.candidateDirectory), archive.extensionFiles, receipt.browserPinBefore);
assert.equal(sha(recipe.generated), sha(archive.driver), "Generated full driver must equal the current frozen-source derivation");
assert.equal((await deriveJspiFullCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root)).generated, archive.generatedCaller);
assert.equal(deriveJspiFullSupervisor((await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(), root).generated, archive.supervisor);
const composition = await makeJspiBrowserComposition(root);
assert.equal((await deriveJspiBrowserStager(composition.qualified.archive.recipe.generated.stage,
  composition.qualified.archive.recipe.generated.candidateName, path.basename(receipt.candidateDirectory))).generated, archive.stager);
for (const directory of [receipt.wrapper, receipt.candidateDirectory, receipt.callerRuntimeDirectory]) {
  assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" });
}
console.log(JSON.stringify({ preparation: file, status: "exact-full-harness-derivation-verified-not-conversion-acceptance",
  sources: Object.keys(archive.pins).length, originalValidatorsUnchanged: true, threeFullRunsRequired: true,
  primaryLimitMiB: 250, deadlineMs: 21600000, ownedPreparationScratchAbsent: true, executions: 0 }));
