// Independently replay the actual frozen preparation. No browser/conversion.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { deriveLtoBrowserDriver, deriveLtoBrowserCaller } from "./lib/lto-browser-control.mjs";
import { deriveLtoBrowserStager } from "./lib/lto-browser-adapter.mjs";
import { makeLtoBrowserComposition } from "./lib/lto-browser-native.mjs";
import { deriveRecordedTimelineSupervisor } from "./lib/recorded-timeline-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), file = process.argv[2];
assert.match(file ?? "", /^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-lto-control-preparation\.json$/);
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
const read = name => readFile(path.join(root, name)), bytes = await read(file), receipt = JSON.parse(bytes);
assert.equal(receipt.status, "prepared-not-executed"); assert.equal(receipt.failure, null); assert.deepEqual(receipt.cleanupErrors, []);
assert.equal(receipt.executions, 0); assert.equal(receipt.driverSpawned, false); assert.equal(receipt.primaryLimitMiB, 250);
for (const key of ["wrapperRemoved", "candidateRemoved", "productionRestored"]) assert.equal(receipt[key], true);
assert.deepEqual(receipt.protectedBefore, receipt.protectedAfter);
assert.deepEqual(receipt.protectedBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
const archive = await materializeUpdatedFullArchive(root, receipt.sourceArchive);
assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.deepEqual(archive.pins, receipt.sourcePins);
for (const [name, digest] of Object.entries(archive.pins)) assert.equal(sha(await read(name)), digest, name);
const original = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
const recipe = await deriveLtoBrowserDriver(original.driver, root, receipt.wrapper, path.basename(receipt.candidateDirectory), archive.extensionFiles, receipt.browserPinBefore);
assert.equal(recipe.generated, archive.driver, "Frozen driver must equal actual current-source derivation");
assert.equal((await deriveLtoBrowserCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root)).generated, archive.generatedCaller);
assert.equal(deriveRecordedTimelineSupervisor((await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(), root).generated, archive.supervisor);
const composition = await makeLtoBrowserComposition(root);
assert.equal((await deriveLtoBrowserStager(composition.qualified.archive.recipe.generated.stage,
  composition.qualified.archive.recipe.generated.candidateName, path.basename(receipt.candidateDirectory))).generated, archive.stager);
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
for (const directory of [receipt.wrapper, receipt.candidateDirectory, receipt.callerRuntimeDirectory]) {
  assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" });
}
console.log(JSON.stringify({ preparation: { path: file, sha256: sha(bytes) },
  status: "exact-lto-small-harness-derivation-verified-not-conversion-acceptance", sources: Object.keys(archive.pins).length,
  exactDriverCallerStagerSupervisor: true, originalValidatorsUnchanged: true, sixSmallOutputsRequired: true,
  primaryLimitMiB: 250, ownedPreparationScratchAbsent: true, originalUnchanged: true, normalProductionAssetRestored: true,
  nativeDecoder: composition.files["within-mpeg2-split.wasm"].sha256,
  qualifiedPlaneEncoder: composition.files["split-encoder.wasm"].sha256, executions: 0, speedGainProven: false, publicAcceptance: false }));
