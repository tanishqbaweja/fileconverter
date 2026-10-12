// Enumerated reversible sidecar edits only; preserve all existing full gates.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makePacketCacheFullCaller, makeAllocationAttemptFullDriver as originalDriver } from "./packet-cache-full-recipe.mjs";
const rootDefault = path.resolve(import.meta.dirname, "../..");
export const DURABLE_CONTROL = { path: "evidence/2026-10-12T10-08-28-243Z-durable-native-checkpoint-control.json",
  sha256: "1bfcb787a23580d5bb56fe74220f07b3a6be26435dca605f68c78c004fea87aa" };
const ownFiles = ["scripts/lib/durable-packet-cache-full-recipe.mjs", "scripts/run-durable-packet-cache-original-full.mjs",
  "scripts/launch-durable-packet-cache-supervisor.mjs", "tests/durable-packet-cache-full.test.mjs"];
function edited(parent, edits) {
  let generated = parent.generated;
  for (const [before, after, count = 1] of edits) {
    assert.notEqual(before, after); assert.equal(generated.split(before).length - 1, count, before);
    generated = generated.replaceAll(before, after);
  }
  let reversed = generated;
  for (const [before, after, count = 1] of edits.toReversed()) {
    assert.equal(reversed.split(after).length - 1, count); reversed = reversed.replaceAll(after, before);
  }
  assert.equal(reversed, parent.generated, "No conversion/quality/memory/repeat/cleanup gate changed");
  return { ...parent, generated, generatedSha256: sha(generated), durableObserverEdits: edits,
    originalPacketCacheDriverSha256: parent.generatedSha256, originalAcceptanceGatesByteExact: true };
}
export async function verifyDurableControl(root = rootDefault) {
  const bytes = await readFile(path.join(root, DURABLE_CONTROL.path)); assert.equal(sha(bytes), DURABLE_CONTROL.sha256);
  const proof = JSON.parse(bytes); assert.equal(proof.failure, null);
  assert.equal(proof.status, "durable-native-checkpoint-windows-and-synthetic-abrupt-controls-pass-not-browser-acceptance");
  assert.equal(proof.nativeControl.everyPhasePeakMatchesOriginalObserver, true); assert.ok(proof.nativeControl.observedSamples >= 20);
  assert.equal(proof.abruptControl.checkpointRecoveredAfterChildAbruptExit, true); assert.equal(proof.abruptControl.childExit.code, 19);
  assert.equal(proof.conversionAcceptance, false); assert.equal(proof.appOrWindowsJobAbortSurvivalVerified, false);
  for (const [file, row] of Object.entries(proof.sourcePreimages)) {
    const current = await readFile(path.join(root, file)); assert.equal(sha(current), row.sha256, file);
    assert.deepEqual(Buffer.from(row.data, "base64"), current, file);
  }
  return proof;
}
export async function makeAllocationAttemptFullDriver(root, runtime, name, files) {
  await verifyDurableControl(root);
  const parent = await originalDriver(root, runtime, name, files);
  const url = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  return edited(parent, [
    [url("clock-fenced-native-failure-observer.mjs"), url("durable-native-failure-observer.mjs")],
    ["getBlankBaseline: () => blankBaseline,", "checkpointPath: reportBase + '-native-checkpoint.json',\n    getBlankBaseline: () => blankBaseline,"],
  ]);
}
export async function makeDurablePacketCacheFullCaller(root = rootDefault) {
  const proof = await verifyDurableControl(root), parent = await makePacketCacheFullCaller(root);
  const extra = [...new Set([...ownFiles, ...Object.keys(proof.sourcePreimages), DURABLE_CONTROL.path,
    proof.nativeControl.archived.path, proof.abruptControl.archive.path])];
  const oldImport = `import { makeAllocationAttemptFullDriver } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/packet-cache-full-recipe.mjs")).href)};`;
  const newImport = oldImport.replace("packet-cache-full-recipe.mjs", "durable-packet-cache-full-recipe.mjs");
  const result = edited(parent, [[oldImport, newImport], ["const callerFiles = [", `const callerFiles = [${extra.map(file => JSON.stringify(file)).join(",")},`]]);
  return { ...result, extraFiles: extra, durableControl: DURABLE_CONTROL };
}
