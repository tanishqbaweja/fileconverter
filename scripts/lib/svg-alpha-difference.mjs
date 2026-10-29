// Bounded independent validation of decoded diagnostic PNGs, never a converter.
import assert from "node:assert/strict";
export function summarizeSvgAlphaDifference({ output, reference, width, height, samples = [] }) {
  assert.ok(Number.isSafeInteger(width) && width > 0 && width <= 960);
  assert.ok(Number.isSafeInteger(height) && height > 0 && height <= 540);
  assert.ok(output instanceof Uint8Array && reference instanceof Uint8Array);
  assert.equal(output.length, width * height * 4); assert.equal(reference.length, output.length);
  assert.ok(Array.isArray(samples) && samples.length <= 64);
  const pixel = (data, x, y) => [...data.subarray((width * y + x) * 4, (width * y + x) * 4 + 4)];
  const fixedSamples = samples.map(({ kind, x, y }) => {
    assert.ok(typeof kind === "string" && kind.length <= 32);
    assert.ok(Number.isSafeInteger(x) && x >= 0 && x < width && Number.isSafeInteger(y) && y >= 0 && y < height);
    return { kind, x, y, referenceRgba: pixel(reference, x, y), outputRgba: pixel(output, x, y) };
  });
  const referenceHistogram = new Uint32Array(256), outputHistogram = new Uint32Array(256), differenceCounts = new Uint32Array(256);
  let mismatchedPixels = 0, maximumAbsoluteError = 0, referenceTransparentPixels = 0, referencePartialPixels = 0;
  const worstPixels = [];
  for (let index = 0; index < width * height; index++) {
    const at = index * 4 + 3, actual = output[at], expected = reference[at], difference = Math.abs(actual - expected);
    referenceHistogram[expected]++; outputHistogram[actual]++; differenceCounts[difference]++;
    if (difference) mismatchedPixels++; maximumAbsoluteError = Math.max(maximumAbsoluteError, difference);
    if (expected === 0) referenceTransparentPixels++; if (expected > 0 && expected < 255) referencePartialPixels++;
    if (difference && (worstPixels.length < 12 || difference > worstPixels[worstPixels.length - 1].absoluteError)) {
      const x = index % width, y = Math.floor(index / width);
      worstPixels.push({ x, y, absoluteError: difference, referenceRgba: pixel(reference, x, y), outputRgba: pixel(output, x, y) });
      worstPixels.sort((a, b) => b.absoluteError - a.absoluteError); if (worstPixels.length > 12) worstPixels.pop();
    }
  }
  return { comparedPixels: width * height, mismatchedPixels, maximumAbsoluteError, referenceTransparentPixels, referencePartialPixels,
    referenceHistogram: [...referenceHistogram], outputHistogram: [...outputHistogram], differenceCounts: [...differenceCounts],
    fixedSamples, worstPixels, maximumRetainedSamples: 64, maximumRetainedWorstPixels: 12 };
}
