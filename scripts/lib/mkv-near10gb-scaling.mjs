// Separate finite near10GB source/validator scope. Older12MB/5GB/protected
// bounds and accepted proofs remain unchanged. Native tools NEVER convert.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath, statfs } from "node:fs/promises";
import path from "node:path";
import { mkvHevcRegressionFixture } from "./mkv-exact-aac-staged-reference.mjs";
import { hashDecodedMediaStream } from "./streamed-decoded-hash.mjs";
import { FULL_VIDEO_VALIDATOR_DEADLINE_MS } from "./mkv-full-video-decode.mjs";

export const MKV_SCALE_NEAR10GB = Object.freeze({ loops: 1600, expectedVideoPackets: 460800, expectedAudioPackets: 902400,
  minimumBytes: 9000000000, maximumBytes: 10200000000, requiredDiskBytes: 28 * 1024 ** 3 });
export function assertNear10GbExtent(bytes) {
  assert.ok(Number.isSafeInteger(bytes) && bytes >= MKV_SCALE_NEAR10GB.minimumBytes && bytes <= MKV_SCALE_NEAR10GB.maximumBytes,
    "Explicit near10GB case requires actual9–10.2GB media, not substituted smaller data");
}
export function near10GbFixtureArguments(source, file) {
  return ["-v", "error", "-n", "-copyts", "-stream_loop", "1599", "-i", source,
    "-map", "0", "-c", "copy", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", file];
}
export async function createNear10GbScalingSource(runtime) {
  const root = path.resolve(import.meta.dirname, "../.."), work = await realpath(path.join(root, "work"));
  assert.equal(path.dirname(await realpath(runtime.directory)), work);
  const disk = await statfs(root), availableBytes = disk.bavail * disk.bsize;
  assert.ok(availableBytes >= MKV_SCALE_NEAR10GB.requiredDiskBytes, "Insufficient source+ONE browser-output scratch plus margin");
  const source = path.join(root, mkvHevcRegressionFixture.file), hash = createHash("sha256");
  assert.equal((await lstat(source)).size, mkvHevcRegressionFixture.bytes);
  for await (const b of createReadStream(source, { highWaterMark: 262144 })) hash.update(b);
  assert.equal(hash.digest("hex"), mkvHevcRegressionFixture.sha256);
  const file = path.join(runtime.directory, "within-test-scaled-hevc.mkv");
  await promisify(execFile)("C:/ffmpeg/bin/ffmpeg.exe", near10GbFixtureArguments(source, file),
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 300000, maxBuffer: 2097152 });
  const info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink()); assertNear10GbExtent(info.size);
  return { file, bytes: info.size, parent: mkvHevcRegressionFixture, ...MKV_SCALE_NEAR10GB,
    diskPreflight: { availableBytes, requiredBytes: MKV_SCALE_NEAR10GB.requiredDiskBytes },
    nativeToolUsedOnlyForFixtureGeneration: true, validMediaNotSparse: true, largeFileClaimed: true };
}

export function near10GbExpectedPcmSamples(packets, skip, tail) {
  assert.equal(packets, MKV_SCALE_NEAR10GB.expectedAudioPackets); assert.equal(skip, 1024); assert.equal(tail, 0);
  return packets * 1024 - skip - tail; // pinned AAC-LC1024-sample frame configuration
}
export async function decodeNear10GbContent(file, { cwd, env, expectedBytes, expectedSeconds, expectedAudioSamples, role, onProgress = () => {} }) {
  assertNear10GbExtent(expectedBytes); assert.ok(["source", "browser-output"].includes(role));
  const actual = await realpath(file), work = await realpath(path.join(cwd, "work")), relative = path.relative(work, actual);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const before = await lstat(actual, { bigint: true }); assert.equal(before.size, BigInt(expectedBytes));
  assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.equal(expectedAudioSamples, near10GbExpectedPcmSamples(902400, 1024, 0));
  const startedAt = Date.now(), deadlineAt = startedAt + FULL_VIDEO_VALIDATOR_DEADLINE_MS;
  const options = { cwd, env, expectedFrames: MKV_SCALE_NEAR10GB.expectedVideoPackets, expectedSeconds, expectedAudioSamples };
  let lastProgress = null;
  try {
  const video = await hashDecodedMediaStream(actual, { ...options, kind: "video-1280x720-yuv420p", onProgress: p => {
    const elapsedMs = Date.now() - startedAt;
    lastProgress = { phase: `independent-near10gb-${role}-video`, decodedFrames: p.frames, expectedFrames: options.expectedFrames,
      elapsedMs, estimatedRemainingMs: p.frames ? Math.round(elapsedMs * (options.expectedFrames - p.frames) / p.frames) : null };
    onProgress(lastProgress);
  } });
  const remainingMs = deadlineAt - Date.now(); assert.ok(remainingMs > 0, "Full content validator deadline exceeded");
  const audio = await hashDecodedMediaStream(actual, { ...options, kind: "audio-48000-mono-s16le", timeoutMs: remainingMs });
  const after = await lstat(actual, { bigint: true });
  for (const key of ["dev", "ino", "size", "birthtimeNs", "mtimeNs"]) assert.equal(after[key], before[key]);
  return { status: "passed-complete-independent-scaling-content-decode", role, decodedFrames: video.decodedFrames,
    duplicateFrames: video.duplicateFrames, droppedFrames: video.droppedFrames, finalOutputTimeSeconds: video.finalOutputTimeSeconds,
    completedProgressReports: video.completedProgressReports, decodedVideoSha256: video.sha256, decodedPcmSha256: audio.sha256,
    decodedVideoBytes: video.bytes, decodedPcmBytes: audio.bytes, expectedAudioSamples,
    maximumDecodedReadChunkBytes: Math.max(video.maximumChunkBytes, audio.maximumChunkBytes), maximumRetainedDecodedChunks: 1,
    decoderThreads: 4, elapsedMs: Date.now() - startedAt, deadlineMs: FULL_VIDEO_VALIDATOR_DEADLINE_MS,
    retainedDecodedFrames: 0, decodedFileCreated: false, fullMediaBufferCreated: false, nativeToolUsedForConversion: false,
    hashMethod: "full decoded raw bytes through bounded local pipe into SHA-256; no media file" };
  } catch (error) {
    Object.defineProperty(error, "mkvScalingDecodeEvidence", { value: { role, lastProgress, elapsedMs: Date.now() - startedAt,
      completeDecodeClaimed: false, nativeToolUsedForConversion: false } }); throw error;
  }
}
