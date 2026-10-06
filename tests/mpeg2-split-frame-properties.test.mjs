import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { copyMpeg2SplitProperties } from "../scripts/lib/mpeg2-split-frame-properties.mjs";
import { provenSourceSha } from "./helpers/nondocker-workflow-provenance.mjs";

function cores() {
  return [512, 256].map((pages) => ({ HEAPU8: new Uint8Array(new WebAssembly.Memory({ initial: pages, maximum: pages, shared: true }).buffer) }));
}
test("Native properties copy is a single bounded direct view/set, leaves all surrounding bytes intact", () => {
  const [decoder, encoder] = cores();
  for (const bytes of [160, 620, 65536]) {
    decoder.HEAPU8.fill(71, 128, 128 + bytes); encoder.HEAPU8.fill(19, 0, 65700);
    assert.equal(copyMpeg2SplitProperties(decoder, encoder, 128, 128, bytes), bytes);
    assert.ok(encoder.HEAPU8.subarray(128, 128 + bytes).every((b) => b === 71));
    assert.ok(encoder.HEAPU8.subarray(0, 128).every((b) => b === 19));
    assert.ok(encoder.HEAPU8.subarray(128 + bytes, 65700).every((b) => b === 19));
  }
});
test("Malformed property slots, incomplete or wrong heaps reject before any destination write", () => {
  const [decoder, encoder] = cores(); encoder.HEAPU8.fill(19, 0, 70000);
  for (const [src, dest, bytes] of [[-1, 128, 160], [128, -1, 160], [128, 1.5, 160],
    [128, 128, 159], [128, 128, 65537], [128, encoder.HEAPU8.length - 65535, 160],
    [decoder.HEAPU8.length - 65535, 128, 160], [NaN, 128, 160]])
    assert.throws(() => copyMpeg2SplitProperties(decoder, encoder, src, dest, bytes));
  assert.throws(() => copyMpeg2SplitProperties({ HEAPU8: decoder.HEAPU8.subarray(1) }, encoder, 128, 128, 160));
  assert.throws(() => copyMpeg2SplitProperties(encoder, decoder, 128, 128, 160));
  assert.ok(encoder.HEAPU8.subarray(0, 70000).every((b) => b === 19));
});
test("Private native properties preserve exact clocks and transactional bounded metadata, without pixels or private decoder objects", async () => {
  const header = await readFile(new URL("../media/ffmpeg/mpeg2-split-frame-properties.h", import.meta.url), "utf8");
  const js = await readFile(new URL("../scripts/lib/mpeg2-split-frame-properties.mjs", import.meta.url), "utf8");
  const fixture = await readFile(new URL("../media/ffmpeg/mpeg2-split-properties-smoke.c", import.meta.url), "utf8");
  const verifier = await readFile(new URL("../scripts/verify-mpeg2-split-properties-native.mjs", import.meta.url), "utf8");
  for (const field of ["pts", "pkt_dts", "best_effort_timestamp", "duration"])
    assert.match(header, new RegExp(`frame->${field} = \\(int64_t\\)AV_RL64`));
  for (const field of ["pict_type", "sample_aspect_ratio", "time_base", "quality", "repeat_pict", "flags",
    "decode_error_flags", "color_range", "color_primaries", "color_trc", "colorspace", "chroma_location", "alpha_mode"])
    assert.ok(header.includes(`frame->${field}`), field);
  assert.match(header, /within_props_tail_read\(wire, bytes, NULL\)/);
  assert.match(header, /within_props_tail_read\(wire, bytes, temporary\)/);
  assert.match(header, /destination->metadata = temporary->metadata; temporary->metadata = NULL/);
  assert.match(header, /AV_DICT_MATCH_CASE \| AV_DICT_MULTIKEY/);
  assert.match(header, /memchr\(wire \+ key_at, 0, key - 1\)/);
  assert.match(header, /WITHIN_SPLIT_PROPS_DICT_LIMIT 64u/); assert.match(header, /WITHIN_SPLIT_PROPS_SIDE_LIMIT 16u/);
  assert.match(header, /default: return 0/); assert.match(header, /frame->opaque \|\| frame->opaque_ref/);
  assert.doesNotMatch(header, /->private_ref|av_frame_(?:ref|unref|copy_props|get_buffer|make_writable)\(|av_buffer_(?:ref|unref)\(/);
  assert.doesNotMatch(js, /new (?:Uint8Array|ArrayBuffer)|JSON|TextDecoder|console|fetch\(|node:/);
  assert.match(fixture, /within_props_smoke_check/); assert.match(fixture, /av_dict_count\(synthetic_frame->metadata\) != 5/);
  assert.match(verifier, /getBigInt64\(96, true\), -9223372036854775808n/);
  assert.match(verifier, /_within_props_smoke_check\(i\), 1/); assert.match(verifier, /processMemoryAcceptance: false/);
  assert.match(verifier, /finally \{/); assert.doesNotMatch(verifier, /test\.mkv|spawn\(/);
});
test("Properties-only native workflow additions reverse exactly and cannot refresh historical provenance", async () => {
  const file = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
  const workflow = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  for (const hash of ["5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6",
    "8442e48304e6ba448cad205f1e6dfd5757a41e25f6b20be4a50c611957a1f767"])
    assert.equal(provenSourceSha(file, Buffer.from(workflow), hash), hash);
  for (const [from, to] of [["verify-mpeg2-split-properties.sh", "other.sh"],
    ["outputs/reports/mpeg2-split-properties-contract.json", "work/**"],
    ["          - within-mpeg2-split-properties\n", ""],
    ["private-mpeg2-split-properties-${{ github.run_id }}", "renamed"],
    ["          task_path=\"$GITHUB_WORKSPACE/work/mpeg2-split-properties-build\"\n", ""],
    ["          - within-mpeg2-split-properties\n", "          - within-mpeg2-split-properties\n          - within-mpeg2-split-properties\n"]]) {
    const changed = workflow.replace(from, to); assert.notEqual(changed, workflow);
    assert.throws(() => provenSourceSha(file, Buffer.from(changed), "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6"));
  }
});
