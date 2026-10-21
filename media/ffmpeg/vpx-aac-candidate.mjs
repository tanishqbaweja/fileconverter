// Isolated correction for the exact zero-start AAC source refusal. Existing
// preserving candidate/source audit stays immutable and independently reusable.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeVpxPreservingSource, makeVpxPreservingRecipe, makeVpxPreservingWorkflow } from "./vpx-preserving-candidate.mjs";
export const VPX_AAC_MUX_PARENT_SHA256 = "d7aa80a99efecf757100dbd6d9d7adb84d263cbeed0603873206975405907068";
export const VPX_AAC_PATCH_SHA256 = "f6c9ab0dfe0a918e6e197f779d77b58b4f7e0e525ba4e72d6ed6375a5ed3381a";
const sha = value => createHash("sha256").update(value).digest("hex");
function exact(source, edits) {
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  return { generated, generatedSha256: sha(generated), edits, publicAcceptance: false };
}
export function makeVpxAacSource(source, options) {
  const base = makeVpxPreservingSource(source, options);
  const start = base.generated.indexOf("      int64_t exact_priming = 0;\n");
  const end = base.generated.indexOf("      mp4_audio_started[source_index] = 1;\n", start);
  assert.ok(start > 0 && end > start);
  const after = `      int64_t exact_priming = 0;
      if (!mp4_audio_started[source_index] && source->codecpar->codec_id == AV_CODEC_ID_AAC) {
        size_t side_size = 0;
        const uint8_t *side = av_packet_get_side_data(input_packet, AV_PKT_DATA_SKIP_SAMPLES, &side_size);
        const int rate = source->codecpar->sample_rate;
        const int header_padding = source->codecpar->initial_padding;
        if ((side && side_size < 10) || header_padding < 0 || rate <= 0 || header_padding > rate) {
          within_message(2, "AAC priming metadata is malformed or exceeds the bounded one-second limit.");
          result = AVERROR(ENOSYS);
          goto cleanup;
        }
        const uint32_t skip = side ? read_little_endian_uint32(side) : (uint32_t)header_padding;
        if ((header_padding > 0 && skip != (uint32_t)header_padding) || skip > (uint32_t)rate ||
            source->time_base.num <= 0 || source->time_base.den <= 0 ||
            input_packet->dts == AV_NOPTS_VALUE || input_packet->pts != input_packet->dts) {
          within_message(2, "AAC priming cannot be preserved with conflicting metadata or unavailable packet clocks.");
          result = AVERROR(ENOSYS);
          goto cleanup;
        }
        if (skip > 0) {
          // The private MOV mux patch represents this exact decoder trim in
          // the edit list. Zero/positive packet clocks are never shifted.
          destination->codecpar->initial_padding = (int)skip;
          if (input_packet->dts < 0) {
            if (llabs(input_packet->dts + av_rescale_q(skip, (AVRational){1, rate}, source->time_base)) > 1) {
              within_message(2, "AAC negative preroll disagrees with its explicit decoder trim.");
              result = AVERROR(ENOSYS);
              goto cleanup;
            }
            // Retain the previously validated sub-millisecond Matroska tick
            // correction only for the matching negative-preroll packet.
            exact_priming = av_rescale_q(skip, (AVRational){1, rate}, destination->time_base);
          }
        }
      }
`;
  const changed = exact(base.generated, [[base.generated.slice(start, end), after]]);
  return { ...base, ...changed, edits: [...base.edits, ...changed.edits], exactAacEditList: true };
}
export function makeVpxAacMuxSource(source, patch) {
  assert.equal(sha(source), VPX_AAC_MUX_PARENT_SHA256);
  assert.equal(sha(patch), VPX_AAC_PATCH_SHA256);
  const edits = []; let before = "", after = "", active = false;
  for (const line of patch.split("\n").slice(2)) {
    if (line.startsWith("@@")) {
      if (active) edits.push([before, after]); before = ""; after = ""; active = true;
    } else if (active && line.length) {
      assert.ok([" ", "+", "-"].includes(line[0]), "Unsupported unified patch syntax");
      if (line[0] !== "+") before += line.slice(1) + "\n";
      if (line[0] !== "-") after += line.slice(1) + "\n";
    }
  }
  if (active) edits.push([before, after]); assert.equal(edits.length, 2);
  return { ...exact(source, edits), parentSha256: VPX_AAC_MUX_PARENT_SHA256, patchSha256: VPX_AAC_PATCH_SHA256 };
}
export function makeVpxAacRecipe(source) {
  const base = makeVpxPreservingRecipe(source).generated;
  return exact(base, [
    ['node "${SCRIPT_DIR}/make-vpx-preserving-candidate.mjs" "${BUILD_ROOT}/within_remux.c"',
      'node "${SCRIPT_DIR}/make-vpx-aac-candidate.mjs" "${BUILD_ROOT}/within_remux.c"'],
    ['bash "${BUILD_ROOT}/build-libraries.vpx.sh"\n',
      'node "${SCRIPT_DIR}/make-vpx-aac-candidate.mjs" --mux "${BUILD_ROOT}/ffmpeg/libavformat/movenc.c"\n' +
      'bash "${BUILD_ROOT}/build-libraries.vpx.sh"\n'],
    ['  cp -- "${BUILD_ROOT}/ffmpeg/config_components.h" "${OUTPUT_ROOT}/config_components.h"\n',
      '  cp -- "${BUILD_ROOT}/ffmpeg/config_components.h" "${OUTPUT_ROOT}/config_components.h"\n' +
      '  cp -- "${BUILD_ROOT}/movenc.vpx-base.c" "${OUTPUT_ROOT}/movenc.vpx-base.c"\n' +
      '  cp -- "${BUILD_ROOT}/ffmpeg/libavformat/movenc.c" "${OUTPUT_ROOT}/movenc.vpx-aac.c"\n'],
  ]);
}
export function makeVpxAacWorkflow(source) {
  const base = makeVpxPreservingWorkflow(source).generated;
  return exact(base, [
    ["node media/ffmpeg/build-vpx-preserving-candidate.mjs", "node media/ffmpeg/build-vpx-aac-candidate.mjs"],
    ["name: private-vpx-preserving-${{ github.run_id }}", "name: private-vpx-aac-${{ github.run_id }}"],
    ["            work/ffmpeg-nondocker-output/within_remux.vpx-base.c\n",
      "            work/ffmpeg-nondocker-output/within_remux.vpx-base.c\n" +
      "            work/ffmpeg-nondocker-output/movenc.vpx-base.c\n            work/ffmpeg-nondocker-output/movenc.vpx-aac.c\n"],
  ]);
}

