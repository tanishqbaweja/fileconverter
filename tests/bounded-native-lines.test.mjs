import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import { boundedUtf8Lines } from "../scripts/lib/bounded-native-lines.mjs";

test("ready native stdout lines service observer I/O between at most32 lines without omission or reordering", async () => {
  const expected = Array.from({ length: 1000 }, (_, i) => "frame|best_effort_timestamp_time=" + i), received = [];
  let firstIoAt = null;
  const io = nextTurn().then(() => { firstIoAt = received.length; });
  for await (const line of boundedUtf8Lines([Buffer.from(expected.join("\n") + "\n")])) received.push(line);
  await io;
  assert.deepEqual(received, expected);
  assert.ok(firstIoAt > 0 && firstIoAt <= 32, "Observer pipe callbacks must not wait for the full ready chunk");
});

test("bounded UTF8 native lines preserve split Unicode, CRLF and final unterminated lines", async () => {
  const input = Buffer.from("packet|title=café 音楽\r\n\nfinal|value=✓"), chunks = [];
  for (let i = 0; i < input.length; i++) chunks.push(input.subarray(i, i + 1));
  const result = []; for await (const line of boundedUtf8Lines(chunks)) result.push(line);
  assert.deepEqual(result, ["packet|title=café 音楽", "final|value=✓"]);
});

test("fair validator parser retains hard chunk/line/unfinished-line and invalid-UTF8 failures", async () => {
  for (const chunks of [[Buffer.alloc(262145)], [Buffer.from("x".repeat(4097) + "\n")],
    [Buffer.from("x".repeat(4097))], [Buffer.from([0xc3])]]) {
    await assert.rejects(async () => { for await (const line of boundedUtf8Lines(chunks)) assert.ok(line); });
  }
});
