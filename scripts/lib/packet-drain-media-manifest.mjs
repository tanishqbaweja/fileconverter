// Verify the intentional kernel/identity delta instead of copying unchecked metadata.
import assert from "node:assert/strict";
import { makePacketDrainKernel } from "../../media/ffmpeg/mpeg2-packet-drain-source.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export function verifyPacketDrainCache(parentCache, nativeCache, kernelSource) {
  const kernel = makePacketDrainKernel(kernelSource), expected = structuredClone(parentCache);
  assert.equal(expected.generatedKernel, kernel.parent);
  assert.equal(nativeCache.generatedKernel, kernel.generated);
  const pipeline = nativeCache.generatedPipeline;
  assert.equal(pipeline.edits.length, 1);
  const [before, after] = pipeline.edits[0];
  assert.match(before, /^file:\/\/.*\/media\/ffmpeg\/mpeg2-packet-largest-idle-source\.mjs$/);
  assert.equal(after, before.replace(/mpeg2-packet-largest-idle-source\.mjs$/, "mpeg2-packet-drain-source.mjs"));
  assert.equal(pipeline.parentSha256, sha(expected.generatedPipeline.generated));
  assert.deepEqual(pipeline, exactPatch(expected.generatedPipeline.generated, [[before, after]]));
  expected.generatedPipeline = pipeline;
  expected.generatedKernel = kernel.generated;
  // Bridge/refcounts/lifecycle results/bounds and all other cache fields remain exact.
  assert.deepEqual(expected, nativeCache);
  return expected;
}
