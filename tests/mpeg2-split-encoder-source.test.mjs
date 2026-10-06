import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { provenSourceSha } from "./helpers/nondocker-workflow-provenance.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("separate encoder is a real codec owner, not demux/mux/helper/resize or changed quality", async () => {
  const c = await read("media/ffmpeg/mpeg2-split-encoder.c");
  for (const api of ["avcodec_find_encoder_by_name", "avcodec_open2", "avcodec_send_frame", "avcodec_receive_packet",
    "avcodec_parameters_from_context", "avcodec_parameters_free", "avcodec_free_context", "av_frame_is_writable", "av_packet_unref"])
    assert.ok(c.includes(api), api);
  assert.doesNotMatch(c, /avformat_|sws_|fopen|system\(|av_frame_make_writable/);
  assert.match(c, /emscripten_get_heap_size\(\) != 16777216/);
  assert.match(c, /qmin == 8 && qmax == 31/); assert.match(c, /qmin == 4 && qmax == 20/); assert.match(c, /qmin == 2 && qmax == 12/);
  assert.match(c, /gop_size = 48; encoder_context->max_b_frames = 0/);
  assert.match(c, /thread_count = 1; encoder_context->slices = 1/);
  assert.match(c, /packet->size > 8 \* 1024 \* 1024/); assert.match(c, /p->size > 1048576/);
  assert.match(c, /encoder_packet_held = 1/); assert.match(c, /if \(!encoder_packet_held\)/);
});
test("parameters use bounded explicit scalars/CPB, padded extradata and transactional native replacement", async () => {
  const h = await read("media/ffmpeg/mpeg2-split-codec-parameters.h");
  assert.match(h, /WITHIN_SPLIT_PARAMETER_CAP 65536u/); assert.match(h, /WITHIN_SPLIT_PARAMETER_HEADER 144u/);
  assert.match(h, /av_mallocz\(extra \+ AV_INPUT_BUFFER_PADDING_SIZE\)/);
  assert.match(h, /within_split_parameter_tail\(wire, bytes, NULL\)/);
  assert.ok(h.indexOf("within_split_parameter_tail(wire, bytes, NULL)") < h.indexOf("AVCodecParameters *p = avcodec_parameters_alloc()"));
  assert.match(h, /avcodec_parameters_free\(destination\); \*destination = p/);
  assert.match(h, /cpb->vbv_delay = AV_RL64/); assert.match(h, /AV_WL64\(wire \+ offset \+ 32, cpb->vbv_delay\)/);
  assert.doesNotMatch(h, /memcpy\([^\n]*(sizeof\(\*p\)|sizeof\(AVCodecParameters\))/);
});
test("separate build retains fixed DL/stack settings, no decoder and initialization verifier cannot encode", async () => {
  const recipe = await read("media/ffmpeg/build-mpeg2-split-encoder.sh");
  const verifier = await read("scripts/verify-mpeg2-split-encoder-native.mjs");
  assert.match(recipe, /--enable-encoder=mpeg2video/); assert.doesNotMatch(recipe, /--enable-decoder|docker |ALLOW_MEMORY_GROWTH=1/);
  assert.match(recipe, /INITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=16777216/);
  assert.match(recipe, /-sSTACK_SIZE=262144 -sSTACK_OVERFLOW_CHECK=2/);
  assert.match(recipe, /-sENVIRONMENT=worker,node/); assert.match(recipe, /-sMALLOC=dlmalloc/);
  assert.match(recipe, /trap cleanup EXIT/); assert.match(recipe, /mpeg2-accessory-smoke\.c/);
  assert.doesNotMatch(verifier, /core\._within_split_encoder_(send|flush)\([^)]*[0-9a-zA-Z]/);
  assert.doesNotMatch(verifier, /core\._within_split_encoder_send\(/);
  assert.match(verifier, /framesEncoded: 0/); assert.match(verifier, /completeChromiumMemoryMeasured: false/);
  assert.match(verifier, /conversionSeconds: null/);
});
test("private encoder dispatch reverses precisely without refreshing historical workflow evidence", async () => {
  const file = ".github/workflows/reproduce-ffmpeg-nondocker.yml", text = await read(file);
  const old = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
  assert.equal(provenSourceSha(file, Buffer.from(text), old), old);
  for (const [from, to] of [["          - within-mpeg2-split-encoder\n", ""],
    ["bash media/ffmpeg/build-mpeg2-split-encoder.sh", "bash other.sh"],
    ["path: work/mpeg2-split-encoder-output/", "path: work/**"],
    ["          task_path=\"$GITHUB_WORKSPACE/work/mpeg2-split-encoder-output\"\n", ""],
    ["private-mpeg2-split-encoder-${{ github.run_id }}", "renamed"]])
    assert.throws(() => provenSourceSha(file, Buffer.from(text.replace(from, to)), old));
});