// Material timeline correction, separately selected from the already measured
// AAC-only candidate. No extra frame queues, allocations or codec threads.
export function makeVpxTimelineSource(source, options) {
  const base = makeVpxAacSource(source, options);
  const edits = [
    ["  int64_t next_pts;\n  int frame_rate_limited;\n",
      "  int64_t next_pts;\n  int preserve_source_timestamps;\n  AVRational input_time_base;\n" +
      "  int64_t first_source_pts;\n  int frame_rate_limited;\n"],
    ["    frame_to_encode->pts = pipeline->next_pts++;\n", `    if (pipeline->preserve_source_timestamps) {
      const int64_t source_pts = pipeline->decoded_frame->best_effort_timestamp;
      if (source_pts == AV_NOPTS_VALUE || pipeline->input_time_base.num <= 0 ||
          pipeline->input_time_base.den <= 0) {
        within_message(2, "Source video timestamps are unavailable; refusing to invent a timeline.");
        av_frame_unref(pipeline->decoded_frame);
        return AVERROR_INVALIDDATA;
      }
      if (pipeline->first_source_pts == AV_NOPTS_VALUE)
        pipeline->first_source_pts = source_pts;
      if (pipeline->frame_rate_limited) {
        frame_to_encode->pts = av_rescale_q(pipeline->first_source_pts,
            pipeline->input_time_base, pipeline->encoder->time_base) +
            av_rescale_q(pipeline->next_pts++, av_inv_q(pipeline->encoder->framerate),
                         pipeline->encoder->time_base);
      } else {
        frame_to_encode->pts = av_rescale_q(source_pts, pipeline->input_time_base,
                                           pipeline->encoder->time_base);
      }
    } else {
      frame_to_encode->pts = pipeline->next_pts++;
    }
`],
    ["  encoder->time_base = av_inv_q(frame_rate);\n  encoder->framerate = frame_rate;\n",
      "  // MPEG4's time increment denominator must fit16bits.60000 preserves\n" +
      "  // millisecond Matroska offsets and divides all offered output rates.\n" +
      "  encoder->time_base = webm ? av_inv_q(frame_rate) : (AVRational){1, 60000};\n  encoder->framerate = frame_rate;\n"],
    ["      .next_pts = 0,\n      .frame_rate_limited = av_cmp_q(frame_rate, source_frame_rate) < 0,\n",
      "      .next_pts = 0,\n      .preserve_source_timestamps = !webm,\n" +
      "      .input_time_base = input_stream->time_base,\n      .first_source_pts = AV_NOPTS_VALUE,\n" +
      "      .frame_rate_limited = av_cmp_q(frame_rate, source_frame_rate) < 0,\n"],
    ['          : "The MPEG-4 profile normalizes variable frame timing to the "\n            "source average frame rate.");\n',
      '          : "MPEG-4 preserves source timestamps; requested frame-rate "\n' +
      '            "reduction uses a source-aligned output clock.");\n'],
  ];
  const changed = exact(base.generated, edits);
  return { ...base, ...changed, edits: [...base.edits, ...changed.edits], preserveVideoTimeline: true, videoTimescale: 60000 };
}
export function makeVpxTimelineMuxSource(source, patch) {
  const base = makeVpxAacMuxSource(source, patch);
  const before = "    track->mode = mov->mode;\n    track->tag = MKTAG('t','e','x','t');\n";
  const after = "    track->mode = mov->mode;\n" +
    "    // The extra chapter track bypasses regular-stream timing init. Without\n" +
    "    // these sentinels its first positive DTS is mistaken for a continuation\n" +
    "    // from zero and the chapter's initial gap disappears in fragments.\n" +
    "    if (mov->mode == MODE_MP4 && (mov->flags & FF_MOV_FLAG_FRAGMENT)) {\n" +
    "        track->start_dts = AV_NOPTS_VALUE;\n        track->start_cts = AV_NOPTS_VALUE;\n" +
    "        track->end_pts = AV_NOPTS_VALUE;\n        track->dts_shift = AV_NOPTS_VALUE;\n    }\n" +
    "    track->tag = MKTAG('t','e','x','t');\n";
  const changed = exact(base.generated, [[before, after]]);
  return { ...base, ...changed, edits: [...base.edits, ...changed.edits], chapterTimingInitialized: true };
}
export function makeVpxTimelineRecipe(source) {
  const base = makeVpxAacRecipe(source).generated;
  return exact(base, [
    ['make-vpx-aac-candidate.mjs" "${BUILD_ROOT}/within_remux.c"', 'make-vpx-aac-candidate.mjs" --timeline "${BUILD_ROOT}/within_remux.c"'],
    ['make-vpx-aac-candidate.mjs" --mux "${BUILD_ROOT}/ffmpeg/libavformat/movenc.c"',
      'make-vpx-aac-candidate.mjs" --mux-timeline "${BUILD_ROOT}/ffmpeg/libavformat/movenc.c"'],
  ]);
}
export function makeVpxTimelineWorkflow(source) {
  const base = makeVpxAacWorkflow(source).generated;
  return exact(base, [
    ["node media/ffmpeg/build-vpx-aac-candidate.mjs", "WITHIN_PRIVATE_VPX_TIMELINE=1 node media/ffmpeg/build-vpx-aac-candidate.mjs"],
    ["name: private-vpx-aac-${{ github.run_id }}", "name: private-vpx-timeline-${{ github.run_id }}"],
  ]);
}
