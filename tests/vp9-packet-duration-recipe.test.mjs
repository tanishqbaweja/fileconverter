import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { makeVp9PacketDurationSource } from "../media/ffmpeg/vp9-packet-duration-recipe.mjs";
const file = new URL("../media/ffmpeg/within_remux.c", import.meta.url), source = await readFile(file, "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
test("private duration candidate is one exact reversible VP9-only edit without touching canonical native source", async () => {
  const candidate = makeVp9PacketDurationSource(source);
  assert.equal(candidate.edits.length, 1); assert.equal(candidate.parentSha256, sha(source));
  assert.equal(candidate.generatedSha256, sha(candidate.generated));
  assert.ok(candidate.generated.includes("pipeline->encoder->codec_id == AV_CODEC_ID_VP9 &&\n        pipeline->encoded_packet->duration == 0"));
  const [before, after] = candidate.edits[0]; assert.equal(candidate.generated.replace(after, before), source);
  assert.ok(after.indexOf("pipeline->encoded_packet->duration = 1;") < after.indexOf("av_packet_rescale_ts"));
  assert.ok(!before.includes("duration = 1;")); assert.equal(await readFile(file, "utf8"), source);
  assert.equal(candidate.nativeBuildExecuted, false); assert.equal(candidate.browserValidated, false); assert.equal(candidate.publicAcceptance, false);
});
test("duration source recipe refuses absent, duplicated or changed CFR clock anchors", () => {
  for (const mutation of [source.replace("encoder->time_base = av_inv_q(frame_rate);", "encoder->time_base = other;"),
    source.replace("frame_to_encode->pts = pipeline->next_pts++;", "frame_to_encode->pts = source_pts;"),
    source + "\nframe_to_encode->pts = pipeline->next_pts++;\n"])
    assert.throws(() => makeVp9PacketDurationSource(mutation));
});
test("candidate retains all non-video-wrapper bytes and cannot patch an audio packet rescale", () => {
  const candidate = makeVp9PacketDurationSource(source), [[before, after]] = candidate.edits;
  const offset = source.indexOf(before);
  assert.equal(candidate.generated.slice(0, offset), source.slice(0, offset));
  assert.equal(candidate.generated.slice(offset + after.length), source.slice(offset + before.length));
  assert.match(before, /^static int write_video_packets/); assert.equal(candidate.otherCodecsAndNonzeroDurationsUnchanged, true);
});
