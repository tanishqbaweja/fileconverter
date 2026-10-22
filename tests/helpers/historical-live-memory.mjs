// Two exact source preimages for HISTORICAL report verification only. Live
// capture/unit tests must keep importing the current implementation directly.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const pins = new Map([
  ["scripts/lib/live-memory-infra.mjs", [4804, "d6d2b7f68c9b48f83f51de9f2fe1981aae41c9623d8b2cd9337d1ffb0501c1ae"]],
  ["tests/live-memory-infra.test.mjs", [2873, "75b136b3cc168705b5aa50a097a0ce4ea9b18018c88952bf22bf5e366ca27e1d"]],
]);
export async function readPreDuringWorkLiveMemory(file) {
  assert.ok(pins.has(file), "Only the two explicit historical live-memory sources are available");
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/pre-during-work-live-memory-2026-10-22.json", import.meta.url), "utf8"));
  assert.equal(archive.schemaVersion, 1); assert.equal(archive.sourceCommit, "8945d9fcab2033ed9fff84a45cd674f9b83e4f77");
  assert.equal(Object.keys(archive.files).length, 2);
  const entry = archive.files[file], [bytes, hash] = pins.get(file);
  assert.equal(entry.bytes, bytes); assert.equal(entry.sha256, hash);
  const compressed = Buffer.from(entry.gzipBase64, "base64"); assert.ok(compressed.length <= 16384);
  const source = gunzipSync(compressed, { maxOutputLength: 65536 });
  assert.equal(source.length, bytes); assert.equal(createHash("sha256").update(source).digest("hex"), hash);
  return source;
}
