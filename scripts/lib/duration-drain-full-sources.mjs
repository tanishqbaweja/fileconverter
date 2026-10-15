// Additive bounded seal; all588 actually executed parent preimages survive.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive as materializeParent } from "./mvf-arena-full-sources.mjs";
export { loadHistoricalFullSourceBase } from "./mvf-arena-full-sources.mjs";
export const DURATION_PREVIOUS_FULL = "evidence/2026-10-14T22-43-44-516Z-mvf-arena-original-full-terminal.json";
export const DURATION_FULL_LIMITS = Object.freeze({ parentFiles: 588, extensionFiles: 128,
  extensionRestoredBytes: 2097152, perFileBytes: 2097152, externalFiles: 16, runtimeArchiveBytes: 8388608 });
function safe(file) {
  assert.equal(typeof file, "string"); assert.ok(file.length > 0 && file.length <= 512);
  assert.ok(!/[\\:\0]/.test(file) && !file.startsWith("/") && file.split("/").every(x => x && x !== "." && x !== ".."));
  assert.match(file, /\.(?:mjs|js|ts|tsx|css|c|h|cs|ps1|json(?:\.gz)?|yml|yaml|md|wat|wasm|sh|patch)$/);
}
async function parentSources(root) {
  const bytes = await readFile(path.join(root, DURATION_PREVIOUS_FULL));
  assert.equal(sha(bytes), "019667c4dafe93ffab2d23af4151b9f088ca2d66bf742bd7247a428856ca0a02");
  const proof = JSON.parse(bytes); assert.equal(Object.keys(proof.sourcePins).length, 588);
  assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  const archive = await materializeParent(root, proof.sourceArchive); assert.deepEqual(archive.sourcePins, proof.sourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await readFile(path.join(root, file))), hash, file);
    assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), hash, file);
  }
  return { proof, archive, reference: { path: DURATION_PREVIOUS_FULL, sha256: sha(bytes), sourceArchive: proof.sourceArchive, sourceCount: 588 } };
}
export async function captureLayeredFullSourcePins(root, requestedFiles) {
  assert.ok(Array.isArray(requestedFiles)); const previous = await parentSources(root);
  const files = [...new Set([...Object.keys(previous.proof.sourcePins), ...requestedFiles])];
  for (let i = 0; i < files.length; i++) {
    safe(files[i]); if (!files[i].endsWith(".mjs")) continue;
    const text = await readFile(path.join(root, files[i]), "utf8");
    for (const match of text.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
      const file = path.relative(root, path.resolve(root, path.dirname(files[i]), match[1])).replaceAll("\\", "/");
      safe(file); if (!files.includes(file)) files.push(file);
    }
  }
  const extensionFiles = files.filter(file => !Object.hasOwn(previous.proof.sourcePins, file)).sort();
  assert.ok(extensionFiles.length <= 128);
  const contents = await Promise.all(extensionFiles.map(async file => ({ file, bytes: await readFile(path.join(root, file)) })));
  const eligible = contents.filter(row => /^(?:evidence|outputs\/reports)\//.test(row.file) && row.bytes.length >= 50000)
    .sort((a, b) => b.bytes.length - a.bytes.length || a.file.localeCompare(b.file));
  const external = new Set(eligible.slice(0, 16).map(row => row.file)), extensionPins = {}, extensionPreimages = {};
  for (const { file, bytes } of contents) {
    assert.ok(bytes.length <= 2097152); extensionPins[file] = sha(bytes);
    extensionPreimages[file] = external.has(file) ? { encoding: "qualified-external", path: file, bytes: bytes.length, sha256: sha(bytes) } :
      { encoding: "base64", data: bytes.toString("base64") };
  }
  const envelopeBytes = Buffer.byteLength(JSON.stringify({ extensionPins, extensionPreimages })); assert.ok(envelopeBytes <= 2097152);
  const pins = { ...previous.proof.sourcePins, ...extensionPins };
  return { files: Object.keys(pins), pins, parent: previous.reference, extensionFiles, extensionPins, extensionPreimages,
    base: previous.archive.base, limits: DURATION_FULL_LIMITS, historicalFilesRetained: 256, legacyFilesRetained: 588,
    additiveFiles: extensionFiles, supplementalRestoredBytes: envelopeBytes, omittedLegacyFiles: 0, externalCount: external.size };
}
export async function writeLayeredFullSourceArchive(root, stamp, snapshot, runtimeSources) {
  assert.match(stamp, /^\d{4}-\d\d-\d\dT[\d-]+Z$/);
  for (const name of ["generated", "traceHelper", "generatedCaller"]) assert.ok(typeof runtimeSources[name] === "string" && Buffer.byteLength(runtimeSources[name]) <= 1048576);
  assert.deepEqual(snapshot, await captureLayeredFullSourcePins(root, snapshot.files));
  const value = { ...runtimeSources, sourcePins: snapshot.pins, parent: snapshot.parent, extensionPins: snapshot.extensionPins,
    extensionPreimages: snapshot.extensionPreimages, limits: DURATION_FULL_LIMITS, allParent588PreimagesReferencedNotDropped: true };
  const raw = Buffer.from(JSON.stringify(value)); assert.ok(raw.length <= 8388608);
  const zip = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(zip), raw);
  const file = `outputs/reports/${stamp}-duration-drain-full-executed-sources.json.gz`;
  await writeFile(path.join(root, file), zip, { flag: "wx" }); assert.equal(sha(await readFile(path.join(root, file))), sha(zip));
  return { path: file, bytes: zip.length, sha256: sha(zip), restoredBytes: raw.length, restoredSha256: sha(raw),
    driverSha256: sha(value.generated), traceHelperSha256: sha(value.traceHelper), generatedCallerSha256: sha(value.generatedCaller),
    preimageCount: snapshot.files.length, parentPreimages: 588, extensionPreimages: snapshot.extensionFiles.length };
}
export async function materializeLayeredFullSourceArchive(root, record) {
  safe(record.path); const zip = await readFile(path.join(root, record.path)); assert.ok(zip.length <= 8388608);
  assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: 8388608 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
  const value = JSON.parse(raw), previous = await parentSources(root); assert.deepEqual(value.parent, previous.reference);
  assert.deepEqual(value.limits, DURATION_FULL_LIMITS); assert.equal(value.allParent588PreimagesReferencedNotDropped, true);
  assert.deepEqual(Object.keys(value.extensionPins).sort(), Object.keys(value.extensionPreimages).sort());
  assert.ok(Object.keys(value.extensionPins).length <= 128);
  assert.ok(Buffer.byteLength(JSON.stringify({ extensionPins: value.extensionPins, extensionPreimages: value.extensionPreimages })) <= 2097152);
  const recovered = { ...previous.archive.sourcePreimages }; let externalCount = 0;
  for (const [file, hash] of Object.entries(value.extensionPins)) {
    safe(file); assert.equal(Object.hasOwn(previous.proof.sourcePins, file), false); const row = value.extensionPreimages[file]; let bytes;
    if (row.encoding === "qualified-external") {
      externalCount++; assert.ok(externalCount <= 16); assert.equal(row.path, file); assert.equal(row.sha256, hash);
      bytes = await readFile(path.join(root, file)); assert.equal(bytes.length, row.bytes);
    } else { assert.equal(row.encoding, "base64"); bytes = Buffer.from(row.data, "base64"); assert.equal(bytes.toString("base64"), row.data); }
    assert.ok(bytes.length <= 2097152); assert.equal(sha(bytes), hash); assert.equal(sha(await readFile(path.join(root, file))), hash, file);
    recovered[file] = { encoding: "base64", data: bytes.toString("base64") };
  }
  assert.deepEqual(value.sourcePins, { ...previous.proof.sourcePins, ...value.extensionPins });
  assert.equal(record.parentPreimages, 588); assert.equal(record.extensionPreimages, Object.keys(value.extensionPins).length);
  assert.equal(Object.keys(recovered).length, record.preimageCount);
  for (const [name, hash] of [["generated", record.driverSha256], ["traceHelper", record.traceHelperSha256], ["generatedCaller", record.generatedCallerSha256]]) assert.equal(sha(value[name]), hash);
  return { ...value, sourcePreimages: recovered, allPreimagesRecovered: true, publicAcceptance: false };
}
