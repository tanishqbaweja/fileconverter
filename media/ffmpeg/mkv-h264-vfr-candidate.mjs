// Isolated extension of the exact-AAC candidate. Never patch a release in place.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { exactAacWrapperSha256 } from "./mkv-exact-aac-timeline-candidate.mjs";

export const h264VfrBuildRef = "codex/mkv-h264-vfr-native-20261114";
export const h264VfrWrapperSha256 = "02e6dcbac2160882132cd19606b0820a3f6aa0718cc800abf9caa5c741f2ce8a";
const sha = value => createHash("sha256").update(value).digest("hex");
const inspection = "  if (profile != 1 && inspect_stream_info) {";
const verifiedInspection = `  /* The H.264 parser must establish actual decode clocks before stream copy.
     The existing 2 MiB / two-second inspection limits still apply. Do not
     force VFR packets onto a nominal-frame-rate decode timeline. */
  int inspect_h264_timing = 0;
  for (unsigned int index = 0; index < input_format->nb_streams; index++) {
    const AVStream *stream = input_format->streams[index];
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
        stream->codecpar->codec_id == AV_CODEC_ID_H264 &&
        !(stream->disposition & AV_DISPOSITION_ATTACHED_PIC)) {
      inspect_h264_timing = 1;
    }
  }
  if ((profile == 1 && inspect_h264_timing) ||
      (profile != 1 && inspect_stream_info)) {`;
const forced = `    if (profile == 1 && selected_stream &&
        input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
        (input_stream->codecpar->codec_id == AV_CODEC_ID_H264 ||
         input_stream->codecpar->codec_id == AV_CODEC_ID_HEVC)) {
      synthesize_video_dts[index] = 1;
    }`;
const hevcOnly = `    if (profile == 1 && selected_stream &&
        input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
        input_stream->codecpar->codec_id == AV_CODEC_ID_HEVC) {
      synthesize_video_dts[index] = 1;
    }`;
const clock = "    AVRational packet_frame_rate = input_stream->avg_frame_rate;";
const safeClock = `    /* Refuse unknown/broken H.264 decode clocks rather than invent CFR DTS.
       Negative verified reorder DTS remains valid and is represented by edits. */
    if (profile == 1 &&
        input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
        input_stream->codecpar->codec_id == AV_CODEC_ID_H264 &&
        (packet->dts == AV_NOPTS_VALUE ||
         (last_dts[input_index] != AV_NOPTS_VALUE &&
          packet->dts <= last_dts[input_index]))) {
      within_message(2, "H.264 stream copy cannot preserve unverified or non-monotonic decode timestamps.");
      av_packet_unref(packet);
      result = AVERROR_INVALIDDATA;
      goto cleanup;
    }
${clock}`;

export function makeMkvH264VfrCandidate(parent) {
  assert.equal(sha(parent), exactAacWrapperSha256, "Exact independently tested AAC parent required");
  const original = parent.toString("utf8"), edits = [[inspection, verifiedInspection], [forced, hevcOnly], [clock, safeClock]];
  let generated = original;
  for (const [before, after] of edits) {
    assert.equal(generated.split(before).length, 2, "Unique reviewed H.264 timing anchor required");
    generated = generated.replace(before, () => after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) {
    assert.equal(reversed.split(after).length, 2);
    reversed = reversed.replace(after, () => before);
  }
  assert.equal(reversed, original);
  assert.equal(sha(generated), h264VfrWrapperSha256);
  return { generated, proof: { parentWrapperSha256: exactAacWrapperSha256, candidateWrapperSha256: sha(generated),
    h264VfrTiming: true, boundedH264Inspection: true, inspectionBytes: 2097152, inspectionMicroseconds: 2000000,
    h264NominalDtsSynthesis: false, missingH264DtsRejected: true, hevcTimingPolicyUnchanged: true,
    exactReversal: true, extraPacketBuffering: true,
    extraPacketBufferingScope: "existing bounded FFmpeg stream-info queue; no added wrapper queue",
    compilerSettingsChanged: false, publicAcceptance: false } };
}
