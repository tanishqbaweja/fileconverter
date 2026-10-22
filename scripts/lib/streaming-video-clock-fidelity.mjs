import assert from "node:assert/strict";

// Every source/output frame is checked; no sampled clocks or relaxed tolerance.
// Native assert avoids thousands of Playwright reporter steps that starve its
// observer pipe. The bounded line producer also yields to real I/O every32 rows.
export async function compareStreamingVideoClocks(beforeIterable, afterIterable, expectedFrames) {
  assert.ok(Number.isSafeInteger(expectedFrames) && expectedFrames > 0 && expectedFrames <= 10000000);
  const before = beforeIterable[Symbol.asyncIterator](), after = afterIterable[Symbol.asyncIterator]();
  let count = 0, maximumError = 0;
  const timestamp = line => {
    assert.ok(typeof line === "string" && line.length <= 4096);
    const match = /^frame\|best_effort_timestamp_time=(-?[0-9.]+)/.exec(line);
    assert.ok(match, "Unavailable video frame timestamp");
    const value = Number(match[1]); assert.ok(Number.isFinite(value), "Nonfinite video frame timestamp"); return value;
  };
  try {
    for (;;) {
      const [a, b] = await Promise.all([before.next(), after.next()]);
      assert.equal(a.done, b.done, "Video frame count changed"); if (a.done) break;
      const error = Math.abs(timestamp(a.value) - timestamp(b.value)); maximumError = Math.max(maximumError, error);
      assert.ok(error < 0.001, "Video frame clock changed at frame " + count);
      assert.ok(++count <= expectedFrames, "Unexpected additional video frames");
    }
  } finally { await Promise.allSettled([before.return?.(), after.return?.()]); }
  assert.equal(count, expectedFrames, "Decoded video frame count differs from independent source probe");
  return { frames: count, maximumVideoPtsErrorSeconds: maximumError };
}
