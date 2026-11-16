import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { renderLargeScalingReport, assertLargeScalingLosslessCoverage } from "./lib/mkv-large-scaling-report.mjs";
import { replayLosslessNativeMemoryJournal } from "./lib/lossless-native-memory-journal.mjs";
assert.equal(process.argv.length, 3);
const root = path.resolve(import.meta.dirname, ".."), file = process.argv[2];
assert.match(file, /^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-mkv-hevc-header-core-scale-5gb\.json$/);
const report = JSON.parse(await readFile(path.join(root, file))), [arm] = report.arms;
assert.match(arm.archive.file, /^evidence\/[a-zA-Z0-9.-]+\.json\.gz$/);
const sha = b => createHash("sha256").update(b).digest("hex"), packed = await readFile(path.join(root, arm.archive.file));
assert.equal(sha(packed), arm.archive.sha256);
const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 }); assert.equal(sha(raw), arm.archive.decodedSha256);
if (arm.losslessNativeArchive) {
  const receipt = arm.losslessNativeArchive;
  assert.match(receipt.file, /^output\/playwright\/[a-zA-Z0-9.-]+\.ndjson\.gz$/);
  if (receipt.complete !== false) {
    await replayLosslessNativeMemoryJournal({ ...receipt, file: path.join(root, receipt.file) });
    assertLargeScalingLosslessCoverage(report);
  }
  else assert.equal(report.status, "failed-not-acceptance");
}
for (const [extension, contents] of Object.entries(renderLargeScalingReport(report, JSON.parse(raw)))) {
  const output = file.replace(/\.json$/, `.${extension}`); await writeFile(path.join(root, output), contents, { flag: "wx" }); console.log(output);
}
