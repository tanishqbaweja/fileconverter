import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { headerProtectedReference, readHeaderProtectedReference } from "./lib/mkv-header-protected-reference.mjs";
import { largeScalingReference, readLargeScalingReference } from "./lib/mkv-large-scaling-reference.mjs";
import { renderNear10GbReport } from "./lib/mkv-near10gb-report.mjs";
import { renderCurrentScalingSeries } from "./lib/mkv-current-scaling-series.mjs";
import { replayLosslessNativeMemoryJournal } from "./lib/lossless-native-memory-journal.mjs";
import { assertLargeScalingLosslessCoverage } from "./lib/mkv-large-scaling-report.mjs";
assert.equal(process.argv.length, 4); const [nearFile, nearSha] = process.argv.slice(2), root = path.resolve(import.meta.dirname, "..");
assert.match(nearFile, /^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-mkv-hevc-header-core-scale-near10gb\.json$/); assert.match(nearSha, /^[a-f0-9]{64}$/);
const sha = b => createHash("sha256").update(b).digest("hex"), entries = [];
for (const reference of [{ ...headerProtectedReference, label: "original" }, { ...largeScalingReference, label: "synthetic-900loops" }, { file: nearFile, sha256: nearSha, label: "synthetic-1600loops" }]) {
  const bytes = await readFile(path.join(root, reference.file)); assert.equal(sha(bytes), reference.sha256); const report = JSON.parse(bytes), [a] = report.arms;
  if (entries.length === 0) readHeaderProtectedReference(bytes, report.candidateBuild);
  if (entries.length === 1) readLargeScalingReference(bytes, report.candidateBuild);
  assert.match(a.archive.file, /^evidence\/[a-zA-Z0-9.-]+\.json\.gz$/);
  const packed = await readFile(path.join(root, a.archive.file)); assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256); const samples = JSON.parse(raw);
  if (a.losslessNativeArchive) { await replayLosslessNativeMemoryJournal(a.losslessNativeArchive); assertLargeScalingLosslessCoverage(report); }
  if (entries.length === 2) renderNear10GbReport(report, samples);
  entries.push({ report, samples, reference });
}
const result = renderCurrentScalingSeries(entries), prefix = `evidence/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-mkv-current-core-scaling-series`;
for (const [suffix, value] of Object.entries({ json: JSON.stringify(result.summary, null, 2) + "\n", csv: result.csv, html: result.html })) {
  const file = `${prefix}.${suffix}`; await writeFile(path.join(root, file), value, { flag: "wx" }); console.log(file);
}
