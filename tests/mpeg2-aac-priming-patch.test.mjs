import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Private fragmented AAC priming patch changes only edit-list trim arithmetic, not packet clocks or codecs", async () => {
  const patch = await source("media/ffmpeg/patches/mov-fragmented-aac-exact-priming.patch");
  assert.match(patch, /mov->mode == MODE_MP4/);
  assert.match(patch, /mov->flags & FF_MOV_FLAG_FRAGMENT/);
  assert.match(patch, /track->par->codec_id == AV_CODEC_ID_AAC/);
  assert.match(patch, /track->par->initial_padding > 0 && track->par->sample_rate > 0/);
  assert.match(patch, /av_rescale\(track->par->initial_padding/);
  assert.match(patch, /FFMAX\(start_ct, -FFMIN\(start_dts, 0\)\)/);
  assert.doesNotMatch(patch, /pkt->|av_packet|av_frame|avio_write\(|av_malloc|qmin|qmax|skip_frame|width\s*=|height\s*=/);
  const removed = patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && l !== "-");
  assert.deepEqual(removed, ["-        start_ct  = -FFMIN(start_dts, 0);"]);
});

test("AAC patch is pinned, bundled and tested against decoded audio before unchanged timing thresholds", async () => {
  const recipe = await source("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /e2d80222a7e8f4c42257540ed9ea011c6a8be7ac447cbf4ed60dae758319f509/);
  assert.match(recipe, /f93e901eef7867d56373d07afc32237e051f28cf64b2d9a0bca2474a36c0fcad/);
  assert.match(recipe, /mov-fragmented-aac-exact-priming.patch" source-bundle\//);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=33554432" "-sMAXIMUM_MEMORY=33554432"/);
  const checker = await source("scripts/verify-mpeg2-mov-patch.mjs");
  assert.match(checker, /assert.equal\(restored, metadataStage/);
  assert.match(checker, /runtime.close\(\)/);
  const browser = await source("tests/browser/mpeg2-artwork-candidate.spec.ts");
  assert.match(browser, /"pcm_s32le", "-f", "streamhash"/);
  assert.match(browser, /expect\(outputDecodedAudioHashes[\s\S]*?toEqual\(sourceDecodedAudioHashes\)/);
  assert.match(browser, /validateCopiedAudioTiming\(sourceAudioTimeline, outputAudioTimeline/);
  assert.match(browser, /Math.abs\(Number\(after.format.duration\) - Number\(before.format.duration\)\)\)\.toBeLessThan\(0.06\)/);
  assert.match(browser, /toBeLessThanOrEqual\(0.001\)/);
});
