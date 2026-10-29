// Historical receipts only. Live workflow/policy tests must still read live files.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const pins = {
  "worker/index.ts": { bytes: 2036, sha256: "e43e89df0db0146e75d8a71123e4dd08881ed63dfb4b7190cf5a7bdf671420ee",
    gitBlobSha256: "427c980ca2d22a309a355f1cb9b1a3fadfb5cecb86cc1d3071530d8117e17c30" },
  ".github/workflows/ci.yml": { bytes: 16297, sha256: "c60872fd9264e255ba8b8a629e7e2cf4b8d798bf5c1968dc5a1880bb54bf7a47",
    gitBlobSha256: "c60872fd9264e255ba8b8a629e7e2cf4b8d798bf5c1968dc5a1880bb54bf7a47" },
};
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function decodePreCiRuntimeInput(file, archive) {
  assert.ok(Object.hasOwn(pins, file));
  assert.equal(archive.schemaVersion, 1);
  assert.equal(archive.sourceCommit, "86a95a5df5ca1f566c54fa7f0f327d9a278b2b47");
  const entry = archive.files[file], expected = pins[file];
  for (const key of ["bytes", "sha256", "gitBlobSha256"]) assert.equal(entry[key], expected[key]);
  assert.equal(entry.encoding, "gzip-base64");
  const bytes = gunzipSync(Buffer.from(entry.gzipBase64, "base64"), { maxOutputLength: 32768 });
  assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256);
  assert.equal(sha(Buffer.from(bytes.toString().replace(/\r\n/g, "\n"))), expected.gitBlobSha256);
  return bytes;
}
export async function readPreCiRuntimeInput(file) {
  if (!Object.hasOwn(pins, file)) return readFile(new URL("../../" + file, import.meta.url));
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/pre-ci-runtime-2026-10-29.json", import.meta.url)));
  return decodePreCiRuntimeInput(file, archive);
}
