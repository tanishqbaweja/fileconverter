// Historical small-fixture evidence, not fresh browser or large-file acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("historical JSPI36 small conversions retain exact repeat hashes, complete-tree formula and cleanup limits", async () => {
  const evidence = JSON.parse(await read("evidence/2026-10-22-vpx-jspi-repeat-result.json"));
  const journalBytes = await read(evidence.journal.file); assert.equal(sha(journalBytes), evidence.journal.sha256);
  const journal = JSON.parse(journalBytes); assert.equal(journal.allThreePassed, true); assert.equal(journal.sessions.length, 3);
  const identities = new Set(), hashes = new Map(), inputHashes = new Map(); let conversions = 0, tests = 0, originalBytes = 0, archiveBytes = 0;
  for (const session of evidence.sessions) {
    assert.match(session.archive, /^output\/playwright\/vpx-decoder-qualification-[0-9TZ.-]+\.json\.gz$/);
    const zip = await read(session.archive); assert.equal(zip.length, session.archiveBytes); assert.equal(sha(zip), session.archiveSha256);
    const raw = gunzipSync(zip, { maxOutputLength: 4 * 1048576 });
    assert.equal(raw.length, session.restoredBytes); assert.equal(sha(raw), session.restoredSha256);
    const report = JSON.parse(raw), entry = journal.sessions.find(row => row.session === session.session);
    assert.equal(entry.reportSha256, sha(raw)); assert.equal(entry.passed, true);
    const peak = Math.max(...report.memorySamples.filter(row => row.phase !== "blank" && row.privateBytes !== null).map(row => row.privateBytes));
    assert.equal(peak, session.peakPrivateBytes); assert.equal(report.blankBaseline.privateBytes, session.blankPrivateBytes);
    assert.equal((peak - session.blankPrivateBytes) / 1048576, session.incrementalPrivateMiB);
    assert.equal(report.primaryIncrementalPrivateMiB, session.incrementalPrivateMiB); assert.ok(session.incrementalPrivateMiB <= 250);
    for (const sample of report.memorySamples.filter(row => row.privateBytes !== null))
      assert.equal(sample.privateBytes, sample.processes.reduce((sum, process) => sum + process.privateBytes, 0));
    assert.equal(report.inConversionDiagnosticOnly, false); assert.equal(report.memoryAcceptance, true);
    assert.equal(Object.keys(report.executedSourcePins).length, 33); assert.equal(report.executedSourcesAndBrowserPinsVerified, true);
    assert.equal(report.disposableDataRemoved, true); assert.deepEqual(report.forbiddenRequests, []);
    assert.equal(report.repeatCleanup.length, 12); assert.ok(report.repeatCleanup.every(row => row.stable && row.deltaFromLoadedMiB <= 96));
    assert.equal(report.repeatability.cleanupAllowanceFromLoadedMiB, 96);
    assert.deepEqual(report.staticCompilation, { coldCompiles: 1, reuses: 11 }); assert.deepEqual(report.staticCodeRequests, { manifests: 12, wasm: 1 });
    const rows = report.rows.filter(row => row.test); assert.equal(rows.length, 13); assert.ok(rows.every(row => row.status === "passed")); tests += rows.length;
    const outputs = report.rows.filter(row => row.independentValidation), inputs = report.rows.filter(row => row.result?.type === "complete"), groups = new Map();
    assert.equal(outputs.length, 12); assert.equal(inputs.length, 12);
    for (const [index, row] of outputs.entries()) {
      const key = row.codec + ":" + JSON.stringify(row.options), validation = row.independentValidation;
      assert.equal(validation.fullDecode, true); assert.equal(validation.audioPacketsIdentical, true); assert.ok(validation.ssim >= 0.98);
      assert.equal(validation.frames, row.options === "automatic" ? 48 : 30);
      if (hashes.has(key)) assert.equal(hashes.get(key), validation.outputSha256); else hashes.set(key, validation.outputSha256);
      if (inputHashes.has(key)) assert.equal(inputHashes.get(key), inputs[index].sourceSha256); else inputHashes.set(key, inputs[index].sourceSha256);
      groups.set(key, (groups.get(key) ?? 0) + 1); conversions++;
    }
    assert.equal(groups.size, 4); assert.ok([...groups.values()].every(value => value === 3));
    assert.ok(!identities.has(entry.browserIdentity)); identities.add(entry.browserIdentity);
    originalBytes += raw.length; archiveBytes += zip.length;
  }
  assert.equal(conversions, 36); assert.equal(tests, 39); assert.equal(hashes.size, 4); assert.equal(inputHashes.size, 4);
  assert.equal(originalBytes, evidence.rawReportsLosslesslyCompacted.originalBytes);
  assert.equal(archiveBytes, evidence.rawReportsLosslesslyCompacted.archiveBytes); assert.ok(archiveBytes < originalBytes);
  assert.equal(evidence.largeFileStressAcceptance, false); assert.equal(evidence.publicAcceptance, false); assert.equal(evidence.fullGoalComplete, false);
});
