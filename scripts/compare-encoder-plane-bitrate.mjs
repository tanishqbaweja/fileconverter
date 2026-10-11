// Independent compact evidence join; never starts a browser or conversion.
import assert from "node:assert/strict";
import { access, lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectBitrateDiagnostic, compareBitrateDiagnostics } from "./lib/encoder-plane-bitrate-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const timestamp = "\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z";

async function restored(record, suffix) {
  assert.match(record.path, new RegExp(`^outputs/reports/${timestamp}-encoder-plane-bitrate-(2000000|4000000)-${suffix}\\.gz$`));
  assert.ok(record.bytes > 0 && record.bytes <= 8388608 && record.restoredBytes <= 8388608);
  const compressed = await read(record.path); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const bytes = gunzipSync(compressed, { maxOutputLength: 8388608 });
  assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return { value: JSON.parse(bytes), bytes };
}

export async function validateBitrateReceipt(proofPath, bitRate) {
  assert.match(proofPath, new RegExp(`^evidence/${timestamp}-encoder-plane-bitrate-${bitRate}-diagnostic\\.json$`));
  const bytes = await read(proofPath), proof = JSON.parse(bytes);
  assert.equal(proof.status, "one-headless-full-geometry-quality-diagnostic-only-not-acceptance");
  assert.equal(proof.failure, null); assert.equal(proof.analysis.bitRate, bitRate);
  for (const field of ["publicAcceptance", "completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "conversionSpeedAcceptance"])
    assert.equal(proof[field], false);
  assert.equal(proof.browserMode, "headless"); assert.equal(proof.subprocessWindowsHidden, true);
  assert.equal(proof.nativeToolsOnlyFixturesAndIndependentValidation, true); assert.equal(proof.noDocker, true);
  assert.equal(proof.hostPreflight.safeToStart, true); assert.equal(proof.launchHostPreflight.safeToStart, true);
  assert.ok(proof.diskPreflightBytes >= 2147483648);
  assert.deepEqual(proof.protectedPre, proof.protectedPost);
  assert.deepEqual(proof.protectedPre, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  const source = await restored(proof.generatedArchive, "executed-sources\\.json");
  assert.deepEqual(source.value.sourcePins, proof.sourcePins);
  for (const [file, expected] of Object.entries(proof.sourcePins)) {
    assert.ok(!path.isAbsolute(file) && !file.split(/[\\/]/).includes(".."));
    assert.equal(sha(await read(file)), expected, file); assert.equal(sha(source.value.sources[file]), expected, file);
  }
  assert.equal(source.value.generated.experimentBitRate, bitRate);
  assert.ok(source.value.generated.spec.includes("expect(ordinalSsim).toBeGreaterThanOrEqual(0.98);"));
  assert.ok(source.value.generated.stage.includes(`mapped[9] = ${bitRate};`));
  assert.equal(proof.cleanup.normalAppAndCssUnchanged, true); assert.equal(proof.cleanup.privateAdditionsAbsent, true);
  assert.equal(proof.cleanup.ownedWrapperAbsent, true); assert.deepEqual(proof.cleanup.newFixtureDirsRemaining, []);
  for (const directory of [proof.cleanup.ownedWrapper, proof.cleanup.helpers.runtime]) {
    assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" });
  }
  const helpers = proof.cleanup.helpers;
  assert.match(helpers.path, new RegExp(`^outputs/reports/${timestamp}-single-idle-golden-launch-identities\\.json$`));
  const helperBytes = await read(helpers.path); assert.equal(sha(helperBytes), helpers.sha256);
  const helperValue = JSON.parse(helperBytes);
  assert.deepEqual(helperValue.launchRecords, helpers.launchRecords); assert.equal(helperValue.runtimeAbsent, true);
  assert.equal(helpers.launchRecords.length, 2);
  for (const record of helpers.launchRecords) assert.equal(record.absence.status, "owned-identity-absent");
  const report = await restored(proof.report.archive, "golden-report\\.json");
  assert.equal(report.bytes.length, proof.report.bytes); assert.equal(sha(report.bytes), proof.report.sha256);
  const buildBytes = await read(proof.build.path); assert.equal(sha(buildBytes), proof.build.sha256);
  const analysis = inspectBitrateDiagnostic(report.value, null, JSON.parse(buildBytes), bitRate);
  assert.deepEqual(analysis, proof.analysis);
  return { proofPath, proofSha256: sha(bytes), proof, reportBytes: report.bytes, measuredSourceCount: Object.keys(proof.sourcePins).length, analysis };
}

async function removeVerifiedRaw(row) {
  const file = row.proof.report.path;
  assert.match(file, /^output\/playwright\/\d{4}-\d{2}-\d{2}T[\d:.-]+Z-mpeg2-encoder-planes-38044000567-direct-artwork\.json$/);
  const absolute = path.join(root, file), info = await lstat(absolute);
  assert.ok(info.isFile() && !info.isSymbolicLink()); assert.equal(await realpath(absolute), absolute);
  const raw = await read(file); assert.deepEqual(raw, row.reportBytes);
  const final = await lstat(absolute);
  for (const key of ["dev", "ino", "size", "mtimeMs", "ctimeMs"]) assert.equal(final[key], info[key]);
  await rm(absolute); await assert.rejects(access(absolute), { code: "ENOENT" });
  return { path: file, bytes: raw.length, sha256: sha(raw), removedAfterLosslessArchiveVerification: true,
    recoverableFrom: row.proof.report.archive.path };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  assert.equal(process.argv.length, 4);
  const control = await validateBitrateReceipt(process.argv[2], 2000000);
  const candidate = await validateBitrateReceipt(process.argv[3], 4000000);
  const comparison = compareBitrateDiagnostics(control.analysis, candidate.analysis);
  // Stop before any deletion if the controlled-input or native-settings join fails.
  const rawCleanup = [];
  for (const row of [control, candidate]) rawCleanup.push(await removeVerifiedRaw(row));
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const output = `evidence/${stamp}-encoder-plane-bitrate-comparison.json`;
  const result = { recordedAt: new Date().toISOString(), status: "short-identical-input-bitrate-control-only-not-full-acceptance",
    proofs: [control, candidate].map(row => ({ path: row.proofPath, sha256: row.proofSha256, measuredSourceCount: row.measuredSourceCount })),
    comparison, rawCleanup, fullOriginalAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false };
  await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ proofPath: output, ...comparison, redundantRawReportsRemoved: rawCleanup.length }));
}
