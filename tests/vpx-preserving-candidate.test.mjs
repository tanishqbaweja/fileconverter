import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeVpxPreservingSource, makeVpxPreservingRecipe, makeVpxPreservingWorkflow, makeVpxPreservingLibraries, verifyVpxSpecialistComponents } from "../media/ffmpeg/vpx-preserving-candidate.mjs";

const source = await readFile("media/ffmpeg/within_remux.c", "utf8");
test("private preservation recipe changes only bounded MP4 audio/chapter policy, not codecs/I/O/heap", async () => {
  const recipe = makeVpxPreservingRecipe(await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"));
  assert.equal(recipe.edits.length, 2); assert.match(recipe.generated, /make-vpx-preserving-candidate.mjs/);
  assert.match(recipe.generated, /within_remux.vpx-base.c/); assert.equal(recipe.publicAcceptance, false);
  const derived = makeVpxPreservingSource(source, { masterSource: true });
  assert.equal(derived.edits.length, 7); assert.equal(derived.maxStreams, 64); assert.equal(derived.maxChapters, 1024);
  assert.match(derived.generated, /avformat_query_codec/); assert.match(derived.generated, /refusing to discard it/);
  assert.match(derived.generated, /mp4_audio_map\[input_packet->stream_index\]/);
  assert.match(derived.generated, /copy_chapters\(output_format, input_format\)/);
  assert.match(derived.generated, /frag_keyframe\+delay_moov\+default_base_moof/);
  assert.match(derived.generated, /AVFMT_AVOID_NEG_TS_DISABLED/); assert.match(derived.generated, /AV_PKT_DATA_SKIP_SAMPLES/);
  assert.match(derived.generated, /input_packet->pts = input_packet->dts = -exact_priming/);
  assert.equal(derived.maxFragmentBytes, 1048576); assert.equal(derived.maxFragmentUs, 1000000);
  assert.equal(derived.generated.slice(0, derived.generated.indexOf("static int within_video_reencode(")), source.slice(0, source.indexOf("static int within_video_reencode(")));
  assert.equal(derived.generated.slice(derived.generated.indexOf("static int within_video_to_mpeg4(")), source.slice(source.indexOf("static int within_video_to_mpeg4(")));
});
test("preserving workflow retains original pinned build SDK and adds only private dispatch/artifact", async () => {
  const source = await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"), generated = makeVpxPreservingWorkflow(source);
  assert.equal(generated.edits.length, 3); assert.match(generated.generated, /private-vpx-preserving-/);
  assert.match(generated.generated, /build-vpx-preserving-candidate.mjs/); assert.match(generated.generated, /retention-days: 1/);
});
test("preserving C refuses an unauthenticated source rather than changing unrelated native code", () => {
  assert.throws(() => makeVpxPreservingSource("not the actual compiled source"));
});
test("specialist configure retains the exact route codecs/settings while removing unrelated implementations", async () => {
  const libraries = makeVpxPreservingLibraries(await readFile("media/ffmpeg/build-libraries.sh", "utf8"));
  assert.equal(libraries.edits.length, 1); assert.match(libraries.generated, /DECODER_CONFIGURE_FLAGS=\(--enable-decoder=aac,vp8,vp9\)/);
  assert.match(libraries.generated, /ENCODER_CONFIGURE_FLAGS=\(--enable-encoder=mpeg4\)/);
  assert.match(libraries.generated, /ENABLED_DEMUXERS=matroska\nENABLED_MUXERS=mp4/);
  const config = ["AAC_DECODER", "VP8_DECODER", "VP9_DECODER", "MPEG4_ENCODER", "H263_ENCODER", "MATROSKA_DEMUXER", "MP4_MUXER", "AAC_PARSER", "VP8_PARSER", "VP9_PARSER", "AAC_ADTSTOASC_BSF"].map(name => `#define CONFIG_${name} 1`).join("\n");
  assert.deepEqual(verifyVpxSpecialistComponents(config).enabledDecoders, ["aac", "vp8", "vp9"]);
  for (const component of ["HEVC_DECODER", "LIBVPX_VP9_ENCODER", "AVI_DEMUXER", "WEBM_MUXER"])
    assert.throws(() => verifyVpxSpecialistComponents(config + `\n#define CONFIG_${component} 1`));
  assert.throws(() => verifyVpxSpecialistComponents(config.replace("CONFIG_VP9_DECODER 1", "CONFIG_VP9_DECODER 0")));
});
