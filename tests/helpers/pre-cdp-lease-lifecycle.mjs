// Exact archived source for historical receipt provenance, never live sampling.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
export async function readPreLeaseLifecycleSampler(file) {
  assert.equal(file, "scripts/lib/cdp-realm-memory.mjs", "Only the exact historical CDP lifecycle preimage is available");
  const pin = JSON.parse(await readFile(new URL("../../fixtures/source/pre-cdp-lease-lifecycle-2026-11-07.json", import.meta.url)));
  assert.equal(pin.sourceCommit, "3c16d0e0457c2ab7f06a31d91272361ddf19683f"); assert.equal(pin.path, file);
  assert.equal(pin.bytes, 5230); assert.equal(pin.sha256, "abc33188e252183133d5debb54f909428324dfad4d0967b7c007434b5f0ecf9a");
  const zipped = Buffer.from(pin.gzipBase64, "base64"); assert.ok(zipped.length <= 8192);
  const bytes = gunzipSync(zipped, { maxOutputLength: 8192 }); assert.equal(bytes.length, pin.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256); return bytes;
}
