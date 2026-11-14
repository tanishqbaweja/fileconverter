// Independent finished-output validation only. Native FFmpeg decodes to a null
// sink, never creates a media file. A bounded progress parser proves completion.
import assert from "node:assert/strict";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { boundedNativeLines } from "./bounded-native-lines.mjs";

const allowed = new Set(["frame", "fps", "stream_0_0_q", "bitrate", "total_size", "out_time_us", "out_time_ms", "out_time", "dup_frames", "drop_frames", "speed", "progress"]);

export function createFullVideoDecodeProgress(expectedFrames, expectedSeconds) {
  assert.ok(Number.isSafeInteger(expectedFrames) && expectedFrames > 0 && expectedFrames <= 10_000_000);
  assert.ok(Number.isFinite(expectedSeconds) && expectedSeconds > 0);
  let frames = null, outTimeUs = null, ended = false, reports = 0, duplicateFrames = null, droppedFrames = null;
  return {
    line(text) {
      assert.ok(typeof text === "string" && text.length <= 4096 && !ended);
      const at = text.indexOf("="); assert.ok(at > 0);
      const key = text.slice(0, at), value = text.slice(at + 1).trim();
      assert.ok(allowed.has(key), `Unexpected native progress field: ${key}`);
      if (["frame", "out_time_us", "dup_frames", "drop_frames"].includes(key)) {
        assert.match(value, /^\d+$/);
        const number = Number(value); assert.ok(Number.isSafeInteger(number));
        if (key === "frame") {
          assert.ok(number <= expectedFrames && (frames === null || number >= frames)); frames = number;
        } else if (key === "out_time_us") {
          assert.ok(outTimeUs === null || number >= outTimeUs); outTimeUs = number;
        } else { assert.equal(number, 0, "The full decode must not drop or duplicate frames");
          if (key === "dup_frames") duplicateFrames = number; else droppedFrames = number; }
      }
      if (key === "progress") {
        assert.ok(value === "continue" || value === "end");
        assert.ok(frames !== null && outTimeUs !== null && duplicateFrames === 0 && droppedFrames === 0);
        reports++; assert.ok(reports <= 600);
        ended = value === "end";
        return { frames, outTimeUs, ended };
      }
      return null;
    },
    finish() {
      assert.ok(ended && reports > 0, "No genuine native decode completion");
      assert.equal(frames, expectedFrames, "Full decoded frame count changed");
      assert.ok(Math.abs(outTimeUs / 1e6 - expectedSeconds) <= 1 / 24, "Full decoded timeline end changed");
      return { decodedFrames: frames, finalOutputTimeSeconds: outTimeUs / 1e6, duplicateFrames, droppedFrames,
        completedProgressReports: reports, retainedDecodedFrames: 0, decodedFileCreated: false };
    },
  };
}

export async function decodeCompleteProtectedVideo(file, { cwd, env, onProgress = () => {} }) {
  const work = await realpath(path.join(cwd, "work")), actual = await realpath(file), relative = path.relative(work, actual);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const before = await lstat(actual, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size === 2962151594n);
  const parser = createFullVideoDecodeProgress(296160, 12340), startedAt = Date.now();
  const args = ["-v", "error", "-xerror", "-nostats", "-stats_period", "30", "-threads", "4", "-i", actual,
    "-map", "0:v:0", "-an", "-fps_mode", "passthrough", "-progress", "pipe:1", "-f", "null", "-"];
  for await (const line of boundedNativeLines("ffmpeg", args, { cwd, env, timeoutMs: 600000 })) {
    const update = parser.line(line);
    if (update && !update.ended && Date.now() - startedAt >= 25000) {
      const elapsedMs = Date.now() - startedAt;
      onProgress({ phase: "independent-full-video-decode", decodedFrames: update.frames, expectedFrames: 296160,
        elapsedMs, estimatedRemainingMs: update.frames > 0 ? Math.round(elapsedMs * (296160 - update.frames) / update.frames) : null });
    }
  }
  const after = await lstat(actual, { bigint: true });
  for (const key of ["dev", "ino", "size", "birthtimeNs", "mtimeNs"]) assert.equal(after[key], before[key], "Finished browser output changed during decode");
  return { status: "passed-complete-independent-video-decode", ...parser.finish(), decoderThreads: 4,
    elapsedMs: Date.now() - startedAt, maximumProgressLineBytes: 4096, maximumProgressReports: 600,
    nativeToolUsedForConversion: false };
}
