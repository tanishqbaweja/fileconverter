// Next PRIVATE source candidate. Compilation/browser verification still required.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeVp9PacketDurationSource } from "./vp9-packet-duration-recipe.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
export function makeVp9StreamDurationSource(source) {
  const packets = makeVp9PacketDurationSource(source);
  const start = packets.generated.indexOf("  encoder->time_base = av_inv_q(frame_rate);"),
    end = packets.generated.indexOf("  AVStream *audio_input_stream = NULL;", start);
  assert.ok(start > 0 && end > start, "Exact CFR video stream setup required");
  const before = packets.generated.slice(start, end);
  assert.equal(before.split("encoder->framerate = frame_rate;").length, 2);
  const anchor = "  output_stream->time_base = encoder->time_base;\n";
  assert.equal(before.split(anchor).length, 2);
  const after = before.replace(anchor, anchor +
    "  /* Advertise the established CFR clock to the WebM muxer.\n" +
    "   * Packet duration alone does not populate Track DefaultDuration. */\n" +
    "  if (encoder->codec_id == AV_CODEC_ID_VP9) {\n" +
    "    output_stream->avg_frame_rate = encoder->framerate;\n" +
    "  }\n");
  const generated = packets.generated.replace(before, after), edits = [...packets.edits, [before, after]];
  let reverse = generated;
  for (const [oldText, newText] of edits.toReversed()) { assert.equal(reverse.split(newText).length, 2); reverse = reverse.replace(newText, oldText); }
  assert.equal(reverse, source);
  return { generated, edits, parentSha256: sha(source), generatedSha256: sha(generated),
    packetDurationCandidateSha256: packets.generatedSha256,
    scope: "Private VP9 CFR packet duration plus stream frame-rate metadata; existing encoder clock unchanged",
    investigation: "evidence/2026-11-05-webcodecs-vp9-duration-stored-timing-42013264823.json",
    muxerSource: "https://github.com/FFmpeg/FFmpeg/blob/n8.1.2/libavformat/matroskaenc.c#L1894-L1900",
    originalSourceUnchanged: true, codecSettingsChanged: false, ioChanged: false, memoryLimitsRaised: false,
    nativeBuildExecuted: false, browserValidated: false, publicAcceptance: false };
}
