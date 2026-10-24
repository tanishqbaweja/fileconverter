// Qualification-only source-bound decoder selection. Never substitutes encoder.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const encoderRows = [
  ["encoder.mjs", "mpeg2-encoder-planes-38044000567", "split-encoder.mjs", "00c0d1b4435e9294c6784e9ccaf196f171caa3c9cc3d4c7a4aab1a47c6d8bb5e"],
  ["encoder.wasm", "mpeg2-encoder-planes-38044000567", "split-encoder.wasm", "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee", 256],
];
export function mpeg2RuntimeNativeRows(runId = null, proof = null) {
  if (runId === null) return [
    ["decoder.mjs", "mpeg2-jspi-39072949964", "within-mpeg2-split.mjs", "d4ec481a93a1b087c96aa11948ab9a98ccf6d09237ed143c022bf76bf6c31506"],
    ["decoder.wasm", "mpeg2-jspi-39072949964", "within-mpeg2-split.wasm", "4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57", 512],
    ...encoderRows.map(row => [...row]),
  ];
  assert.match(runId, /^[0-9]{8,}$/);
  assert.equal(proof?.status, "actual-scaled-properties-build-unit-verified-not-browser-acceptance");
  assert.equal(String(proof.run?.databaseId), runId); assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.hostedCleanupStepPassed, true); assert.equal(proof.downloadRuntimeRemoved, true); assert.equal(proof.publicAcceptance, false);
  const manifest = proof.manifest, lifecycle = manifest?.scaledProperties;
  assert.equal(manifest?.scope, "private-scaled-properties-jspi-not-browser-acceptance");
  const actual = lifecycle?.actualWasm32;
  assert.equal(actual?.status, "passed-native-scaled-property-lifecycle");
  assert.equal(actual.oldSideData, 17); assert.equal(actual.errorSymbol, "EFBIG");
  assert.ok(Number.isInteger(actual.expectedWireResult) && actual.expectedWireResult < 0);
  assert.equal(actual.oldWireResult, actual.expectedWireResult);
  assert.equal(actual.correctedCopies, 1000); assert.equal(actual.maximumCorrectedSideData, 1); assert.equal(actual.mediaConversions, 0);
  for (const field of ["pixelStorageAndBytesUnchanged", "sourcePropertiesPreserved", "staleDictionaryRemoved", "bFramePolicyUnchanged"]) assert.equal(actual[field], true);
  assert.equal(lifecycle.sideDataLimit, 16); assert.equal(lifecycle.propertyWireCapacityBytes, 65536);
  for (const field of ["pixelStorageChanged", "bFramePolicyChanged", "codecSettingsChanged", "heapLimitsChanged", "productionIoChanged", "publicAcceptance"]) assert.equal(lifecycle[field], false);
  assert.equal(sha(lifecycle.exactSource), lifecycle.sha256); assert.deepEqual(JSON.parse(lifecycle.exactSource), actual);
  const decoderRows = ["within-mpeg2-split.mjs", "within-mpeg2-split.wasm"].map((file, index) => {
    const hash = manifest.artifacts?.[file]; assert.match(hash ?? "", /^[a-f0-9]{64}$/);
    assert.equal(proof.files?.filter(row => row.file === file).length, 1);
    assert.equal(proof.files.find(row => row.file === file).sha256, hash);
    return [index ? "decoder.wasm" : "decoder.mjs", `mpeg2-scaled-properties-${runId}`, file, hash, ...(index ? [512] : [])];
  });
  assert.notEqual(decoderRows[1][3], "4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57");
  return [...decoderRows, ...encoderRows.map(row => [...row])];
}
export async function loadMpeg2RuntimeNative(root, runId = null) {
  if (runId === null) return { rows: mpeg2RuntimeNativeRows(), proof: null };
  assert.match(runId, /^[0-9]{8,}$/);
  const relative = `evidence/mpeg2-scaled-properties-build-${runId}.json`, bytes = await readFile(path.join(root, relative));
  assert.ok(bytes.length <= 8 * 1024 ** 2);
  const proof = JSON.parse(bytes), rows = mpeg2RuntimeNativeRows(runId, proof);
  const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-scaled-properties-build-branch-2026-10-24.json")));
  assert.equal(proof.run.headSha, branch.commit);
  const entries = Object.entries(proof.manifest.sources); assert.ok(entries.length > 0 && entries.length <= 256);
  for (const [file, hash] of entries) {
    assert.ok(/^(?:media\/ffmpeg\/|scripts\/|tests\/|\.github\/workflows\/)/.test(file) && !file.includes("..") && !file.includes("\\"));
    assert.equal(file === branch.workflow.path ? branch.workflow.generatedSha256 : sha(await readFile(path.join(root, file))), hash, file);
  }
  assert.equal(proof.manifest.sources["media/ffmpeg/mpeg2-scaled-frame-properties.h"], proof.manifest.scaledProperties.helperSha256);
  return { rows, proof: { path: relative, sha256: sha(bytes), runId, executedHead: proof.run.headSha,
    allBuildSourcesRechecked: true, buildSourceCount: entries.length, encoderUnchanged: true, publicAcceptance: false } };
}
