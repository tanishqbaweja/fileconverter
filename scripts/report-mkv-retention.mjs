import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { summarizeMkvRetention, renderMkvRetention, extractRetentionBlinkHeaps } from "./lib/mkv-retention-report.mjs";
import { summarizeLifecycleTrace } from "./lib/lifecycle-allocation-attribution.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.argv.length, 3);
const root = path.resolve(import.meta.dirname, ".."), input = process.argv[2];
assert.match(input, /^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-mkv-hevc-header-core-protected-retention-diagnostic\.json$/);
const report = JSON.parse(await readFile(path.join(root, input))), [arm] = report.arms;
assert.match(arm.archive.file, /^evidence\/[a-zA-Z0-9.-]+\.json\.gz$/);
const packed = await readFile(path.join(root, arm.archive.file)); assert.equal(sha(packed), arm.archive.sha256);
const raw = gunzipSync(packed, { maxOutputLength: 16 * 1048576 }); assert.equal(sha(raw), arm.archive.decodedSha256);
const blinkHeapStatistics = [];
for (const point of arm.retention.allocation.checkpoints) {
  if (!point.rawArchive) continue;
  assert.match(point.rawArchive.path, /^outputs\/reports\/[a-zA-Z0-9.-]+\.json\.gz$/);
  const archive = await readFile(path.join(root, point.rawArchive.path)); assert.equal(sha(archive), point.rawArchive.sha256);
  const decoded = gunzipSync(archive, { maxOutputLength: 8388608 }); assert.equal(sha(decoded), point.rawArchive.restoredSha256);
  if (point.summary) {
    const trace = JSON.parse(decoded);
    assert.deepEqual(summarizeLifecycleTrace(trace, { success: true, dumpGuid: point.summary.guid }, point.processes), point.summary);
    blinkHeapStatistics.push(extractRetentionBlinkHeaps(trace, point));
  }
}
const summary = summarizeMkvRetention(report, JSON.parse(raw));
summary.blinkHeapStatistics = blinkHeapStatistics;
for (const [extension, value] of Object.entries({ "analysis.json": JSON.stringify(summary, null, 2) + "\n", ...renderMkvRetention(summary) })) {
  const file = input.replace(/\.json$/, `.${extension}`);
  await writeFile(path.join(root, file), value, { flag: "wx" }); console.log(file);
}
