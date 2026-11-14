import assert from "node:assert/strict";
import test from "node:test";
import { createFullVideoDecodeProgress } from "../scripts/lib/mkv-full-video-decode.mjs";

const progress = (parser, frames, seconds, status = "end") => {
  for (const line of [`frame=${frames}`, `fps=24.0`, `out_time_us=${seconds * 1e6}`, "dup_frames=0", "drop_frames=0", "speed=15.0x", `progress=${status}`]) parser.line(line);
};
test("Full decode requires real terminal progress, exact frame count and timeline end", () => {
  const p = createFullVideoDecodeProgress(296160, 12340);
  progress(p, 240, 10, "continue"); assert.throws(() => p.finish(), /completion/);
  progress(p, 296160, 12340);
  assert.equal(p.finish().decodedFrames, 296160);
  assert.equal(p.finish().retainedDecodedFrames, 0);
  assert.throws(() => p.line("frame=296160"));
});
test("Full decode rejects truncation, fabricated frame drops, malformed values and a changed endpoint", () => {
  const truncated = createFullVideoDecodeProgress(296160, 12340);
  progress(truncated, 296159, 12340); assert.throws(() => truncated.finish(), /count changed/);
  const changed = createFullVideoDecodeProgress(296160, 12340);
  progress(changed, 296160, 12339); assert.throws(() => changed.finish(), /end changed/);
  assert.throws(() => createFullVideoDecodeProgress(4, 1).line("drop_frames=1"), /not drop/);
  assert.throws(() => createFullVideoDecodeProgress(4, 1).line("frame=N/A"));
  assert.throws(() => createFullVideoDecodeProgress(4, 1).line("frame=5"));
});
