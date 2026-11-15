import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { renderHeaderProtectedReport } from "./lib/mkv-header-protected-report.mjs";
assert.equal(process.argv.length, 3);
const input = process.argv[2], root = path.resolve(import.meta.dirname, "..");
assert.match(input, /^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-mkv-hevc-header-core-protected\.json$/);
const report = JSON.parse(await readFile(path.join(root, input))), arm = report.arms[0];
let samples = [];
if (arm?.archive) {
  assert.equal(arm.archive.file, input.replace(/\.json$/, "-reuse-native.json.gz"));
  const packed = await readFile(path.join(root, arm.archive.file));
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha(packed), arm.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 }); assert.equal(sha(raw), arm.archive.decodedSha256);
  samples = JSON.parse(raw);
}
for (const [extension, data] of Object.entries(renderHeaderProtectedReport(report, samples))) {
  const output = input.replace(/\.json$/, `.${extension}`);
  await writeFile(path.join(root, output), data, { flag: "wx" }); console.log(output);
}
