// PRIVATE output-only link-surface reduction, not a codec/settings/memory change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha=s=>createHash("sha256").update(s).digest("hex");
export const VP9_CPU_SPECIALIST_INPUTS=Object.freeze({
  DECODER:Object.freeze(["h263","h264","hevc","mpeg2video","mpeg4","theora","vp3","aac","alac","amrnb","amrwb","flac","mp3","opus","vorbis","wmav1","wmav2","pcm_s16be","pcm_s16le"]),
  DEMUXER:Object.freeze(["aac","aiff","amr","asf","avi","flac","flv","h264","hevc","ivf","m4v","matroska","mov","mp3","mpegts","mpegvideo","ogg","wav"]),
  PARSER:Object.freeze(["aac","ac3","av1","flac","h264","hevc","mpeg4video","mpegaudio","mpegvideo","opus","vorbis"]),
  BSF:Object.freeze(["aac_adtstoasc","av1_metadata","extract_extradata","h264_mp4toannexb","hevc_mp4toannexb","pgs_frame_merge","vp9_superframe","vvc_mp4toannexb"]),
});
function derive(source,parents,edits) {
  assert.ok(parents.includes(sha(source)),"Exact pinned parent required for private VP9 specialist");
  let generated=source;
  for(const [before,after]of edits){assert.equal(generated.split(before).length,2);generated=generated.replace(before,after);}
  let reversed=generated;for(const [before,after]of edits.toReversed()){assert.equal(reversed.split(after).length,2);reversed=reversed.replace(after,before);}assert.equal(reversed,source);
  return {generated,parentSha256:sha(source),generatedSha256:sha(generated),edits,inputCodecAndContainerSupportChanged:false,
    codecSettingsChanged:false,ioChanged:false,memoryLimitsRaised:false,actualMemorySavedBytes:null,
    nativeBuildExecuted:false,browserValidated:false,speedGainProven:false,publicAcceptance:false};
}
export function makeVp9CpuSpecialistLibraries(source) {
  const before="emconfigure ./configure \\\n";
  // Retain automatically selected input helpers explicitly. In attempt14 the
  // removal of unrelated muxers also removed AC3_PARSER; the native inventory
  // guard correctly rejected it. Do not weaken that guard or input support.
  const after="# Private VP9 output-only specialist; all baseline input components retained.\n"+
    "ENABLED_MUXERS=webm\nENCODER_CONFIGURE_FLAGS=(--enable-encoder=libvpx_vp9)\n"+
    "ENABLED_PARSERS="+VP9_CPU_SPECIALIST_INPUTS.PARSER.join(",")+"\n"+
    "ENABLED_BSFS="+VP9_CPU_SPECIALIST_INPUTS.BSF.join(",")+"\n"+before;
  return {...derive(source,["daea3a61ffa77d4728517e642773fbd72261a31c79524618088ee491557e2600"],[[before,after]]),
    outputEncoders:["libvpx_vp9"],outputMuxers:["webm"],expectedInputComponents:VP9_CPU_SPECIALIST_INPUTS};
}
export function makeVp9CpuSpecialistWrapper(source) {
  const before="int within_remux(int profile, int audio_bit_rate, int audio_sample_rate,\n"+
    "                 int audio_channels, int audio_codec,\n"+
    "                 int audio_compression, int audio_quality, int video_codec,\n"+
    "                 int video_max_width, int video_bit_rate,\n"+
    "                 int video_frame_rate, int video_quality) {\n";
  const after=before+"  /* Private specialist must never serve unrelated public conversion jobs. */\n"+
    "  if (profile != 10 && profile != 11) return AVERROR(EINVAL);\n";
  return {...derive(source,["480532d89a4b4f696fced0faaa7be4f29cdbe7a71b990c69dfd2ddef6d346aa6","d069ed11f87eb9c4a2419a9226b2a45bc938b7d6a61622fc22ebb40cca9a72d0"],[[before,after]]),
    allowedProfiles:[10,11],unrelatedProfileRejectedBeforeIo:true};
}
