// Retain lossless diagnostics, not generated media or duplicate readable histories.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reports = ["2026-10-09T22-34-37-518Z", "2026-10-09T22-37-46-979Z"];
for (const stamp of reports) {
  const evidencePath = path.join(root, `evidence/${stamp}-aiff-id3-browser.json`), bytes = await readFile(evidencePath), report = JSON.parse(bytes);
  assert.ok(Array.isArray(report.samples) && report.samples.length > 0 && bytes.length < 4 * 1024 ** 2);
  assert.equal(report.assetsRestored, true); assert.equal(report.ownedRuntimeRemoved, true);
  const archivePath = `outputs/reports/${stamp}-aiff-id3-browser-raw.json.gz`, gzip = gzipSync(bytes, { level: 9 });
  assert.deepEqual(gunzipSync(gzip), bytes);
  await writeFile(path.join(root, archivePath), gzip, { flag: "wx" });
  assert.deepEqual(gunzipSync(await readFile(path.join(root, archivePath))), bytes);
  const summary = {};
  for (const phase of new Set(report.samples.map(row => row.phase))) {
    const rows = report.samples.filter(row => row.phase === phase), valid = rows.filter(row => row.sampleError === null && row.privateBytes !== null);
    summary[phase] = { totalSamples: rows.length, validSamples: valid.length, unavailableSamples: rows.length - valid.length,
      peakPrivateBytes: valid.length ? Math.max(...valid.map(row => row.privateBytes)) : null,
      peakRssBytes: valid.length ? Math.max(...valid.map(row => row.rssBytes)) : null };
  }
  const { samples, ...compact } = report;
  assert.equal(samples.length, Object.values(summary).reduce((sum, phase) => sum + phase.totalSamples, 0));
  compact.sampleSummary = summary;
  compact.losslessRawReport = { path: archivePath, bytes: gzip.length, sha256: sha(gzip), restoredBytes: bytes.length, restoredSha256: sha(bytes) };
  compact.compaction = "Only repetitive OS sample history removed from readable JSON; every sample/realm/frame/probe/source remains in verified lossless archive";
  await writeFile(evidencePath, JSON.stringify(compact, null, 2) + "\n");
  console.log(JSON.stringify({ evidencePath, readableBeforeBytes: bytes.length, readableAfterBytes: (await readFile(evidencePath)).length, archiveBytes: gzip.length }));
}
