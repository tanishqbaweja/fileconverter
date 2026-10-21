import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeVpxAacSource, makeVpxAacMuxSource, makeVpxAacRecipe, makeVpxAacWorkflow,
  makeVpxTimelineSource, makeVpxTimelineRecipe, makeVpxTimelineWorkflow } from "../media/ffmpeg/vpx-aac-candidate.mjs";
import { makeVpxPreservingSource } from "../media/ffmpeg/vpx-preserving-candidate.mjs";
test("isolated exact AAC correction preserves zero/positive packet clocks and existing bounded negative-preroll precision", async () => {
  const source = await readFile("media/ffmpeg/within_remux.c", "utf8"), derived = makeVpxAacSource(source, { masterSource: true });
  assert.equal(derived.edits.length, 8); assert.equal(derived.maxStreams, 64); assert.equal(derived.maxFragmentBytes, 1048576);
  const [before, after] = derived.edits.at(-1);
  assert.equal(derived.generated.replace(after, before), makeVpxPreservingSource(source, { masterSource: true }).generated);
  assert.match(after, /header_padding > 0 && skip !=/); assert.match(after, /destination->codecpar->initial_padding = \(int\)skip/);
  assert.match(after, /if \(input_packet->dts < 0\)/); assert.doesNotMatch(after, /input_packet->(?:pts|dts|duration)\s*=(?!=)/);
  assert.match(after, /side_size < 10/); assert.match(after, /skip > \(uint32_t\)rate/);
  assert.doesNotMatch(after, /av_packet_unref|av_packet_new_side_data|av_malloc|qmin|width\s*=/);
  assert.equal(derived.exactAacEditList, true); assert.equal(derived.publicAcceptance, false);
  assert.throws(() => makeVpxAacSource(source + "\n", { masterSource: true }));
});
test("new build derives only private wrapper/mux and retains source outputs plus original SDK/cleanup policy", async () => {
  const recipe = makeVpxAacRecipe(await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"));
  assert.equal(recipe.edits.length, 3); assert.match(recipe.generated, /make-vpx-aac-candidate.mjs\" --mux/);
  assert.match(recipe.generated, /movenc.vpx-aac.c/); assert.match(recipe.generated, /movenc.vpx-base.c/);
  const workflow = makeVpxAacWorkflow(await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"));
  assert.equal(workflow.edits.length, 3); assert.match(workflow.generated, /private-vpx-aac-/);
  assert.match(workflow.generated, /build-vpx-aac-candidate.mjs/); assert.match(workflow.generated, /retention-days: 1/);
});
test("exact AAC mux derivation refuses unauthenticated source and patch", async () => {
  const patch = await readFile("media/ffmpeg/patches/mov-fragmented-aac-exact-priming.patch", "utf8");
  assert.throws(() => makeVpxAacMuxSource("not the pinned FFmpeg source", patch));
});
test("timeline variant preserves source timestamps without queues and only changes the MPEG4 timing timebase", async () => {
  const source = await readFile("media/ffmpeg/within_remux.c", "utf8"), base = makeVpxAacSource(source, { masterSource: true });
  const derived = makeVpxTimelineSource(source, { masterSource: true });
  assert.equal(derived.edits.length, 13); assert.equal(derived.videoTimescale, 60000); assert.equal(derived.preserveVideoTimeline, true);
  let restored = derived.generated;
  for (const [before, after] of derived.edits.slice(base.edits.length).toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, base.generated);
  const added = derived.edits.slice(base.edits.length).map(([, after]) => after).join("\n");
  assert.match(added, /decoded_frame->best_effort_timestamp/);
  assert.match(added, /av_rescale_q\(source_pts, pipeline->input_time_base/);
  assert.match(added, /av_rescale_q\(pipeline->first_source_pts/);
  assert.match(added, /pipeline->frame_rate_limited/); assert.match(added, /\.preserve_source_timestamps = !webm/);
  assert.match(added, /webm \? av_inv_q\(frame_rate\) : \(AVRational\)\{1, 60000\}/);
  assert.match(added, /refusing to invent a timeline/);
  assert.doesNotMatch(added, /av_malloc|av_frame_alloc|qmin|qmax|thread_count|bit_rate\s*=/);
  for (const fps of [15, 24, 25, 30]) assert.equal(derived.videoTimescale % fps, 0);
  assert.ok(derived.videoTimescale <= 65535);
});
test("timeline variant selects distinct private recipe and artifact while leaving the original AAC build available", async () => {
  const source = await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"), recipe = makeVpxTimelineRecipe(source);
  assert.equal(recipe.edits.length, 2); assert.match(recipe.generated, /--timeline/); assert.match(recipe.generated, /--mux-timeline/);
  assert.doesNotMatch(makeVpxAacRecipe(source).generated, /--mux-timeline/);
  const workflow = makeVpxTimelineWorkflow(await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"));
  assert.equal(workflow.edits.length, 2); assert.match(workflow.generated, /WITHIN_PRIVATE_VPX_TIMELINE=1 node/);
  assert.match(workflow.generated, /private-vpx-timeline-/); assert.equal(workflow.publicAcceptance, false);
});
