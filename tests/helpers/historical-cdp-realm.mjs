// Exact historical sampler only; never used by production or live diagnostics.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
const historicalPath = "scripts/lib/cdp-realm-memory.mjs";
const expectedSha256 = "046b122ebb37935de6e5b75ebc59f0fd16ea6837c8aea0d75e0bbd70f1eb799f";
export async function readPreSessionRecoverySampler(file) {
  assert.equal(file, historicalPath, "Only the exact historical CDP sampler is available");
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/svg-snapshot-dc9dbff6.json", import.meta.url), "utf8"));
  assert.equal(archive.sourceCommit, "dc9dbff60c2438dfa57328113b60bb9bc161e575");
  const entry = archive.files[historicalPath]; assert.equal(entry.bytes, 4791); assert.equal(entry.sha256, expectedSha256);
  const zipped = Buffer.from(entry.gzipBase64, "base64"); assert.ok(zipped.length <= 8192);
  const bytes = gunzipSync(zipped, { maxOutputLength: 8192 }); assert.equal(bytes.length, 4791);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha256); return bytes;
}
export async function readHistoricalCdpOrFile(file, options) {
  const filename = file instanceof URL ? fileURLToPath(file) : typeof file === "string" ? path.resolve(file) : null;
  const relative = filename && path.relative(path.resolve(import.meta.dirname, "../.."), filename).replaceAll("\\", "/");
  if (relative !== historicalPath) return readFile(file, options);
  const bytes = await readPreSessionRecoverySampler(relative), encoding = typeof options === "string" ? options : options?.encoding;
  return encoding ? bytes.toString(encoding) : bytes;
}
