// Only the exact two dependency inputs for pre-patch evidence, not live policy.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const pins = { "package.json": "b27907298e6738ae0a732f9b81ada986761719a693c9fbdf4f48c48a4cafd3c1",
  "package-lock.json": "e4c28744e79accdcdfe1f507892cfeafb7325f519025b4b11c5052a08ebd8753" };
export async function readPreImageSizePatch(file) {
  if (!Object.hasOwn(pins, file)) return readFile(new URL("../../" + file, import.meta.url));
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/pre-image-size-patch-2026-10-28.json", import.meta.url)));
  assert.equal(archive.sourceCommit, "1852601a");
  const entry = archive.files[file], bytes = gunzipSync(Buffer.from(entry.gzipBase64, "base64"), { maxOutputLength: 1048576 });
  assert.equal(bytes.length, entry.bytes); assert.equal(entry.sha256, pins[file]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), pins[file]); return bytes;
}
