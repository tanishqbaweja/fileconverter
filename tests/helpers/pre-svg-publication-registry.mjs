// Historical receipts only. Live registry/UI gates must import live policy.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export async function readPreSvgPublicationRegistry() {
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/pre-svg-publication-gate-2026-10-30.json", import.meta.url)));
  assert.equal(archive.schemaVersion, 1); assert.equal(archive.sourceCommit, "9928c79e");
  assert.equal(archive.file, "lib/capability-registry.ts"); assert.equal(archive.encoding, "gzip-base64");
  assert.equal(archive.bytes, 243956); assert.equal(archive.sha256, "d9f5ad4599db8b43a68acb311f16d652a9a74300c38a31f827c12590652e573b");
  const bytes = gunzipSync(Buffer.from(archive.gzipBase64, "base64"), { maxOutputLength: 262144 });
  assert.equal(bytes.length, archive.bytes); assert.equal(sha(bytes), archive.sha256); return bytes;
}
