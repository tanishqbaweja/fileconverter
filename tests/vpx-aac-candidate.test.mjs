import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeVpxAacSource, makeVpxAacMuxSource, makeVpxAacRecipe, makeVpxAacWorkflow } from "../media/ffmpeg/vpx-aac-candidate.mjs";
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
