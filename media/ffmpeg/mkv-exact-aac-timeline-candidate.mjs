// Unpublished extension of the measured MKV clock fix. No codec re-encode or
// packet timestamp rewrite: retain explicit AAC priming for the MOV edit list.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeMkvEditListTimelineCandidate } from "./mkv-edit-list-timeline-candidate.mjs";
import { makeVpxAacMuxSource } from "./vpx-aac-candidate.mjs";

export const editListParentSha256 = "a55da1418f671f93932d97f879260763da74bf2e260a09914812d93869afab99";
export const exactAacWrapperSha256 = "eff90a4908b5fe0d37d56d1d142d823d1c389408e38a8fa415645344a389550c";
export const exactAacMovSha256 = "f927c6e1919a17186cade3b67565f4f418c3247b464e92f4f0a9eaeafdac1d6e";
export const exactAacBuildRef = "codex/mkv-edit-list-aac-native-20261108";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const anchor = `    AVRational packet_frame_rate = input_stream->avg_frame_rate;`;
const transfer = `    /* Preserve demuxer-declared AAC priming at sample precision before
       handing the first selected AAC packet to the delayed MP4 muxer.
       last_dts is per input stream and is still unset here on its first packet. */
    if (input_stream->codecpar->codec_id == AV_CODEC_ID_AAC &&
        last_dts[input_index] == AV_NOPTS_VALUE) {
      size_t skip_size = 0;
      const uint8_t *skip_data = av_packet_get_side_data(
          packet, AV_PKT_DATA_SKIP_SAMPLES, &skip_size);
      const int rate = input_stream->codecpar->sample_rate;
      const int header_padding = input_stream->codecpar->initial_padding;
      if ((skip_data && skip_size < 10) || rate <= 0 ||
          header_padding < 0 || header_padding > rate) {
        within_message(2, "AAC priming metadata is malformed or exceeds the bounded one-second limit.");
        av_packet_unref(packet);
        result = AVERROR_INVALIDDATA;
        goto cleanup;
      }
      const uint32_t skip = skip_data ? read_little_endian_uint32(skip_data)
                                      : (uint32_t)header_padding;
      if (skip > (uint32_t)rate ||
          (header_padding > 0 && skip != (uint32_t)header_padding)) {
        within_message(2, "AAC priming metadata conflicts or exceeds the bounded one-second limit.");
        av_packet_unref(packet);
        result = AVERROR_INVALIDDATA;
        goto cleanup;
      }
      output_stream->codecpar->initial_padding = (int)skip;
    }
`;

export function makeMkvExactAacTimelineCandidate(released) {
  const { generated: parent, proof } = makeMkvEditListTimelineCandidate(released);
  assert.equal(sha(parent), editListParentSha256);
  assert.equal(parent.split(anchor).length, 2);
  assert.match(parent, /static uint32_t read_little_endian_uint32\(/);
  assert.ok(parent.indexOf(anchor) < parent.indexOf("last_dts[input_index] = packet->dts;", parent.indexOf(anchor)));
  const generated = parent.replace(anchor, () => transfer + anchor);
  assert.equal(generated.split(transfer + anchor).length, 2);
  assert.equal(generated.replace(transfer + anchor, () => anchor), parent);
  assert.equal(sha(generated), exactAacWrapperSha256);
  return { generated, proof: { ...proof, candidateWrapperSha256: exactAacWrapperSha256,
    editListParentSha256, exactAacPriming: true, packetClocksRewritten: false,
    otherWrapperSourceChanged: true, compilerOrLibraryChanged: true,
    compilerSettingsChanged: false, extraPacketBuffering: false, exactAacSourceReversal: true } };
}

export function makeMkvExactAacMovSource(base, patch) {
  const { generated, generatedSha256, parentSha256, patchSha256 } = makeVpxAacMuxSource(base.toString("utf8"), patch.toString("utf8"));
  assert.equal(generatedSha256, exactAacMovSha256);
  return { generated, proof: { generatedSha256, parentSha256, patchSha256, exactReversal: true } };
}
