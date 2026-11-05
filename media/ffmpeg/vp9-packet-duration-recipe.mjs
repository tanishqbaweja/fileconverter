// Private source candidate only. Does not edit the canonical C or build a binary.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = text => createHash("sha256").update(text).digest("hex");
export function makeVp9PacketDurationSource(source) {
  assert.equal(typeof source, "string");
  for (const clock of ["encoder->time_base = av_inv_q(frame_rate);", "frame_to_encode->pts = pipeline->next_pts++;"])
    assert.equal(source.split(clock).length, 2, "The one-tick-per-frame CFR clock must remain established");
  const start = source.indexOf("static int write_video_packets(WithinVideoPipeline *pipeline,"),
    end = source.indexOf("static int drain_video_decoder(", start);
  assert.ok(start >= 0 && end > start);
  const before = source.slice(start, end), anchor = "    av_packet_rescale_ts(pipeline->encoded_packet,";
  assert.equal(before.split(anchor).length, 2);
  const insertion = "    /* This pipeline assigns one encoder-time-base tick per displayed CFR frame.\n" +
    "     * libvpx may leave duration unknown (zero); preserve every nonzero value. */\n" +
    "    if (pipeline->encoder->codec_id == AV_CODEC_ID_VP9 &&\n" +
    "        pipeline->encoded_packet->duration == 0) {\n" +
    "      pipeline->encoded_packet->duration = 1;\n" +
    "    }\n";
  const after = before.replace(anchor, insertion + anchor);
  assert.equal(source.split(before).length, 2);
  const generated = source.replace(before, after);
  assert.equal(generated.replace(after, before), source);
  return { generated, parentSha256: sha(source), generatedSha256: sha(generated), edits: [[before, after]],
    scope: "Private VP9 CFR zero-packet-duration candidate before timestamp rescaling",
    originalSourceUnchanged: true, otherCodecsAndNonzeroDurationsUnchanged: true,
    nativeBuildExecuted: false, browserValidated: false, publicAcceptance: false };
}
