// Private scalar observation only; exact reversal preserves every allocation byte.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FRAME_ALLOCATION_SOURCE_SHA256 = "910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4";
const sha = (source) => createHash("sha256").update(source).digest("hex");
const additions = [
  ["static int video_get_buffer(AVCodecContext *s, AVFrame *pic)\n",
    "// Private scalar plane observation; no allocation or reference mutation.\n" +
    "void within_mpeg2_plane_diagnostic(const AVCodecContext *s, const AVFrame *pic,\n" +
    "                                  int plane, size_t bytes, int linesize, int phase);\n\n"],
  ["        // Private specialist core: no inactive encoder / HEVC plane cache.\n",
    "        within_mpeg2_plane_diagnostic(s, pic, i, pool->buffer_size[i],\n" +
    "                                     pool->linesize[i], 0);\n"],
  ["        if (!pic->buf[i])\n            goto fail;\n\n        pic->data[i] = pic->buf[i]->data;",
    "        within_mpeg2_plane_diagnostic(s, pic, i, pool->buffer_size[i],\n" +
    "                                     pool->linesize[i], 1);\n"],
];
export function reverseFrameAllocationDiagnostic(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  for (const [, addition] of additions) {
    assert.equal(source.split(addition).length, 2, "Exactly one scalar insertion");
    source = source.replace(addition, "");
  }
  assert.equal(sha(source), FRAME_ALLOCATION_SOURCE_SHA256);
  return source;
}
export function instrumentFrameAllocation(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  assert.equal(sha(source), FRAME_ALLOCATION_SOURCE_SHA256);
  const before = source;
  for (const [needle, addition] of additions) {
    assert.equal(source.split(needle).length, 2, "Exactly one audited insertion boundary");
    source = source.replace(needle, addition + needle);
  }
  assert.equal(reverseFrameAllocationDiagnostic(source), before);
  return source;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, "../.."), target = path.resolve(process.argv[2] ?? "");
  assert.equal(process.argv.length, 3);
  assert.equal(target, path.join(root, "work/mpeg2-candidate-build/ffmpeg/libavcodec/get_buffer.c"));
  assert.equal(await realpath(target), target, "Generated source cannot escape owned build");
  const info = await lstat(target); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 32768);
  const after = instrumentFrameAllocation(await readFile(target, "utf8"));
  await writeFile(target, after);
  process.stdout.write(`${sha(after)}  scalar-plane-observation-generated-source\n`);
}
