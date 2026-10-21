import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeVpxPreservingSource, makeVpxPreservingRecipe, makeVpxPreservingWorkflow } from "../media/ffmpeg/vpx-preserving-candidate.mjs";

const source = await readFile("media/ffmpeg/within_remux.c", "utf8");
test("private preservation recipe changes only bounded MP4 audio/chapter policy, not codecs/I/O/heap", async () => {
  const recipe = makeVpxPreservingRecipe(await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"));
  assert.equal(recipe.edits.length, 1); assert.match(recipe.generated, /make-vpx-preserving-candidate.mjs/);
  assert.match(recipe.generated, /within_remux.vpx-base.c/); assert.equal(recipe.publicAcceptance, false);
  const derived = makeVpxPreservingSource(source, { masterSource: true });
  assert.equal(derived.edits.length, 6); assert.equal(derived.maxStreams, 64); assert.equal(derived.maxChapters, 1024);
  assert.match(derived.generated, /avformat_query_codec/); assert.match(derived.generated, /refusing to discard it/);
  assert.match(derived.generated, /mp4_audio_map\[input_packet->stream_index\]/);
  assert.match(derived.generated, /copy_chapters\(output_format, input_format\)/);
  assert.equal(derived.generated.slice(0, derived.generated.indexOf("static int within_video_reencode(")), source.slice(0, source.indexOf("static int within_video_reencode(")));
  assert.equal(derived.generated.slice(derived.generated.indexOf("static int within_video_to_mpeg4(")), source.slice(source.indexOf("static int within_video_to_mpeg4(")));
});
test("preserving workflow retains original pinned build SDK and adds only private dispatch/artifact", async () => {
  const source = await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"), generated = makeVpxPreservingWorkflow(source);
  assert.equal(generated.edits.length, 3); assert.match(generated.generated, /private-vpx-preserving-/);
  assert.match(generated.generated, /build-vpx-preserving-candidate.mjs/); assert.match(generated.generated, /retention-days: 1/);
});
test("preserving C refuses an unauthenticated source rather than changing unrelated native code", () => {
  assert.throws(() => makeVpxPreservingSource("not the actual compiled source"));
});
