// Private correction for the real browser AAC-loss failure. Public C stays exact.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeVpxDecoderBuildRecipe, makeVpxDecoderLibraries, VPX_COMPILED_WRAPPER_SHA256 } from "./vpx-decoder-candidate.mjs";
import { makeVpxDecoderBuildWorkflow } from "../../scripts/lib/vpx-decoder-build-workflow.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
function exact(source, edits) {
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, source); return { generated, generatedSha256: sha(generated), edits, publicAcceptance: false };
}
export function makeVpxPreservingSource(source, { masterSource = false } = {}) {
  // Portable tests can use the pinned checked-in master. The native builder and
  // CLI always use the separately authenticated actual general-core parent.
  const parentSha256 = masterSource ? "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068" : VPX_COMPILED_WRAPPER_SHA256;
  assert.equal(sha(source), parentSha256);
  const start = source.indexOf("static int within_video_reencode("), end = source.indexOf("static int within_video_to_mpeg4(", start);
  assert.ok(start > 0 && end > start);
  const before = source.slice(start, end);
  const edits = [
    ["  int audio_stream_index = -1;\n", "  int audio_stream_index = -1;\n  int mp4_audio_map[64];\n  int mp4_audio_started[64] = {0};\n"],
    ["  if (input_format->nb_chapters > 0) {\n", "  if (webm && input_format->nb_chapters > 0) {\n"],
    ["  for (unsigned int index = 0; index < input_format->nb_streams; index++) {\n",
      "  if (!webm && (input_format->nb_streams > 64 || input_format->nb_chapters > 1024)) {\n" +
      "    within_message(2, \"MP4 preservation exceeds the bounded64-stream/1024-chapter limit.\");\n" +
      "    result = AVERROR(ENOMEM);\n    goto cleanup;\n  }\n" +
      "  for (int index = 0; index < 64; index++) mp4_audio_map[index] = -1;\n" +
      "  for (unsigned int index = 0; index < input_format->nb_streams; index++) {\n"],
    ["    if (preserve_vorbis_audio && audio_stream_index < 0 &&\n",
      "    if (!webm && stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {\n      continue;\n    }\n" +
      "    if (preserve_vorbis_audio && audio_stream_index < 0 &&\n"],
    ["  if (encoder->width != decoder->width ||\n", "  if (!webm) {\n" +
      "    output_format->max_interleave_delta = AV_TIME_BASE;\n" +
      "    for (unsigned int index = 0; index < input_format->nb_streams; index++) {\n" +
      "      AVStream *source = input_format->streams[index];\n" +
      "      if (source->codecpar->codec_type != AVMEDIA_TYPE_AUDIO) continue;\n" +
      "      if (avformat_query_codec(output_format->oformat, source->codecpar->codec_id, FF_COMPLIANCE_NORMAL) <= 0) {\n" +
      "        within_message(2, \"Source audio needs a separate MP4-compatible encoding route; refusing to discard it.\");\n" +
      "        result = AVERROR(ENOSYS);\n        goto cleanup;\n      }\n" +
      "      AVStream *destination = avformat_new_stream(output_format, NULL);\n" +
      "      if (!destination) { result = AVERROR(ENOMEM); goto cleanup; }\n" +
      "      destination->time_base = source->time_base;\n      destination->disposition = source->disposition;\n" +
      "      result = avcodec_parameters_copy(destination->codecpar, source->codecpar);\n" +
      "      if (result < 0) goto cleanup;\n      destination->codecpar->codec_tag = 0;\n" +
      "      result = av_dict_copy(&destination->metadata, source->metadata, 0);\n" +
      "      if (result < 0) goto cleanup;\n      mp4_audio_map[index] = destination->index;\n    }\n" +
      "    result = copy_chapters(output_format, input_format);\n    if (result < 0) goto cleanup;\n  }\n\n" +
      "  if (encoder->width != decoder->width ||\n"],
    ["    } else if (preserve_vorbis_audio &&\n", "    } else if (!webm && input_packet->stream_index >= 0 && input_packet->stream_index < 64 &&\n" +
      "               mp4_audio_map[input_packet->stream_index] >= 0) {\n" +
      "      AVStream *source = input_format->streams[input_packet->stream_index];\n" +
      "      AVStream *destination = output_format->streams[mp4_audio_map[input_packet->stream_index]];\n" +
      "      const int source_index = input_packet->stream_index;\n" +
      "      int64_t exact_priming = 0;\n" +
      "      if (!mp4_audio_started[source_index] && source->codecpar->codec_id == AV_CODEC_ID_AAC) {\n" +
      "        size_t side_size = 0;\n" +
      "        const uint8_t *side = av_packet_get_side_data(input_packet, AV_PKT_DATA_SKIP_SAMPLES, &side_size);\n" +
      "        if (side && side_size >= 10) {\n" +
      "          const uint32_t skip = read_little_endian_uint32(side);\n" +
      "          const int rate = source->codecpar->sample_rate;\n" +
      "          if (skip > 0) {\n" +
      "            if (rate <= 0 || skip > (uint32_t)rate || source->time_base.num <= 0 || source->time_base.den <= 0 ||\n" +
      "                input_packet->dts == AV_NOPTS_VALUE || input_packet->dts >= 0 ||\n" +
      "                input_packet->pts != input_packet->dts ||\n" +
      "                llabs(input_packet->dts + av_rescale_q(skip, (AVRational){1, rate}, source->time_base)) > 1) {\n" +
      "              within_message(2, \"AAC priming cannot be preserved with this source timestamp layout.\");\n" +
      "              result = AVERROR(ENOSYS);\n              goto cleanup;\n            }\n" +
      "            exact_priming = av_rescale_q(skip, (AVRational){1, rate}, destination->time_base);\n" +
      "          }\n        }\n      }\n" +
      "      mp4_audio_started[source_index] = 1;\n" +
      "      av_packet_rescale_ts(input_packet, source->time_base, destination->time_base);\n" +
      "      if (exact_priming > 0) {\n" +
      "        input_packet->pts = input_packet->dts = -exact_priming;\n" +
      "        input_packet->duration = exact_priming;\n      }\n" +
      "      input_packet->stream_index = destination->index;\n      input_packet->pos = -1;\n" +
      "      result = av_interleaved_write_frame(output_format, input_packet);\n" +
      "      if (result < 0) { report_av_error(\"MP4 compatible audio stream copy failed\", result); goto cleanup; }\n" +
      "    } else if (preserve_vorbis_audio &&\n"],
    ['    av_dict_set(&muxer_options, "movflags",\n                "frag_keyframe+empty_moov+default_base_moof", 0);\n',
      '    output_format->avoid_negative_ts = AVFMT_AVOID_NEG_TS_DISABLED;\n' +
      '    result = av_dict_set(&muxer_options, "movflags",\n                         "frag_keyframe+delay_moov+default_base_moof", 0);\n' +
      '    if (result >= 0) result = av_dict_set(&muxer_options, "use_editlist", "1", 0);\n' +
      '    if (result >= 0) result = av_dict_set(&muxer_options, "frag_duration", "1000000", 0);\n' +
      '    if (result >= 0) result = av_dict_set(&muxer_options, "frag_size", "1048576", 0);\n' +
      '    if (result < 0) goto cleanup;\n'],
  ];
  const changed = exact(before, edits), generated = source.slice(0, start) + changed.generated + source.slice(end);
  return { generated, generatedSha256: sha(generated), edits, parentSha256,
    maxStreams: 64, maxChapters: 1024, maxInterleaveUs: 1_000_000, maxFragmentBytes: 1_048_576,
    maxFragmentUs: 1_000_000, delayedMoov: true, exactAacPriming: true, publicAcceptance: false };
}
export function makeVpxPreservingRecipe(source) {
  const base = makeVpxDecoderBuildRecipe(source).generated, link = "  WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh\n";
  return exact(base, [[link, '  cp -- "${BUILD_ROOT}/within_remux.c" "${OUTPUT_ROOT}/within_remux.vpx-base.c"\n' +
    '  node "${SCRIPT_DIR}/make-vpx-preserving-candidate.mjs" "${BUILD_ROOT}/within_remux.c"\n' + link],
    ['bash "${BUILD_ROOT}/build-libraries.vpx.sh"\n',
      'node "${SCRIPT_DIR}/make-vpx-preserving-candidate.mjs" --libraries "${BUILD_ROOT}/build-libraries.vpx.sh"\n' +
      'bash "${BUILD_ROOT}/build-libraries.vpx.sh"\n']]);
}
export function makeVpxPreservingLibraries(source) {
  const base = makeVpxDecoderLibraries(source).generated;
  const marker = '  ENCODER_CONFIGURE_FLAGS=(--enable-encoder="${ENABLED_ENCODERS}")\nfi\n';
  return exact(base, [[marker, marker + '\n# Private Matroska VP8/VP9 to MPEG4; unrelated public routes use their own cores.\n' +
    'ENABLED_DEMUXERS=matroska\nENABLED_MUXERS=mp4\nENABLED_PARSERS=aac,vp8,vp9\nENABLED_BSFS=aac_adtstoasc\n' +
    'EXTERNAL_CODEC_FLAGS=()\nTHEORA_CONFIGURE_FLAGS=()\n' +
    'DECODER_CONFIGURE_FLAGS=(--enable-decoder=aac,vp8,vp9)\nENCODER_CONFIGURE_FLAGS=(--enable-encoder=mpeg4)\n']]);
}
export function verifyVpxSpecialistComponents(source) {
  const inventory = {};
  for (const [key, suffix, allowed, required] of [
    ["enabledDecoders", "DECODER", ["aac", "vp8", "vp9"], ["aac", "vp8", "vp9"]],
    ["enabledEncoders", "ENCODER", ["h263", "mpeg4"], ["mpeg4"]],
    ["enabledDemuxers", "DEMUXER", ["matroska"], ["matroska"]],
    ["enabledMuxers", "MUXER", ["mp4", "mov"], ["mp4"]],
    ["enabledParsers", "PARSER", ["aac", "aac_latm", "ac3", "vp8", "vp9"], ["vp8", "vp9"]],
    ["enabledBitstreamFilters", "BSF", ["aac_adtstoasc", "vp9_superframe", "vp9_superframe_split"], ["aac_adtstoasc"]],
  ]) {
    const names = [...source.matchAll(new RegExp("^#define CONFIG_([A-Z0-9_]+)_" + suffix + " 1$", "gm"))].map(match => match[1].toLowerCase()).sort();
    assert.ok(names.length > 0 && names.every(name => allowed.includes(name)), "Undeclared specialist component: " + key + ":" + names);
    for (const name of required) assert.ok(names.includes(name), "Missing specialist component: " + key + ":" + name);
    inventory[key] = names;
  }
  return inventory;
}
export function makeVpxPreservingWorkflow(source) {
  const base = makeVpxDecoderBuildWorkflow(source).generated;
  return exact(base, [["node media/ffmpeg/build-vpx-decoder-candidate.mjs", "node media/ffmpeg/build-vpx-preserving-candidate.mjs"],
    ["name: private-vpx-decoders-${{ github.run_id }}", "name: private-vpx-preserving-${{ github.run_id }}"],
    ["            work/ffmpeg-nondocker-output/within_remux.vpx.c\n", "            work/ffmpeg-nondocker-output/within_remux.vpx.c\n            work/ffmpeg-nondocker-output/within_remux.vpx-base.c\n"]]);
}
