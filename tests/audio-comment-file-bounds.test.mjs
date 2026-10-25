import assert from "node:assert/strict";
import { writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { COMMENT_LIMITS, readAudioCommentEntries } from "../scripts/lib/audio-comment-validation.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const word = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const text = Buffer.from("TITLE=café 音楽"), comments = Buffer.concat([word(0), word(1), word(text.length), text]);
const blockHeader = (type, size, last = false) => { const b = Buffer.alloc(4); b[0] = type | (last ? 128 : 0); b.writeUIntBE(size, 1, 3); return b; };

test("FLAC inspector seeks past a real 4MiB picture payload without reading it or raising the text budget", async () => {
  const runtime = await createOwnedRuntimeScratch("audio-comment-bounds-");
  try {
    const file = path.join(runtime.directory, "metadata-only-unit-fixture.flac"), pictureBytes = 4 * 1048576;
    await writeFile(file, Buffer.concat([Buffer.from("fLaC"), blockHeader(6, pictureBytes), Buffer.alloc(pictureBytes, 0x5a), blockHeader(4, comments.length, true), comments]), { flag: "wx" });
    const result = await readAudioCommentEntries(file, "flac");
    assert.deepEqual(result.entries, [text.toString()]); assert.equal(result.skippedPayloadBytes, pictureBytes);
    assert.equal(result.readBytes, 12 + comments.length); assert.ok(result.readBytes < 128); assert.equal(COMMENT_LIMITS.bytes, 2097152);
  } finally { await runtime.close(); await assert.rejects(lstat(runtime.directory), { code: "ENOENT" }); }
});
test("FLAC metadata inspection rejects truncated skipped blocks, oversized text, invalid types and excessive header chains", async () => {
  const runtime = await createOwnedRuntimeScratch("audio-comment-invalid-");
  try {
    const fixtures = [
      Buffer.concat([Buffer.from("fLaC"), blockHeader(6, 4194304), Buffer.alloc(32)]),
      Buffer.concat([Buffer.from("fLaC"), blockHeader(4, COMMENT_LIMITS.bytes + 1, true), Buffer.alloc(COMMENT_LIMITS.bytes + 1)]),
      Buffer.concat([Buffer.from("fLaC"), blockHeader(127, 0), blockHeader(4, comments.length, true), comments]),
      Buffer.concat([Buffer.from("fLaC"), ...Array.from({ length: 128 }, () => blockHeader(1, 0)), blockHeader(4, comments.length, true), comments]),
    ];
    for (const [index, bytes] of fixtures.entries()) {
      const file = path.join(runtime.directory, "metadata-only-invalid-" + index + ".flac"); await writeFile(file, bytes, { flag: "wx" });
      await assert.rejects(readAudioCommentEntries(file, "flac"));
    }
  } finally { await runtime.close(); await assert.rejects(lstat(runtime.directory), { code: "ENOENT" }); }
});
