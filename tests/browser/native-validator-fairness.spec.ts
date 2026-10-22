import { expect, test } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { setImmediate as nextTurn } from "node:timers/promises";
import { boundedUtf8Lines } from "../../scripts/lib/bounded-native-lines.mjs";
import { compareStreamingVideoClocks } from "../../scripts/lib/streaming-video-clock-fidelity.mjs";

test("actual Playwright per-frame assertions do not starve observer I/O after bounded line scheduling", async () => {
  const frames = 1923, input = Buffer.from(Array.from({ length: frames }, (_, n) => "frame|best_effort_timestamp_time=" + n / 24).join("\n") + "\n");
  const measure = async (fair: boolean) => {
    const lines = fair ? boundedUtf8Lines([input]) : (async function* () { for (const line of input.toString().trim().split("\n")) yield line; })();
    const before = lines[Symbol.asyncIterator]();
    const after = (fair ? boundedUtf8Lines([input]) : (async function* () { for (const line of input.toString().trim().split("\n")) yield line; })())[Symbol.asyncIterator]();
    let count = 0, firstIoAt: number | null = null;
    const scheduled = nextTurn().then(() => { firstIoAt = count; });
    const start = performance.now();
    for (;;) {
      const [a, b] = await Promise.all([before.next(), after.next()]); expect(a.done).toBe(b.done); if (a.done) break;
      const timestamp = (line: string) => { const match = /^frame\|best_effort_timestamp_time=(-?[0-9.]+)/.exec(line); expect(match).toBeTruthy();
        const value = Number(match![1]); expect(Number.isFinite(value)).toBe(true); return value; };
      const error = Math.abs(timestamp(a.value) - timestamp(b.value!)); expect(error).toBeLessThan(.001); expect(++count).toBeLessThanOrEqual(frames);
    }
    const elapsedMs = performance.now() - start, ioDuringLoop = firstIoAt !== null;
    await scheduled;
    return { frames: count, elapsedMs, ioDuringLoop, firstIoAt };
  };
  const original = await measure(false);
  let consumed = 0, firstIoAt: number | null = null;
  const io = nextTurn().then(() => { firstIoAt = consumed; });
  const tracked = (async function* () { for await (const line of boundedUtf8Lines([input])) { consumed++; yield line; } })();
  const start = performance.now();
  const result = await compareStreamingVideoClocks(tracked, boundedUtf8Lines([input]), frames);
  const corrected = { frames: result.frames, elapsedMs: performance.now() - start, ioDuringLoop: firstIoAt !== null, firstIoAt };
  await io;
  console.log(JSON.stringify({ scope: "synthetic1923-frame-validator-scheduling-control-not-conversion-or-memory-acceptance", original, corrected }));
  expect(original.frames).toBe(frames); expect(original.ioDuringLoop).toBe(false);
  expect(corrected.frames).toBe(frames); expect(corrected.ioDuringLoop).toBe(true);
  expect(corrected.firstIoAt).toBeLessThanOrEqual(32);
});
