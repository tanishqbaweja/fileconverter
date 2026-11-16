import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { renderProductionStagedRepeatReport } from "./lib/mkv-production-staged-repeat-report.mjs";
assert.equal(process.argv.length, 3); const file = process.argv[2], root = path.resolve(import.meta.dirname, "..");
assert.match(file, /^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-mkv-hevc-header-core-production-staged-original-repeats\.json$/);
const r = JSON.parse(await readFile(path.join(root, file))), archives = [], sha = b => createHash("sha256").update(b).digest("hex");
for (const a of r.arms) {
  assert.match(a.archive.file, /^evidence\/[a-zA-Z0-9.-]+\.json\.gz$/);
  const packed = await readFile(path.join(root, a.archive.file)); assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256); archives.push(JSON.parse(raw));
}
for (const [suffix, contents] of Object.entries(renderProductionStagedRepeatReport(r, archives))) {
  const output = file.replace(/\.json$/, `.${suffix}`); await writeFile(path.join(root, output), contents, { flag: "wx" }); console.log(output);
}
