// Independent validator buffers only, never conversion or browser I/O.
export function compareExactRgbaBuffers(actual, expected, expectedBytes) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes % 4 !== 0 || expectedBytes > 32 * 1048576)
    throw new RangeError("Independent RGBA frame exceeds its exact bounded size");
  if (!Buffer.isBuffer(actual) || !Buffer.isBuffer(expected)) throw new TypeError("Independent decoder must return byte buffers");
  const started = performance.now();
  const equal = actual.length === expectedBytes && expected.length === expectedBytes && actual.equals(expected);
  return { equal, comparisonMs: performance.now() - started, expectedBytes };
}
