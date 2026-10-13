// Offline evidence only. Preserve the actual 380-source archive and its limits;
// new executed sources occupy a separate <=128-file/2MiB envelope.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { loadHistoricalFullSourceBase, materializeLayeredFullSourceArchive as materializeLegacyArchive } from "./input-read-layered-source-archive.mjs";
export { loadHistoricalFullSourceBase };
export const LEGACY_FULL_RECEIPT = "evidence/2026-10-12T19-50-01-210Z-input-read-original-full-terminal.json";
export const LARGEST_IDLE_MEDIA_RECEIPT = "evidence/2026-10-13T00-57-52-406Z-packet-largest-idle-media.json";
export const SUPPLEMENTAL_LIMITS = Object.freeze({ legacyFiles: 380, supplementalFiles: 128,
  perFileBytes: 2097152, supplementalRestoredBytes: 2097152, runtimeArchiveBytes: 8388608 });
const external = Object.freeze({
  [LEGACY_FULL_RECEIPT]: { sha256: "21bd3e8e562cbaf57e53ca9dba8dfef741e141013ed9c38f989619adf52e9840" },
  [LARGEST_IDLE_MEDIA_RECEIPT]: { bytes: 68787, sha256: "a3cff63fbda9bbc41c80de30dd25ff206bbcc042e389c4d74546aa71e357c1eb" },
  "outputs/reports/2026-10-12T19-50-01-210Z-allocation-attempt-full-executed-sources.json.gz":
    { bytes: 651888, sha256: "11021b47a7f59650448512d7d843325737d19c1d82fbc15826c59a060d4d1cc4" },
  "outputs/reports/2026-10-13T00-57-52-406Z-packet-largest-idle-media-executed-sources.json.gz":
    { bytes: 622565, sha256: "be4bb490bd508381b6dcfccb0ab9935ab69281538f0a22986ba317ea40666981" },
  "outputs/reports/2026-10-13T00-57-52-406Z-packet-largest-idle-media-golden-report.json.gz":
    { bytes: 82244, sha256: "a1e9e6912a7fb2b8ea82e65113cf5f7976565e5e28223ffb68cf4b2253ff1e33" },
});
function safe(file) {
  assert.equal(typeof file, "string"); assert.ok(file.length > 0 && file.length <= 512);
  assert.ok(!/[\\:\0]/.test(file) && !file.startsWith("/") && file.split("/").every(p => p && p !== "." && p !== ".."));
  assert.match(file, /\.(?:mjs|js|ts|tsx|css|c|h|cs|ps1|json(?:\.gz)?|yml|yaml|md|wat|wasm|sh|patch)$/);
}
export async function loadLegacyFullSources(root) {
  const bytes = await readFile(path.join(root, LEGACY_FULL_RECEIPT)); assert.equal(sha(bytes), external[LEGACY_FULL_RECEIPT].sha256);
  const proof = JSON.parse(bytes); assert.equal(Object.keys(proof.sourcePins).length, 380);
  assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  const archive = await materializeLegacyArchive(root, proof.sourceArchive);
  assert.deepEqual(archive.sourcePins, proof.sourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await readFile(path.join(root, file))), hash, file);
    assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), hash, file);
  }
  return { proof, archive, reference: { receipt: { path: LEGACY_FULL_RECEIPT, sha256: sha(bytes) },
    archive: proof.sourceArchive, sourceCount: 380, allPreimagesRecovered: true } };
}
export async function captureLayeredFullSourcePins(root, files) {
  assert.ok(Array.isArray(files)); const legacy = await loadLegacyFullSources(root);
  const supplementalFiles = [...new Set(files.filter(file => !Object.hasOwn(legacy.proof.sourcePins, file)))].sort();
  assert.ok(supplementalFiles.length <= 128); const supplementalPins = {}, supplementalPreimages = {};
  for (const file of supplementalFiles) {
    safe(file); const bytes = await readFile(path.join(root, file)); assert.ok(bytes.length <= 2097152);
    supplementalPins[file] = sha(bytes);
    if (external[file]) {
      assert.equal(sha(bytes), external[file].sha256); if (external[file].bytes !== undefined) assert.equal(bytes.length, external[file].bytes);
      supplementalPreimages[file] = { encoding: "qualified-external", path: file, bytes: bytes.length, sha256: sha(bytes) };
    } else supplementalPreimages[file] = { encoding: "base64", data: bytes.toString("base64") };
  }
  const addition = Buffer.from(JSON.stringify({ supplementalPins, supplementalPreimages }));
  assert.ok(addition.length <= 2097152, `Supplemental offline source envelope ${addition.length} exceeds 2MiB`);
  const pins = { ...legacy.proof.sourcePins, ...supplementalPins };
  return { files: Object.keys(pins), pins, supplementalFiles, supplementalPins, supplementalPreimages,
    legacy: legacy.reference, base: legacy.archive.base, limits: SUPPLEMENTAL_LIMITS,
    historicalFilesRetained: 256, legacyFilesRetained: 380, additiveFiles: supplementalFiles,
    supplementalRestoredBytes: addition.length, omittedLegacyFiles: 0 };
}
export async function writeLayeredFullSourceArchive(root, stamp, snapshot, runtimeSources) {
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/);
  for (const name of ["generated", "traceHelper", "generatedCaller"]) {
    assert.equal(typeof runtimeSources[name], "string"); assert.ok(Buffer.byteLength(runtimeSources[name]) <= 1048576);
  }
  assert.deepEqual(snapshot, await captureLayeredFullSourcePins(root, snapshot.files));
  const value = { ...runtimeSources, sourcePins: snapshot.pins, legacy: snapshot.legacy,
    supplementalPins: snapshot.supplementalPins, supplementalPreimages: snapshot.supplementalPreimages,
    limits: SUPPLEMENTAL_LIMITS, legacySourcePreimagesReferencedNotDropped: true };
  const raw = Buffer.from(JSON.stringify(value)); assert.ok(raw.length <= 8388608);
  const zipped = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(zipped), raw);
  const file = `outputs/reports/${stamp}-packet-largest-idle-full-executed-sources.json.gz`;
  await writeFile(path.join(root, file), zipped, { flag: "wx" }); assert.equal(sha(await readFile(path.join(root, file))), sha(zipped));
  return { path: file, bytes: zipped.length, sha256: sha(zipped), restoredBytes: raw.length, restoredSha256: sha(raw),
    driverSha256: sha(value.generated), traceHelperSha256: sha(value.traceHelper), generatedCallerSha256: sha(value.generatedCaller),
    preimageCount: snapshot.files.length, legacyPreimages: 380, supplementalPreimages: snapshot.supplementalFiles.length };
}
export async function materializeLayeredFullSourceArchive(root, record) {
  const compressed = await readFile(path.join(root, record.path)); assert.ok(compressed.length <= 8388608);
  assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const raw = gunzipSync(compressed, { maxOutputLength: 8388608 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
  const value = JSON.parse(raw), legacy = await loadLegacyFullSources(root);
  assert.deepEqual(value.legacy, legacy.reference); assert.deepEqual(value.limits, SUPPLEMENTAL_LIMITS);
  assert.equal(value.legacySourcePreimagesReferencedNotDropped, true);
  const files = Object.keys(value.supplementalPins); assert.ok(files.length <= 128);
  assert.deepEqual(files.sort(), Object.keys(value.supplementalPreimages).sort());
  assert.ok(Buffer.byteLength(JSON.stringify({ supplementalPins: value.supplementalPins, supplementalPreimages: value.supplementalPreimages })) <= 2097152);
  const recovered = { ...legacy.archive.sourcePreimages };
  for (const file of files) {
    safe(file); assert.equal(Object.hasOwn(legacy.proof.sourcePins, file), false);
    const row = value.supplementalPreimages[file]; let bytes;
    if (row.encoding === "qualified-external") {
      assert.equal(row.path, file); assert.ok(external[file]); assert.equal(row.sha256, external[file].sha256);
      bytes = await readFile(path.join(root, file)); assert.equal(bytes.length, row.bytes);
      if (external[file].bytes !== undefined) assert.equal(bytes.length, external[file].bytes);
    } else {
      assert.equal(row.encoding, "base64"); assert.equal(typeof row.data, "string"); assert.ok(row.data.length <= Math.ceil(2097152 / 3) * 4);
      bytes = Buffer.from(row.data, "base64"); assert.equal(bytes.toString("base64"), row.data);
    }
    assert.ok(bytes.length <= 2097152); assert.equal(sha(bytes), value.supplementalPins[file], file);
    assert.equal(sha(await readFile(path.join(root, file))), value.supplementalPins[file], file);
    recovered[file] = { encoding: "base64", data: bytes.toString("base64") };
  }
  assert.deepEqual(value.sourcePins, { ...legacy.proof.sourcePins, ...value.supplementalPins });
  assert.equal(record.preimageCount, Object.keys(value.sourcePins).length); assert.equal(record.legacyPreimages, 380); assert.equal(record.supplementalPreimages, files.length);
  for (const [name, hash] of [["generated", record.driverSha256], ["traceHelper", record.traceHelperSha256], ["generatedCaller", record.generatedCallerSha256]]) assert.equal(sha(value[name]), hash);
  return { ...value, sourcePreimages: recovered, allPreimagesRecovered: true, legacyBytesRewritten: false, publicAcceptance: false };
}
