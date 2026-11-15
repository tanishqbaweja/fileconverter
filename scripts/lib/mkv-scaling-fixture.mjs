// Native fixture-generation / independent source inspection only. The caller
// owns an approved disposable runtime and removes the entire source in finally.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { mkvHevcRegressionFixture } from "./mkv-exact-aac-staged-reference.mjs";
export async function createSmallMkvScalingLoop(runtime) {
  const root = path.resolve(import.meta.dirname, "../.."), source = path.join(root, mkvHevcRegressionFixture.file);
  const digest = createHash("sha256"); for await (const b of createReadStream(source, { highWaterMark: 262144 })) digest.update(b);
  assert.equal(digest.digest("hex"), mkvHevcRegressionFixture.sha256);
  const file = path.join(runtime.directory, "within-test-scaled-hevc.mkv");
  const args = ["-v", "error", "-n", "-copyts", "-stream_loop", "1", "-i", source,
    "-map", "0", "-c", "copy", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", file];
  await promisify(execFile)("C:/ffmpeg/bin/ffmpeg.exe", args,
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 });
  const bytes = (await lstat(file)).size; assert.ok(bytes > 8 * 1048576 && bytes < 16 * 1048576);
  return { file, bytes, parent: mkvHevcRegressionFixture, loops: 2, expectedVideoPackets: 576,
    nativeToolUsedOnlyForFixtureGeneration: true, validMediaNotSparse: true, largeFileClaimed: false };
}
