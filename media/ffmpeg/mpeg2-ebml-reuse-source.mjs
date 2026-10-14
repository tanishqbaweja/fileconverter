// Exact pinned upstream source transform; not public or browser acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export const MATROSKADEC_SHA256 = "45261fc3f0bc3f3cce0395966eeadfdacc4779d97fb4b31d2ae490a2ce99e093";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const EBML_REUSE_EDITS = Object.freeze([
  ['#include "qtpalette.h"\n', '#include "qtpalette.h"\n#include "mpeg2-ebml-reuse.h"\n'],
  ["    const AVClass *class;\n    AVFormatContext *ctx;", "    const AVClass *class;\n    AVFormatContext *ctx;\n    WithinEbmlCache *within_block_cache;"],
  ["                            int64_t pos, EbmlBin *bin)\n", "                            int64_t pos, EbmlBin *bin, WithinEbmlCache **cache)\n"],
  ["    ret = av_buffer_realloc(&bin->buf, length + AV_INPUT_BUFFER_PADDING_SIZE);", "    ret = cache ? within_ebml_buffer_realloc(cache, &bin->buf, length + AV_INPUT_BUFFER_PADDING_SIZE)\n                : av_buffer_realloc(&bin->buf, length + AV_INPUT_BUFFER_PADDING_SIZE);"],
  ["        res = ebml_read_binary(pb, length, pos_alt, data);", "        res = ebml_read_binary(pb, length, pos_alt, data,\n                               (id == MATROSKA_ID_SIMPLEBLOCK || id == MATROSKA_ID_BLOCK)\n                               ? &matroska->within_block_cache : NULL);"],
  ["    ebml_free(matroska_segment, matroska);\n\n    return 0;", "    ebml_free(matroska_segment, matroska);\n    within_ebml_cache_close(&matroska->within_block_cache);\n\n    return 0;"],
].map(row => Object.freeze(row)));
export function makeEbmlReuseSource(source) {
  assert.equal(Buffer.byteLength(source), 184805);
  assert.equal(sha(source), MATROSKADEC_SHA256);
  let generated = source;
  for (const [before, after] of EBML_REUSE_EDITS) {
    assert.equal(generated.split(before).length, 2, before);
    generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of EBML_REUSE_EDITS.toReversed()) {
    assert.equal(reversed.split(after).length, 2, after);
    reversed = reversed.replace(after, before);
  }
  assert.equal(reversed, source);
  return { generated, generatedSha256: sha(generated), upstreamSha256: MATROSKADEC_SHA256,
    edits: EBML_REUSE_EDITS, maximumIdlePayloadBytes: 1048640, maximumIdleLeases: 1,
    metadataAndAttachmentAllocationsChanged: false, oversizedBlocksRejected: false,
    codecSettingsChanged: false, heapLimitsChanged: false, publicAcceptance: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3);
  const file = process.argv[2], recipe = makeEbmlReuseSource(await readFile(file, "utf8"));
  await writeFile(file, recipe.generated);
  console.log(JSON.stringify({ upstreamSha256: recipe.upstreamSha256, generatedSha256: recipe.generatedSha256 }));
}
