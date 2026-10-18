// Read-only exact reconstruction before any expensive repeat.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { deriveSsimJspiFullDriver, deriveSsimJspiFullCaller, deriveSsimJspiFullSupervisor } from "./lib/jspi-ssim-full-control.mjs";
import { deriveJspiBrowserStager } from "./lib/jspi-browser-adapter.mjs";
import { makeJspiBrowserComposition } from "./lib/jspi-browser-native.mjs";
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
const root = path.resolve(import.meta.dirname, ".."), file = process.argv[2];
assert.match(file ?? "", /^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-jspi-ssim-full-preparation\.json$/);
const read = name => readFile(path.join(root, name)), receipt = JSON.parse(await read(file));
assert.equal(receipt.status, "prepared-not-executed"); assert.equal(receipt.failure, null); assert.deepEqual(receipt.cleanupErrors, []);
assert.equal(receipt.executions, 0); assert.equal(receipt.driverSpawned, false);
const archive = await materializeUpdatedFullArchive(root, receipt.sourceArchive);
assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.deepEqual(archive.pins, receipt.sourcePins);
for (const [name, digest] of Object.entries(archive.pins)) assert.equal(sha(await read(name)), digest, name);
const original = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
assert.equal((await deriveSsimJspiFullDriver(original.driver, root, receipt.wrapper, path.basename(receipt.candidateDirectory), archive.extensionFiles, receipt.browserPinBefore)).generated, archive.driver);
assert.equal((await deriveSsimJspiFullCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root)).generated, archive.generatedCaller);
assert.equal(deriveSsimJspiFullSupervisor((await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(), root).generated, archive.supervisor);
const composition = await makeJspiBrowserComposition(root);
assert.equal((await deriveJspiBrowserStager(composition.qualified.archive.recipe.generated.stage,
  composition.qualified.archive.recipe.generated.candidateName, path.basename(receipt.candidateDirectory))).generated, archive.stager);
for (const directory of [receipt.wrapper, receipt.candidateDirectory, receipt.callerRuntimeDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
console.log(JSON.stringify({ preparation: file, status: "exact-ssim-framing-full-harness-verified-not-conversion-acceptance",
  sources: Object.keys(archive.pins).length, qualityThreshold: 0.98, browserCodecChanges: 0, executions: 0 }));
