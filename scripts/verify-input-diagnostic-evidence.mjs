// Independent bounded joins and cleanup; no conversion rerun or support promotion.
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { access, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectInputReadMediaReport } from "./lib/input-read-media-recipe.mjs";
import { inspectInputScanReport } from "./lib/input-scan-browser-recipe.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receiptPaths = ["evidence/2026-10-12T19-23-39-190Z-input-read-media.json", "evidence/2026-10-12T19-28-30-102Z-input-read-media.json",
  "evidence/2026-10-12T19-32-06-013Z-input-only-original-scan.json", "evidence/2026-10-12T19-34-03-916Z-input-only-original-scan.json"];
const expectedHash = "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34";
const proofPath = "evidence/2026-10-13-input-read-diagnostics-verified.json";
await assert.rejects(access(path.join(root, proofPath)), { code: "ENOENT" });
async function restore(record) {
  assert.equal(path.dirname(path.resolve(root, record.path)), path.join(root, "outputs/reports"));
  const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 8388608 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
  return raw;
}
const results = [], redundant = [];
for (const [index, file] of receiptPaths.entries()) {
  const bytes = await read(file), receipt = JSON.parse(bytes), sourceArchive = JSON.parse(await restore(receipt.generatedArchive));
  assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.deepEqual(sourceArchive.sourcePins, receipt.sourcePins);
  const differences = [];
  for (const [source, hash] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(sourceArchive.sources[source]), hash, source);
    const current = sha(await read(source)); if (current !== hash) differences.push({ path: source, executedSha256: hash, currentSha256: current });
  }
  const passed = index === 1 || index === 3;
  if (passed) { assert.equal(receipt.failure, null); assert.deepEqual(differences, []); }
  else { assert.equal(receipt.status, "failed-or-incomplete"); assert.ok(receipt.failure); }
  const raw = await restore(receipt.report.archive); assert.equal(raw.length, receipt.report.bytes); assert.equal(sha(raw), receipt.report.sha256);
  const report = JSON.parse(raw);
  if (index === 1) {
    const baseline = JSON.parse(await read(receipt.baseline.path)).reports[0].report;
    const analysis = inspectInputReadMediaReport(report, baseline, JSON.parse(await read(receipt.build.path)));
    assert.deepEqual(analysis, receipt.analysis); assert.equal(analysis.genuineValidatedConversions, 4);
    assert.equal(analysis.validatedInputFailureRecovery.ordinalSsim, 0.983095);
    assert.equal(analysis.validatedInputFailureRecovery.outputBytes, 2245558);
    assert.ok(raw.toString().includes("554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27"));
  }
  if (index === 3) assert.deepEqual(inspectInputScanReport(report), receipt.analysis);
  assert.deepEqual(receipt.protectedPre, receipt.protectedPost);
  assert.equal(receipt.protectedPost.bytes, 2958573265); assert.equal(receipt.protectedPost.sha256, expectedHash);
  assert.equal(receipt.cleanup.ownedWrapperAbsent, true); assert.equal(receipt.cleanup.privateAdditionsAbsent, true);
  assert.equal(receipt.cleanup.normalAppAndCssUnchanged, true); assert.deepEqual(receipt.cleanup.newFixtureDirsRemaining, []);
  await assert.rejects(access(receipt.cleanup.ownedWrapper), { code: "ENOENT" });
  const nativeAbsenceChecks = [];
  if (passed) {
    const helpers = receipt.cleanup.helpers; assert.equal(sha(await read(helpers.path)), helpers.sha256);
    assert.equal(helpers.runtimeAbsent, true); await assert.rejects(access(helpers.runtime), { code: "ENOENT" });
    for (const record of helpers.launchRecords) {
      assert.equal(record.absence.status, "owned-identity-absent");
      const absence = await observeOwnedProcessExit(record.identity); assert.equal(absence.status, "owned-identity-absent");
      nativeAbsenceChecks.push({ role: record.role, ...absence });
    }
  }
  const target = path.resolve(root, receipt.report.path);
  assert.equal(path.dirname(target), path.join(root, "output/playwright"));
  assert.match(path.basename(target), /^2026-10-12T19-[0-9:.TZ-]+-packet-cache-media-[A-Za-z0-9]+-direct-artwork\.json$/);
  assert.deepEqual(await readFile(target), raw); redundant.push({ target, bytes: raw.length, archive: receipt.report.archive });
  results.push({ receipt: { path: file, sha256: sha(bytes) }, status: receipt.status, passed,
    sourceCount: Object.keys(receipt.sourcePins).length, archivedExecutedSourcesVerified: true,
    currentSourceDifferences: differences, sourceArchive: receipt.generatedArchive, rawReportArchive: receipt.report.archive,
    actualReadDiagnostics: report.rows.filter(row => row.kind === "input-read-diagnostics").flatMap(row => row.samples),
    actualScans: report.rows.filter(row => row.kind === "whole-original-production-input-scan").map(row => row.result),
    nativeAbsenceChecks, protectedWholePrePostHashVerified: true, stockAssetsRestored: true, ownedScratchAbsent: true,
    browserMode: "headless", originalLongLivedCauseProven: false, fullConversionAcceptance: false });
}
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"])
  assert.equal(sha(await read("dist/client/engines/remux/" + file)), sha(await read("public/engines/remux/" + file)));
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const digest = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) digest.update(chunk);
assert.equal(digest.digest("hex"), expectedHash);
// Exact already-verified raw JSON only, never directories, fixture or converted media.
for (const record of redundant) { await rm(record.target); await assert.rejects(access(record.target), { code: "ENOENT" }); }
const ownPath = "scripts/verify-input-diagnostic-evidence.mjs", ownBytes = await read(ownPath);
const proof = { recordedAt: new Date().toISOString(), status: "bounded-input-error-controls-and-whole-original-input-only-scan-verified-not-full-conversion",
  results, removedRedundantRawJsonBytes: redundant.reduce((sum, row) => sum + row.bytes, 0),
  losslessRawArchivesRetained: true, currentProtectedOriginalWholeSha256: expectedHash, noProcessesKilled: true,
  diagnosticOnlyNoEncodingSpeedOrMemoryAcceptance: true, originalLongLivedFailureCauseProven: false,
  next: "Fresh source-bound full harness with qualified bounded input-error capture; do not infer cause from immediate scan success or perform blind retries.",
  ownSource: { path: ownPath, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
await writeFile(path.join(root, proofPath), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, sourceCounts: results.map(row => row.sourceCount), removedRawJsonBytes: proof.removedRedundantRawJsonBytes, status: proof.status }));
