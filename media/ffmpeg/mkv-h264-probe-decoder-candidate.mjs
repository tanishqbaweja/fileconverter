// Source preparation only until separately compiled and browser-qualified.
// The decoder establishes reorder delay during bounded inspection, not a
// transcode: final media packets still use the unchanged stream-copy path.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { h264VfrWrapperSha256 } from "./mkv-h264-vfr-candidate.mjs";

export const h264ProbeDecoderBuildRef = "codex/mkv-h264-probe-decoder-native-20261114";
export const h264ProbeLibraryParentSha256 = "6414ea37233cf82ebb4cbac2352061ed830befbdf7eb395988b7c1e2d187f6cf";
export const h264ProbeWrapperSha256 = "a6987467063bf113ec2403955bdb3f7147c50bd72c1bf1a98ae0b3d4338fb98d";
export const h264ProbeLibrarySha256 = "49929353da80a2a42f49c5664ba3e9445b463a58a3dec2a4f22f9bc508a48857";
export const h264ProbeManifestSha256 = "16723e3b5e8e7a515851e0023b54b02847461d159810651f64ca24044416f536";
const manifestParent = "37bb34cb852d2a72784f1aa93cb67ae5e63c64395c314badc1c51976f5e6b012";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const exact = (source, before, after) => {
  assert.equal(source.split(before).length, 2, "Unique reviewed probe-decoder anchor required");
  const generated = source.replace(before, () => after);
  assert.equal(generated.split(after).length, 2);
  assert.equal(generated.replace(after, () => before), source);
  return generated;
};

export function makeH264ProbeDecoderLibraries(bytes) {
  assert.equal(sha(bytes), h264ProbeLibraryParentSha256);
  const before = "  ENABLED_PARSERS=aac,h264,hevc\n";
  const after = before + "  DECODER_CONFIGURE_FLAGS=(--enable-decoder=h264)\n";
  const generated = exact(bytes.toString("utf8"), before, after);
  assert.equal(sha(generated), h264ProbeLibrarySha256);
  return { generated, proof: { parentSha256: h264ProbeLibraryParentSha256, generatedSha256: sha(generated),
    enabledDecoders: ["h264"], exactReversal: true, copyOnlyBranchChanged: true, encodersAdded: false } };
}

export function makeH264ProbeDecoderWrapper(bytes) {
  assert.equal(sha(bytes), h264VfrWrapperSha256);
  const original = bytes.toString("utf8"), entry = original.indexOf("int within_remux(int profile) {");
  assert.ok(entry > 0);
  const before = "    result = avformat_find_stream_info(input_format, NULL);";
  const after = `    /* H.264 delay verification needs the decoder, limited to one thread.
       Snapshot the option count because inspection can discover more streams. */
    const unsigned int probe_stream_count = input_format->nb_streams;
    AVDictionary **probe_options =
        av_calloc(probe_stream_count, sizeof(*probe_options));
    if (!probe_options) {
      result = AVERROR(ENOMEM);
      goto cleanup;
    }
    result = 0;
    for (unsigned int index = 0; index < probe_stream_count; index++) {
      if (input_format->streams[index]->codecpar->codec_id == AV_CODEC_ID_H264) {
        result = av_dict_set(&probe_options[index], "threads", "1", 0);
        if (result < 0) break;
      }
    }
    if (result >= 0)
      result = avformat_find_stream_info(input_format, probe_options);
    for (unsigned int index = 0; index < probe_stream_count; index++)
      av_dict_free(&probe_options[index]);
    av_free(probe_options);`;
  const generated = original.slice(0, entry) + exact(original.slice(entry), before, after);
  assert.equal(sha(generated), h264ProbeWrapperSha256);
  return { generated, proof: { parentWrapperSha256: h264VfrWrapperSha256, candidateWrapperSha256: sha(generated),
    probeDecoderThreads: 1, probeOptionsFreedOnFailureAndSuccess: true, exactReversal: true,
    hevcTimingPolicyUnchanged: true, probeBoundsChanged: false, wasmBoundsChanged: false,
    finalPacketsReencoded: false, publicAcceptance: false } };
}

export function makeH264ProbeDecoderManifest(bytes) {
  assert.equal(sha(bytes), manifestParent);
  const before = '{"name": "within-direct",';
  const after = before + ' "enabledDecoders": ["h264"], "probeDecoderThreads": 1,';
  const generated = exact(bytes.toString("utf8"), before, after);
  assert.equal(sha(generated), h264ProbeManifestSha256);
  const source = JSON.parse(bytes), revised = JSON.parse(generated);
  const direct = revised.modules.find(module => module.name === "within-direct");
  assert.deepEqual(direct.enabledDecoders, ["h264"]);
  delete direct.enabledDecoders; delete direct.probeDecoderThreads;
  assert.deepEqual(revised, source);
  return generated;
}
