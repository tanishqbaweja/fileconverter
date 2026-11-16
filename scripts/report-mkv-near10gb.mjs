import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { renderNear10GbReport } from "./lib/mkv-near10gb-report.mjs";
import { replayLosslessNativeMemoryJournal } from "./lib/lossless-native-memory-journal.mjs";
import { assertLargeScalingLosslessCoverage } from "./lib/mkv-large-scaling-report.mjs";
assert.equal(process.argv.length, 3);
const root = path.resolve(import.meta.dirname, ".."), file = process.argv[2];
assert.match(file, /^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-mkv-hevc-header-core-scale-near10gb\.json$/);
const r = JSON.parse(await readFile(path.join(root, file))), [a] = r.arms;
assert.match(a.archive.file, /^evidence\/[a-zA-Z0-9.-]+\.json\.gz$/);
const sha = b => createHash("sha256").update(b).digest("hex"), packed = await readFile(path.join(root, a.archive.file));
assert.equal(sha(packed), a.archive.sha256);
const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
if (a.losslessNativeArchive?.complete === true) {
  assert.match(a.losslessNativeArchive.file, /^output\/playwright\/[a-zA-Z0-9.-]+\.ndjson\.gz$/);
  await replayLosslessNativeMemoryJournal({ ...a.losslessNativeArchive, file: path.join(root, a.losslessNativeArchive.file) });
  assertLargeScalingLosslessCoverage(r);
}
for (const [extension, contents] of Object.entries(renderNear10GbReport(r, JSON.parse(raw)))) {
  const output = file.replace(/\.json$/, `.${extension}`); await writeFile(path.join(root, output), contents, { flag: "wx" }); console.log(output);
}
