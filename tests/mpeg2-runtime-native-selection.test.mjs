import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { mpeg2RuntimeNativeRows } from "../scripts/lib/mpeg2-runtime-native-selection.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
// Synthetic receipt shape only; these units never establish native/browser acceptance.
const runId = "12345678901";
function fixture() {
  const actual = { status: "passed-native-scaled-property-lifecycle", oldSideData: 17, errorSymbol: "EFBIG", expectedWireResult: -22, oldWireResult: -22,
    correctedCopies: 1000, maximumCorrectedSideData: 1, mediaConversions: 0, pixelStorageAndBytesUnchanged: true,
    sourcePropertiesPreserved: true, staleDictionaryRemoved: true, bFramePolicyUnchanged: true };
  const exactSource = JSON.stringify(actual), artifacts = { "within-mpeg2-split.mjs": "a".repeat(64), "within-mpeg2-split.wasm": "b".repeat(64) };
  return { status: "actual-scaled-properties-build-unit-verified-not-browser-acceptance", run: { databaseId: Number(runId), status: "completed", conclusion: "success" },
    hostedCleanupStepPassed: true, downloadRuntimeRemoved: true, publicAcceptance: false,
    files: Object.entries(artifacts).map(([file, sha256]) => ({ file, sha256 })), manifest: { scope: "private-scaled-properties-jspi-not-browser-acceptance", artifacts,
      scaledProperties: { actualWasm32: actual, exactSource, sha256: sha(exactSource), sideDataLimit: 16, propertyWireCapacityBytes: 65536,
        pixelStorageChanged: false, bFramePolicyChanged: false, codecSettingsChanged: false, heapLimitsChanged: false, productionIoChanged: false, publicAcceptance: false } } };
}
test("default native binding stays exact; changed decoder cannot silently replace qualified encoder", () => {
  const old = mpeg2RuntimeNativeRows(), changed = mpeg2RuntimeNativeRows(runId, fixture());
  assert.equal(old[1][3], "4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57");
  assert.equal(changed[1][1], `mpeg2-scaled-properties-${runId}`); assert.equal(changed[1][4], 512);
  assert.deepEqual(changed.slice(2), old.slice(2)); assert.equal(changed[3][3], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  changed[3][3] = "do not mutate static bindings"; assert.deepEqual(mpeg2RuntimeNativeRows().slice(2), old.slice(2));
});
test("failed/unbound/changed-policy builds and arbitrary paths are refused before browser work", () => {
  for (const id of ["../work", "42", "40048810064/", "40048810064=extra"]) assert.throws(() => mpeg2RuntimeNativeRows(id, fixture()));
  const changes = [p => p.run.conclusion = "failure", p => p.run.databaseId++, p => p.hostedCleanupStepPassed = false,
    p => p.manifest.scaledProperties.sideDataLimit = 17, p => p.manifest.scaledProperties.bFramePolicyChanged = true,
    p => p.manifest.scaledProperties.actualWasm32.maximumCorrectedSideData = 17, p => p.manifest.scaledProperties.sha256 = "0".repeat(64),
    p => p.files[1].sha256 = "0".repeat(64), p => p.publicAcceptance = true];
  for (const change of changes) { const p = fixture(); change(p); assert.throws(() => mpeg2RuntimeNativeRows(runId, p)); }
});
