import assert from "node:assert/strict";
import { makeDurationDrainKernel } from "../../media/ffmpeg/mpeg2-duration-drain-source.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function verifyDurationDrainCache(originalCache, nativeCache, kernelSource) {
  const kernel = makeDurationDrainKernel(kernelSource), expected = structuredClone(originalCache);
  assert.equal(expected.generatedKernel, kernel.originalKernel);
  assert.equal(nativeCache.generatedKernel, kernel.generated);
  const pipeline = nativeCache.generatedPipeline;
  assert.equal(pipeline.edits.length, 1);
  const [before, after] = pipeline.edits[0];
  assert.match(before, /^file:\/\/.*\/media\/ffmpeg\/mpeg2-packet-drain-source\.mjs$/);
  assert.equal(after, before.replace(/mpeg2-packet-drain-source\.mjs$/, "mpeg2-duration-drain-source.mjs"));
  const originalHelper = before.replace(/mpeg2-packet-drain-source\.mjs$/, "mpeg2-packet-largest-idle-source.mjs");
  const queueRoute = exactPatch(expected.generatedPipeline.generated, [[originalHelper, before]]);
  const durationRoute = exactPatch(queueRoute.generated, [[before, after]]);
  assert.deepEqual(pipeline, durationRoute);
  expected.generatedPipeline = durationRoute; expected.generatedKernel = kernel.generated;
  assert.deepEqual(expected, nativeCache, "Only the proven kernel correction and two exact pipeline routes may differ");
  return expected;
}
