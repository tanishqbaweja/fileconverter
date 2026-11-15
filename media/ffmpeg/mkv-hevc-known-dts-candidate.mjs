// Private derivative only. Preserve known HEVC clocks instead of synthesizing
// an entire nominal-CFR timeline; no published asset imports this module.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { h264StartupWrapperSha256, h264StartupPrefixSha256 } from "./mkv-h264-startup-candidate.mjs";

export const hevcKnownDtsBuildRef = "codex/mkv-hevc-known-dts-native-20261115";
export const hevcParserParentSha256 = "cc826ccb51e7aaa1d8c478ad8d2d6b1f09fd326da1aab55649d549d5fabaed34";
export const hevcKnownDtsWrapperSha256 = "5c0a8caa8f3efeb6a024aa6708694203a1529d1d099e9e5faababd5be05c4bb6";
export const hevcKnownDtsParserSha256 = "9f8f39654688c25e02deb95793b7128fbb4b68e3073a392ac795a232154e3752";
export const hevcKnownDtsPrefixSha256 = "6f7dd36f5d17ccde88dba43d47d0f732ca7c6998bd909021de8a7f9a93d18c8b";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const revise = (bytes, edits) => {
  const original = bytes.toString("utf8"); let generated = original;
  for (const [before, after] of edits) {
    assert.equal(generated.split(before).length, 2, "Unique reviewed HEVC clock anchor required: " + before.slice(0, 160));
    generated = generated.replace(before, () => after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) {
    assert.equal(reversed.split(after).length, 2);
    reversed = reversed.replace(after, () => before);
  }
  assert.equal(reversed, original);
  return generated;
};

export function makeHevcKnownDtsParser(bytes) {
  assert.equal(sha(bytes), hevcParserParentSha256, "Exact FFmpeg n8.1.2 HEVC parser required");
  const anchor = "    sps = pps->sps;\n";
  const exportDelay = `${anchor}
    /* Export the same validated SPS reorder depth as the HEVC decoder, but
       without allocating decoded pictures merely to recover stream clocks. */
    if (sps->max_sub_layers < 1 || sps->max_sub_layers > HEVC_MAX_SUB_LAYERS)
        return AVERROR_INVALIDDATA;
    avctx->has_b_frames = sps->temporal_layer[sps->max_sub_layers - 1].num_reorder_pics;
    if (avctx->has_b_frames < 0 || avctx->has_b_frames > 16)
        return AVERROR_INVALIDDATA;
`;
  const generated = revise(bytes, [[anchor, exportDelay]]);
  assert.equal(sha(generated), hevcKnownDtsParserSha256);
  return { generated, proof: { parentSha256: hevcParserParentSha256, generatedSha256: sha(generated),
    exactReversal: true, metadataOnly: true, maximumReorderDepth: 16, hevcDecoderAdded: false,
    upstreamParser: "https://github.com/FFmpeg/FFmpeg/blob/n8.1.2/libavcodec/hevc/parser.c",
    upstreamDecoderMetadata: "https://github.com/FFmpeg/FFmpeg/blob/n8.1.2/libavcodec/hevc/hevcdec.c#L316" } };
}

export function makeHevcKnownDtsCandidate(bytes) {
  assert.equal(sha(bytes), h264StartupWrapperSha256, "Exact accepted H.264 startup wrapper required");
  const forced = `    if (profile == 1 && selected_stream &&
        input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
        input_stream->codecpar->codec_id == AV_CODEC_ID_HEVC) {
      synthesize_video_dts[index] = 1;
    }`;
  const edits = [
    ["        stream->codecpar->codec_id == AV_CODEC_ID_H264 &&",
      "        (stream->codecpar->codec_id == AV_CODEC_ID_H264 ||\n         stream->codecpar->codec_id == AV_CODEC_ID_HEVC) &&"],
    [forced, "    /* H.264 and HEVC copy preserve verified demuxer clocks, including gaps. */"],
    ["        input_stream->codecpar->codec_id == AV_CODEC_ID_H264 &&",
      "        (input_stream->codecpar->codec_id == AV_CODEC_ID_H264 ||\n         input_stream->codecpar->codec_id == AV_CODEC_ID_HEVC) &&"],
    ["H.264 stream copy cannot preserve unverified or non-monotonic decode timestamps.",
      "H.264/HEVC stream copy cannot preserve unverified or non-monotonic decode timestamps."],
    ...prefixEdits,
  ];
  const generated = revise(bytes, edits);
  assert.equal(sha(generated), hevcKnownDtsWrapperSha256);
  return { generated, proof: { parentWrapperSha256: h264StartupWrapperSha256, candidateWrapperSha256: sha(generated),
    hevcKnownDtsPreserved: true, hevcNominalDtsSynthesis: false, hevcTimingPolicyUnchanged: false,
    hevcBoundedStreamInspection: true, existingPtsAndKnownDtsUnchanged: true,
    parentStartupPrefixSha256: h264StartupPrefixSha256, startupPrefixSha256: hevcKnownDtsPrefixSha256,
    onlyMissingStartupDtsGenerated: true, knownPacketClocksRewritten: false,
    nominalFrameRateUsedForStartup: false, packetClocksRewritten: true, exactReversal: true,
    probeBoundsChanged: false, startupBoundsChanged: false, wasmBoundsChanged: false,
    hevcDecoderAdded: false, finalPacketsReencoded: false, publicAcceptance: false } };
}

const prefixEdits = [
  ["stream_map[index] >= 0 && par->codec_id == AV_CODEC_ID_H264 &&",
    "stream_map[index] >= 0 &&\n          (par->codec_id == AV_CODEC_ID_H264 || par->codec_id == AV_CODEC_ID_HEVC) &&"],
  ["stream_map[index] < 0 || par->codec_id != AV_CODEC_ID_H264 ||",
    "stream_map[index] < 0 ||\n          (par->codec_id != AV_CODEC_ID_H264 && par->codec_id != AV_CODEC_ID_HEVC) ||"],
  ["Missing initial H.264 decode timestamps reconstructed", "Missing initial H.264/HEVC decode timestamps reconstructed"],
  ["H.264 startup decode timestamps could not be verified", "H.264/HEVC startup decode timestamps could not be verified"],
];
export function makeHevcKnownDtsPrefix(bytes) {
  assert.equal(sha(bytes), h264StartupPrefixSha256);
  const generated = revise(bytes, prefixEdits);
  assert.equal(sha(generated), hevcKnownDtsPrefixSha256);
  return { generated, sha256: sha(generated) };
}
