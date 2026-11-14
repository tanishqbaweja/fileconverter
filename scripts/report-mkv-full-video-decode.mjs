// Offline report generation only: never opens a browser or runs media tools.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { renderFullVideoDecodeReport } from "./lib/mkv-full-video-decode-report.mjs";

assert.equal(process.argv.length, 3);
const root = path.resolve(import.meta.dirname, ".."), input = process.argv[2];
assert.match(input, /^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-mkv-exact-aac-protected-full-decode\.json$/);
const report = JSON.parse(await readFile(path.join(root, input), "utf8"));
const archive = report.arms[0].archive;
assert.equal(archive.file, input.replace(/\.json$/, "-reuse-native.json.gz"));
const packed = await readFile(path.join(root, archive.file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(packed.length, archive.bytes);
assert.equal(sha(packed), archive.sha256);
const raw = gunzipSync(packed, { maxOutputLength: 32 * 1024 ** 2 });
assert.equal(sha(raw), archive.decodedSha256);
for (const [extension, bytes] of Object.entries(renderFullVideoDecodeReport(report, JSON.parse(raw)))) {
  const output = input.replace(/\.json$/, `.${extension}`);
  await writeFile(path.join(root, output), bytes, { flag: "wx" });
  console.log(output);
}
