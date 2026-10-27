// Immutable input for historical private recipe tests only, never live CI acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
export async function readPreRecoveryCi() {
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/pre-recovery-ci-2026-10-27.json", import.meta.url), "utf8"));
  assert.equal(archive.schemaVersion, 1); assert.equal(archive.path, ".github/workflows/ci.yml");
  assert.equal(archive.bytes, 10143); assert.equal(archive.encoding, "gzip-base64");
  const source = gunzipSync(Buffer.from(archive.gzipBase64, "base64"), { maxOutputLength: 16384 });
  assert.equal(source.length, archive.bytes);
  const expected = "2774771a70800a96c7368982fdaa365ffc8b2027a2ed3dafae362ffa96d30d65";
  assert.equal(archive.sha256, expected); assert.equal(createHash("sha256").update(source).digest("hex"), expected);
  return source.toString();
}
