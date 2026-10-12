// Fresh evidence-only deduplication: retain every source/pin under unchanged caps.
// Six existing report archives and two exact existing receipts remain
// byte-exact externally referenced rather than duplicated inside another archive;
// materialization rechecks their hard-pinned bytes and recovers every preimage.
// Historical256 remains BYTE-EXACT; add at most128 sources in a separate layer.
// These limits govern offline evidence, NEVER conversion/memory acceptance.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const FULL_SOURCE_LAYER_LIMITS = Object.freeze({ historicalFiles: 256, additiveFiles: 128, combinedFiles: 384,
  perFileBytes: 2097152, additiveRestoredBytes: 2097152, additiveCompressedBytes: 2097152, runtimeArchiveBytes: 8388608 });
export const HISTORICAL_FULL_SOURCE_RECEIPT = "evidence/2026-10-11T08-24-12-696Z-encoder-plane-bitrate-original-full-terminal.json";
function safeFile(file) {
  assert.equal(typeof file, "string"); assert.ok(file.length > 0 && file.length <= 512);
  assert.ok(!/[\\:\0]/.test(file) && !file.startsWith("/") && file.split("/").every(part => part && part !== "." && part !== ".."));
  assert.match(file, /\.(?:mjs|js|ts|tsx|css|c|h|cs|ps1|json(?:\.gz)?|yml|yaml|md|wat|wasm|sh|patch)$/);
}
const QUALIFIED_EXTERNAL_ARCHIVES = Object.freeze({
  "evidence/2026-10-12T19-28-30-102Z-input-read-media.json":
    { bytes: 57090, sha256: "c5df28ee7e46f8519445b97c63d578939c18ebbc5f98ab86b074098bd1b49c4d" },
  "evidence/2026-10-12T14-43-54-627Z-asyncify-storage-original-full-terminal.json":
    { bytes: 325480, sha256: "2d6c3be87adffaaadee563916e0bbcc69146a350a9d39dc9a3022592895b6752" },
  "outputs/reports/2026-10-12T19-28-30-102Z-input-read-media-executed-sources.json.gz":
    { bytes: 530257, sha256: "d421fa635f7048359f90254064c7dadf87f236af89e9f89efe52655aa4f1fc26" },
  "outputs/reports/2026-10-12T19-28-30-102Z-input-read-media-golden-report.json.gz":
    { bytes: 81325, sha256: "97201b704236509a093e27c1910468ffeb37377a2079e87b1092aea6d74f151b" },
  "outputs/reports/2026-10-12T14-25-42-022Z-asyncify-storage-media-executed-sources.json.gz":
    { bytes: 523338, sha256: "300c6734f8f92eb31f2cd356f21b7b2e85e62c0cbb558c6f0eb64c894ec90359" },
  "outputs/reports/2026-10-12T14-25-42-022Z-asyncify-storage-media-golden-report.json.gz":
    { bytes: 66179, sha256: "a3b71b6779ebfe14e9ef9a51445fcf4b8885b98c87d15201f4c162085f8f85c4" },
  "outputs/reports/2026-10-12T05-33-59-279Z-packet-cache-media-executed-sources.json.gz":
    { bytes: 493484, sha256: "98db05bca5912159e74d2dfd59b5f9856c4ac8e29048263dd8d399fc44199f34" },
  "outputs/reports/2026-10-12T05-33-59-279Z-packet-cache-media-golden-report.json.gz":
    { bytes: 65374, sha256: "723ad65cda8388508777d330a9edd02ebcf65ad3cf28108af37fb38efcae0fb9" },
});
async function decodePreimage(root, file, value) {
  if (value.encoding === "qualified-external-gzip" || value.encoding === "qualified-external-json") {
    safeFile(file); assert.equal(value.path, file);
    const expected = QUALIFIED_EXTERNAL_ARCHIVES[file]; assert.ok(expected, "Only eight hard-pinned existing archives/receipts may be referenced");
    assert.equal(value.encoding, file.endsWith(".json.gz") ? "qualified-external-gzip" : "qualified-external-json");
    assert.equal(value.bytes, expected.bytes); assert.equal(value.sha256, expected.sha256);
    const bytes = await readFile(path.join(root, file));
    assert.ok(bytes.length <= FULL_SOURCE_LAYER_LIMITS.perFileBytes);
    assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256);
    return bytes;
  }
  assert.equal(value.encoding, "base64"); assert.equal(typeof value.data, "string");
  assert.ok(value.data.length <= Math.ceil(FULL_SOURCE_LAYER_LIMITS.perFileBytes / 3) * 4);
  const bytes = Buffer.from(value.data, "base64"); assert.equal(bytes.toString("base64"), value.data);
  assert.ok(bytes.length <= FULL_SOURCE_LAYER_LIMITS.perFileBytes); return bytes;
}
export async function loadHistoricalFullSourceBase(root) {
  const receiptBytes = await readFile(path.join(root, HISTORICAL_FULL_SOURCE_RECEIPT)), receipt = JSON.parse(receiptBytes), record = receipt.sourceArchive;
  assert.equal(record.sha256, "5f7a38ea4d225151da828e9aab72351ac5faa0dd11ee0ddeb566945fef3c2dd1");
  assert.equal(record.restoredSha256, "d9dfccb8e628a65d35e37b3267f54f257b6227eb953d085313a6d1a2c2e8091b");
  const zipped = await readFile(path.join(root, record.path)); assert.equal(zipped.length, 1228433); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 8388608 }); assert.equal(bytes.length, 5303653); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  const archive = JSON.parse(bytes), pins = receipt.sourcePins;
  assert.equal(Object.keys(pins).length, 256); assert.deepEqual(pins, receipt.postSourcePins);
  assert.deepEqual(Object.keys(archive.sourcePreimages).sort(), Object.keys(pins).sort());
  assert.equal(sha(archive.generated), record.driverSha256); assert.equal(sha(archive.traceHelper), record.traceHelperSha256);
  for (const [file, hash] of Object.entries(pins)) {
    safeFile(file); assert.equal(sha(await decodePreimage(root, file, archive.sourcePreimages[file])), hash, file);
    assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  }
  return { pins, archive, reference: { receipt: { path: HISTORICAL_FULL_SOURCE_RECEIPT, sha256: sha(receiptBytes) }, archive: record,
    sourceCount: 256, generatedCallerSha256: sha(archive.generatedCaller), retainedByteExact: true } };
}
export function partitionFullSourceLayers(basePins, requestedFiles) {
  assert.equal(Object.keys(basePins).length, 256); assert.ok(Array.isArray(requestedFiles) && requestedFiles.length <= 384);
  for (const file of [...Object.keys(basePins), ...requestedFiles]) safeFile(file);
  const additiveFiles = [...new Set(requestedFiles.filter(file => !Object.hasOwn(basePins, file)))].sort();
  assert.ok(additiveFiles.length <= 128); const files = [...Object.keys(basePins), ...additiveFiles]; assert.ok(files.length <= 384);
  return { files, additiveFiles, historicalFilesRetained: 256, omittedHistoricalFiles: 0 };
}
export async function captureLayeredFullSourcePins(root, requestedFiles) {
  const base = await loadHistoricalFullSourceBase(root), partition = partitionFullSourceLayers(base.pins, requestedFiles);
  const pins = { ...base.pins }, additivePins = {}, additiveSourcePreimages = {};
  for (const file of partition.additiveFiles) {
    const bytes = await readFile(path.join(root, file)); assert.ok(bytes.length <= 2097152); pins[file] = additivePins[file] = sha(bytes);
    if (Object.hasOwn(QUALIFIED_EXTERNAL_ARCHIVES, file)) {
      const expected = QUALIFIED_EXTERNAL_ARCHIVES[file];
      assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256);
      additiveSourcePreimages[file] = { encoding: file.endsWith(".json.gz") ? "qualified-external-gzip" : "qualified-external-json", path: file, ...expected };
    } else additiveSourcePreimages[file] = { encoding: "base64", data: bytes.toString("base64") };
  }
  const addition = Buffer.from(JSON.stringify({ additivePins, additiveSourcePreimages })); assert.ok(addition.length <= 2097152, `Additive source encoding ${addition.length} exceeds unchanged2MiB cap`);
  const zipped = gzipSync(addition, { level: 9 }); assert.ok(zipped.length <= 2097152); assert.deepEqual(gunzipSync(zipped), addition);
  return { ...partition, pins, additivePins, additiveSourcePreimages, base: base.reference,
    additiveRestoredBytes: addition.length, additiveCompressedBytes: zipped.length, limits: FULL_SOURCE_LAYER_LIMITS };
}
export async function writeLayeredFullSourceArchive(root, stamp, snapshot, runtimeSources) {
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/);
  assert.equal(typeof runtimeSources.generated, "string"); assert.equal(typeof runtimeSources.traceHelper, "string"); assert.equal(typeof runtimeSources.generatedCaller, "string");
  for (const source of [runtimeSources.generated, runtimeSources.traceHelper, runtimeSources.generatedCaller]) assert.ok(Buffer.byteLength(source) <= 1048576);
  assert.deepEqual(snapshot.limits, FULL_SOURCE_LAYER_LIMITS);
  assert.deepEqual(snapshot, await captureLayeredFullSourcePins(root, snapshot.files), "All source layers must still match before retention");
  const archive = { ...runtimeSources, sourcePins: snapshot.pins, base: snapshot.base, additivePins: snapshot.additivePins,
    additiveSourcePreimages: snapshot.additiveSourcePreimages, limits: FULL_SOURCE_LAYER_LIMITS, historicalSourcePreimagesReferencedNotDropped: true };
  const bytes = Buffer.from(JSON.stringify(archive)), zipped = gzipSync(bytes, { level: 9 });
  assert.ok(bytes.length <= 8388608 && zipped.length <= 8388608); assert.deepEqual(gunzipSync(zipped), bytes);
  const file = `outputs/reports/${stamp}-allocation-attempt-full-executed-sources.json.gz`;
  await writeFile(path.join(root, file), zipped, { flag: "wx" }); assert.equal(sha(await readFile(path.join(root, file))), sha(zipped));
  return { path: file, bytes: zipped.length, sha256: sha(zipped), restoredBytes: bytes.length, restoredSha256: sha(bytes),
    driverSha256: sha(runtimeSources.generated), traceHelperSha256: sha(runtimeSources.traceHelper), generatedCallerSha256: sha(runtimeSources.generatedCaller),
    preimageCount: snapshot.files.length, historicalPreimages: 256, additivePreimages: snapshot.additiveFiles.length };
}
export async function materializeLayeredFullSourceArchive(root, record) {
  const zipped = await readFile(path.join(root, record.path)); assert.ok(zipped.length <= 8388608); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 8388608 }); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  const value = JSON.parse(bytes), base = await loadHistoricalFullSourceBase(root); assert.deepEqual(value.base, base.reference); assert.deepEqual(value.limits, FULL_SOURCE_LAYER_LIMITS);
  assert.equal(value.historicalSourcePreimagesReferencedNotDropped, true);
  assert.deepEqual(Object.keys(value.additivePins).sort(), Object.keys(value.additiveSourcePreimages).sort());
  assert.ok(!Object.keys(value.additivePins).some(file => Object.hasOwn(base.pins, file)), "Historical pins cannot be overridden by additions");
  const partition = partitionFullSourceLayers(base.pins, Object.keys(value.sourcePins));
  assert.deepEqual(Object.keys(value.additivePins).sort(), partition.additiveFiles);
  const pins = { ...base.pins, ...value.additivePins }; assert.deepEqual(value.sourcePins, pins);
  const addition = Buffer.from(JSON.stringify({ additivePins: value.additivePins, additiveSourcePreimages: value.additiveSourcePreimages }));
  assert.ok(addition.length <= 2097152 && gzipSync(addition).length <= 2097152);
  const recoveredAdditivePreimages = {};
  for (const [file, hash] of Object.entries(value.additivePins)) {
    safeFile(file); const preimage = await decodePreimage(root, file, value.additiveSourcePreimages[file]);
    assert.equal(sha(preimage), hash, file); assert.equal(sha(await readFile(path.join(root, file))), hash, file);
    recoveredAdditivePreimages[file] = { encoding: "base64", data: preimage.toString("base64") };
  }
  assert.equal(sha(value.generated), record.driverSha256); assert.equal(sha(value.traceHelper), record.traceHelperSha256); assert.equal(sha(value.generatedCaller), record.generatedCallerSha256);
  assert.equal(Object.keys(pins).length, record.preimageCount); assert.equal(record.historicalPreimages, 256); assert.equal(record.additivePreimages, partition.additiveFiles.length);
  return { ...value, sourcePreimages: { ...base.archive.sourcePreimages, ...recoveredAdditivePreimages },
    sourcePins: pins, historicalBytesRewritten: false, allPreimagesRecovered: true, publicAcceptance: false };
}
export { decodePreimage as verifyPacketCacheLayeredPreimage };
