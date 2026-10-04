import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { allocatorConsolePrefix, parseAllocatorConsole } from "../scripts/lib/h264-allocator-console.mjs";

test("private H264 demux index hint precedes opening while packet/frame/seek/fidelity remain unchanged", async () => {
  const source = await readFile(new URL("../media/ffmpeg/h264-candidate.c", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), "a6283ed5ee3080044ccabf2d79e8009e680bfb0d9aa26420b3359af25cb682a9");
  assert.match(source, /in->max_index_size = 32 \* 1024/);
  assert.ok(source.indexOf("in->max_index_size =") < source.indexOf("avformat_open_input(&in"));
  assert.match(source, /&input, input_read, NULL, input_seek/);
  assert.match(source, /av_read_frame\(in, packet\)/);
  assert.match(source, /avcodec_receive_frame\(p->decoder, p->decoded\)/);
  assert.match(source, /p.encoder->thread_count = 1/);
  assert.match(source, /"allow_skip_frames", "0"/);
  assert.match(source, /p.encoder->qmax = quality == 1 \? 42 : quality == 3 \? 28 : 36/);
  const header = await readFile(new URL("../media/ffmpeg/h264-allocator-diagnostic.h", import.meta.url), "utf8");
  assert.match(header, /avformat_index_get_entries_count/);
  assert.match(header, /index_entries \* sizeof\(AVIndexEntry\)/);
});
test("native event parser accepts complete numeric index attribution but rejects incomplete extras", () => {
  const value = { sequence: 1, inputBytes: 0, outputBytes: 0, dynamicHeapBytes: 0,
    freeDynamicBytes: 0, unclaimedHeapBytes: 0, freeRegions: 0, samplerElapsedUs: 20,
    freeBlockSizeBuckets: Array(32).fill(0), demuxIndexEntries: 10,
    demuxIndexLogicalBytes: 240, inputIndexLimitBytes: 32768 };
  assert.deepEqual(parseAllocatorConsole(allocatorConsolePrefix + JSON.stringify(value)), value);
  delete value.demuxIndexLogicalBytes;
  assert.throws(() => parseAllocatorConsole(allocatorConsolePrefix + JSON.stringify(value)));
});
