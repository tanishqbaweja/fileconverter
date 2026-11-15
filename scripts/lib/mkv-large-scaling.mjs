// Native tools generate deterministic SOURCE fixtures and validate completed
// browser outputs only. No native conversion path is exposed by this module.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath, statfs } from "node:fs/promises";
import path from "node:path";
import { mkvHevcRegressionFixture } from "./mkv-exact-aac-staged-reference.mjs";
import { boundedNativeLines } from "./bounded-native-lines.mjs";
import { createFullVideoDecodeProgress, FULL_VIDEO_VALIDATOR_DEADLINE_MS } from "./mkv-full-video-decode.mjs";

export const MKV_SCALE_5GB = Object.freeze({ loops: 900, expectedVideoPackets: 259200,
  minimumBytes: 5000000000, maximumBytes: 6000000000, requiredDiskBytes: 18 * 1024 ** 3 });
export function assertLargeScalingExtent(bytes) {
  assert.ok(Number.isSafeInteger(bytes) && bytes >= MKV_SCALE_5GB.minimumBytes && bytes <= MKV_SCALE_5GB.maximumBytes,
    "This explicit >4GiB case requires genuine 5–6GB media, not smaller substituted data");
}
export function largeScalingFixtureArguments(source, file) {
  return ["-v", "error", "-n", "-copyts", "-stream_loop", String(MKV_SCALE_5GB.loops - 1), "-i", source,
    "-map", "0", "-c", "copy", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", file];
}
export async function createLargeMkvScalingSource(runtime) {
  const root = path.resolve(import.meta.dirname, "../.."), work = await realpath(path.join(root, "work"));
  assert.equal(path.dirname(await realpath(runtime.directory)), work);
  const disk = await statfs(root), availableBytes = disk.bavail * disk.bsize;
  assert.ok(availableBytes >= MKV_SCALE_5GB.requiredDiskBytes, "Insufficient space for real source plus ONE browser output and margin");
  const source = path.join(root, mkvHevcRegressionFixture.file), digest = createHash("sha256");
  assert.equal((await lstat(source)).size, mkvHevcRegressionFixture.bytes);
  for await (const b of createReadStream(source, { highWaterMark: 262144 })) digest.update(b);
  assert.equal(digest.digest("hex"), mkvHevcRegressionFixture.sha256);
  const file = path.join(runtime.directory, "within-test-scaled-hevc.mkv");
  await promisify(execFile)("C:/ffmpeg/bin/ffmpeg.exe", largeScalingFixtureArguments(source, file),
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 300000, maxBuffer: 2097152 });
  const info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink()); assertLargeScalingExtent(info.size);
  return { file, bytes: info.size, parent: mkvHevcRegressionFixture, ...MKV_SCALE_5GB,
    diskPreflight: { availableBytes, requiredBytes: MKV_SCALE_5GB.requiredDiskBytes },
    nativeToolUsedOnlyForFixtureGeneration: true, validMediaNotSparse: true, largeFileClaimed: true };
}

export async function decodeCompleteScalingContent(file, { cwd, env, expectedBytes, expectedSeconds, role, onProgress = () => {} }) {
  assertLargeScalingExtent(expectedBytes); assert.ok(["source", "browser-output"].includes(role));
  const work = await realpath(path.join(cwd, "work")), actual = await realpath(file), relative = path.relative(work, actual);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const before = await lstat(actual, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size === BigInt(expectedBytes));
  const parser = createFullVideoDecodeProgress(MKV_SCALE_5GB.expectedVideoPackets, expectedSeconds), hashes = new Map(), startedAt = Date.now();
  let lastProgress = null;
  const args = ["-v", "error", "-xerror", "-nostats", "-stats_period", "30", "-threads", "4", "-noautorotate", "-i", actual,
    "-map", "0:v:0", "-map", "0:a:0", "-c:v", "rawvideo", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough",
    "-c:a", "pcm_s16le", "-progress", "pipe:1", "-f", "streamhash", "-hash", "sha256", "pipe:1"];
  try {
    for await (const line of boundedNativeLines("ffmpeg", args, { cwd, env, timeoutMs: FULL_VIDEO_VALIDATOR_DEADLINE_MS })) {
      const match = /^(0,v|1,a),SHA256=([a-f0-9]{64})$/.exec(line);
      if (match) { assert.equal(hashes.has(match[1]), false); hashes.set(match[1], match[2]); continue; }
      const update = parser.line(line);
      if (update) {
        const elapsedMs = Date.now() - startedAt;
        lastProgress = { phase: `independent-full-scale-${role}-decode`, decodedFrames: update.frames,
          expectedFrames: MKV_SCALE_5GB.expectedVideoPackets, elapsedMs, finalProgressObserved: update.ended,
          estimatedRemainingMs: update.frames ? Math.round(elapsedMs * (MKV_SCALE_5GB.expectedVideoPackets - update.frames) / update.frames) : null };
        if (!update.ended && elapsedMs >= 25000) onProgress(lastProgress);
      }
    }
    assert.deepEqual([...hashes.keys()].sort(), ["0,v", "1,a"]);
    const after = await lstat(actual, { bigint: true });
    for (const key of ["dev", "ino", "size", "birthtimeNs", "mtimeNs"]) assert.equal(after[key], before[key]);
    return { status: "passed-complete-independent-scaling-content-decode", role, ...parser.finish(),
      decodedVideoSha256: hashes.get("0,v"), decodedPcmSha256: hashes.get("1,a"), decoderThreads: 4,
      elapsedMs: Date.now() - startedAt, deadlineMs: FULL_VIDEO_VALIDATOR_DEADLINE_MS,
      nativeToolUsedForConversion: false, fullMediaBufferCreated: false };
  } catch (error) {
    Object.defineProperty(error, "mkvScalingDecodeEvidence", { value: { role, lastProgress, elapsedMs: Date.now() - startedAt,
      completeDecodeClaimed: false, nativeToolUsedForConversion: false } }); throw error;
  }
}
