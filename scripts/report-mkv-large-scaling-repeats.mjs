import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { renderScalingRepeatReport } from "./lib/mkv-large-scaling-repeat-report.mjs";
import { largeScalingReference, readLargeScalingReference } from "./lib/mkv-large-scaling-reference.mjs";
assert.equal(process.argv.length, 3);
const root = path.resolve(import.meta.dirname, ".."), file = process.argv[2];
assert.match(file, /^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-mkv-hevc-header-core-scale-5gb-repeats\.json$/);
const r = JSON.parse(await readFile(path.join(root, file))), native = [], sha = b => createHash("sha256").update(b).digest("hex");
if (r.status.startsWith("passed-")) assert.deepEqual(readLargeScalingReference(await readFile(path.join(root, largeScalingReference.file)), r.candidateBuild), r.largeScalingReference);
for (const a of r.arms) {
  if (!a.archive) { native.push([]); continue; }
  assert.match(a.archive.file, /^evidence\/[a-zA-Z0-9.-]+\.json\.gz$/);
  const packed = await readFile(path.join(root, a.archive.file)); assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256); native.push(JSON.parse(raw));
}
for (const [extension, contents] of Object.entries(renderScalingRepeatReport(r, native))) {
  const output = file.replace(/\.json$/, `.${extension}`); await writeFile(path.join(root, output), contents, { flag: "wx" }); console.log(output);
}
