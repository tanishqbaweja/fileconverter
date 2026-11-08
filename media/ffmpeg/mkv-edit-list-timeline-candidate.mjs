// Private source derivation only. No released source, binary, registry or
// runtime calls this function. A browser control must verify its clock effect.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const directWrapperSha256 = "cb93f934f0abd64b625fa34a766546f9265f8c77fae4c0be2c0c54b971941bce";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const from = `  } else {
    av_dict_set(&muxer_options, "movflags",
                "frag_keyframe+empty_moov+default_base_moof", 0);
  }
  result = avformat_write_header(output_format, &muxer_options);`;
const to = `  } else {
    /* Private native profile 1: serialize track edits after seeing the first
       fragment, rather than rebasing all tracks around negative video DTS. */
    output_format->avoid_negative_ts = AVFMT_AVOID_NEG_TS_DISABLED;
    av_dict_set(&muxer_options, "movflags",
                "frag_keyframe+delay_moov+default_base_moof", 0);
    av_dict_set(&muxer_options, "use_editlist", "1", 0);
  }
  result = avformat_write_header(output_format, &muxer_options);`;

export function makeMkvEditListTimelineCandidate(source) {
  assert.equal(sha(source), directWrapperSha256, "Exact published direct wrapper required");
  const text = source.toString("utf8"), entry = text.indexOf("int within_remux(int profile) {");
  assert.ok(entry > 0);
  const prefix = text.slice(0, entry), body = text.slice(entry);
  assert.match(body, /\(void\)profile;\s+profile = 1;/);
  assert.equal(body.split(from).length, 2, "The direct entry needs one reviewed mux setup");
  const revised = body.replace(from, () => to), generated = prefix + revised;
  assert.equal(revised.split(to).length, 2);
  assert.equal(prefix + revised.replace(to, () => from), text, "Every non-mux-policy byte must round-trip");
  return { generated, proof: { baseWrapperSha256: directWrapperSha256, candidateWrapperSha256: sha(generated),
    nativeProfile: 1, useEditList: true, automaticNegativeTimestampShift: false,
    flags: ["frag_keyframe", "delay_moov", "default_base_moof"],
    exactReversal: true, otherWrapperSourceChanged: false, compilerOrLibraryChanged: false,
    candidateBuildRun: false, browserTimelineVerified: false, firstFragmentMemoryVerified: false, publicAcceptance: false } };
}
