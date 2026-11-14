import assert from "node:assert/strict";
import test from "node:test";
import { createFullVideoDecodeProgress, FULL_VIDEO_VALIDATOR_DEADLINE_MS } from "../scripts/lib/mkv-full-video-decode.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

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

test("Protected browser success is not confused with the recorded ten-minute validator abort", async () => {
  const bytes = await readFile(new URL("../evidence/2026-11-14T09-10-47-838Z-mkv-exact-aac-protected-full-decode.json", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "c51851ce6f11e9c329093da83e3179137ea861f63b3a836b6bfcbdbd305b2347");
  const report = JSON.parse(bytes), [arm] = report.arms, [row] = arm.cases;
  assert.equal(report.status, "failed-not-acceptance");
  assert.equal(row.state, "complete");
  assert.equal(row.metrics.outputBytes, 2962151594);
  assert.equal(row.validation.outputSha256, "247c77c371340f8bfb090dc8f8cfde22d83ca1e83483672847013527c50d937b");
  assert.notEqual(row.validation.fullVideoDecode, true);
  assert.match(arm.failures[0], /^AbortError:.*aborted/s);
  assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && report.toolDownloadRemoved);
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.equal(FULL_VIDEO_VALIDATOR_DEADLINE_MS, 1800000);
  assert.equal(report.publicAcceptance, false);
});
