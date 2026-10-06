import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeMpeg2SplitKernel } from "../media/ffmpeg/mpeg2-split-kernel.mjs";
import { provenSourceSha } from "./helpers/nondocker-workflow-provenance.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("split kernel reverses every change to the exact prior kernel, preserving native clocks and production AVIO", async () => {
  const original = await read("media/ffmpeg/mpeg2-candidate.c"), split = makeMpeg2SplitKernel(original);
  assert.ok(split.includes("within_split_send(frame)")); assert.ok(split.includes("within_split_receive(p->encoded)"));
  assert.ok(split.includes("within_split_read_parameters(&destination->codecpar"));
  assert.doesNotMatch(split, /avcodec_open2\(p.encoder/); assert.doesNotMatch(split, /avcodec_send_frame/);
  for (const statement of ["av_packet_rescale_ts(p->encoded, p->encoder->time_base,", "p->encoded->pts += offset",
    "av_interleaved_write_frame(p->output, p->encoded)", "p.encoder->qmin = quality == 1 ? 8 : quality == 3 ? 2 : 4",
    "p.encoder->qmax = quality == 1 ? 31 : quality == 3 ? 12 : 20", "p.encoder->height = p.decoder->height",
    "av_dict_copy(&out->metadata, in->metadata, 0)", "mpeg2_chapters(out, in)"])
    assert.ok(split.includes(statement), statement);
  assert.ok(split.indexOf("av_interleaved_write_frame(p->output, p->encoded)") < split.indexOf("within_split_call(4,"));
  assert.throws(() => makeMpeg2SplitKernel(original + "\n"), /Exact prior private kernel/);
});
test("mux bridge owns native encoded allocations without a packet staging buffer or nested asynchronous call", async () => {
  const h = await read("media/ffmpeg/mpeg2-split-mux-bridge.h");
  assert.match(h, /EM_JS\(int, within_split_call/);
  assert.doesNotMatch(h.replace(/\/\*[\s\S]*?\*\//g, ""), /EM_ASYNC_JS|await |av_frame_unref/);
  assert.match(h, /av_new_packet\(packet, bytes\)/); assert.match(h, /av_packet_new_side_data/);
  assert.match(h, /AV_WL32\(w \+ 4, \(uintptr_t\)packet->data\)/);
  assert.match(h, /bytes > 1048576/); assert.match(h, /size > 65536 - side_bytes/);
  assert.doesNotMatch(h, /uint8_t\s+\w+\[1048576\]/);
  assert.match(h, /memset\(packet->data \+ bytes, 0, AV_INPUT_BUFFER_PADDING_SIZE\)/);
});
test("optional split pipeline dispatch preserves historical workflow bytes and rejects unpaired changes", async () => {
  const file = ".github/workflows/reproduce-ffmpeg-nondocker.yml", text = await read(file);
  const old = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
  assert.equal(provenSourceSha(file, Buffer.from(text), old), old);
  for (const [from, to] of [["          - within-mpeg2-split-pipeline\n", ""],
    ["bash media/ffmpeg/build-mpeg2-split-pipeline.sh", "bash other.sh"],
    ["path: work/mpeg2-split-pipeline-output/", "path: work/**"],
    ["          task_path=\"$GITHUB_WORKSPACE/work/mpeg2-split-pipeline-output\"\n", ""]])
    assert.throws(() => provenSourceSha(file, Buffer.from(text.replace(from, to)), old));
});
