// INDEPENDENT native validation only, never application conversion. Raw decoded
// bytes pass through one bounded local stdout pipe directly into SHA-256 and
// are discarded; no decoded media file, chunk array, Blob or network transport.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { boundedUtf8Lines } from "./bounded-native-lines.mjs";
import { createFullVideoDecodeProgress } from "./mkv-full-video-decode.mjs";

export function createDecodedByteHash({ expectedBytes = null, maximumBytes }) {
  assert.ok(Number.isSafeInteger(maximumBytes) && maximumBytes > 0);
  assert.ok(expectedBytes === null || Number.isSafeInteger(expectedBytes) && expectedBytes > 0 && expectedBytes <= maximumBytes);
  const hash = createHash("sha256"); let bytes = 0, maximumChunkBytes = 0, ended = false;
  return {
    chunk(chunk) {
      assert.equal(ended, false); assert.ok(chunk instanceof Uint8Array && chunk.byteLength > 0 && chunk.byteLength <= 262144);
      bytes += chunk.byteLength; assert.ok(Number.isSafeInteger(bytes) && bytes <= maximumBytes, "Decoded byte extent exceeded");
      hash.update(chunk); maximumChunkBytes = Math.max(maximumChunkBytes, chunk.byteLength);
    },
    finish() {
      assert.equal(ended, false); ended = true; assert.ok(bytes > 0);
      if (expectedBytes !== null) assert.equal(bytes, expectedBytes, "Full decoded byte count changed");
      return { sha256: hash.digest("hex"), bytes, maximumChunkBytes, retainedDecodedFrames: 0, decodedFileCreated: false };
    },
  };
}

function audioProgress(expectedSeconds) {
  const allowed = new Set(["bitrate", "total_size", "out_time_us", "out_time_ms", "out_time", "dup_frames", "drop_frames", "speed", "progress"]);
  let ended = false, time = null, reports = 0;
  return {
    line(line) {
      assert.equal(ended, false); const at = line.indexOf("="); assert.ok(at > 0);
      const key = line.slice(0, at), value = line.slice(at + 1).trim(); assert.ok(allowed.has(key), `Unexpected audio progress: ${key}`);
      if (key === "out_time_us") { assert.match(value, /^\d+$/); const n = Number(value); assert.ok(Number.isSafeInteger(n) && (time === null || n >= time)); time = n; }
      if (key === "drop_frames" || key === "dup_frames") assert.equal(value, "0");
      if (key === "progress") { assert.ok(["continue", "end"].includes(value)); assert.ok(time !== null && ++reports <= 600); ended = value === "end"; }
    },
    finish() {
      assert.ok(ended && reports > 0, "No complete native audio decode progress");
      assert.ok(Math.abs(time / 1e6 - expectedSeconds) <= 1 / 24, "Full audio timeline end changed");
      return { finalOutputTimeSeconds: time / 1e6, completedProgressReports: reports };
    },
  };
}

export async function hashDecodedMediaStream(file, { cwd, env, kind, expectedFrames, expectedSeconds, expectedAudioSamples = null, timeoutMs = 1800000, onProgress = () => {} }) {
  assert.ok(["video-1280x720-yuv420p", "audio-48000-mono-s16le"].includes(kind));
  assert.ok(Number.isSafeInteger(expectedFrames) && expectedFrames > 0 && expectedFrames <= 1000000);
  assert.ok(Number.isFinite(expectedSeconds) && expectedSeconds > 0 && expectedSeconds <= 86400);
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 1800000);
  const actual = await realpath(file), work = await realpath(path.join(cwd, "work")), relative = path.relative(work, actual);
  const reusable = path.resolve(cwd, "fixtures/media/within-test-synthetic-hevc-aac.mkv");
  assert.ok(actual === reusable || relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const before = await lstat(actual, { bigint: true }); assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.ok(expectedAudioSamples === null || Number.isSafeInteger(expectedAudioSamples) && expectedAudioSamples > 0 && expectedAudioSamples <= 86400 * 48000);
  const video = kind.startsWith("video"), expectedBytes = video ? expectedFrames * 1280 * 720 * 3 / 2 : expectedAudioSamples === null ? null : expectedAudioSamples * 2;
  const digest = createDecodedByteHash({ expectedBytes, maximumBytes: expectedBytes ?? Math.ceil((expectedSeconds + 1) * 48000) * 2 });
  const progress = video ? createFullVideoDecodeProgress(expectedFrames, expectedSeconds) : audioProgress(expectedSeconds);
  const args = ["-v", "error", "-xerror", "-nostats", "-stats_period", "30", "-threads", "4", "-noautorotate", "-i", actual,
    ...(video ? ["-map", "0:v:0", "-an", "-c:v", "rawvideo", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough"]
      : ["-map", "0:a:0", "-vn", "-c:a", "pcm_s16le"]),
    "-progress", "pipe:2", "-f", video ? "rawvideo" : "s16le", "pipe:1"];
  const controller = new AbortController(), startedAt = Date.now();
  const child = spawn("C:/ffmpeg/bin/ffmpeg.exe", args, { cwd, env, windowsHide: true, signal: controller.signal, stdio: ["ignore", "pipe", "pipe"] });
  const exit = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }); void exit.catch(() => {});
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const raw = (async () => { for await (const chunk of child.stdout) digest.chunk(chunk); })();
  const status = (async () => {
    for await (const line of boundedUtf8Lines(child.stderr)) {
      const update = progress.line(line);
      if (update && !update.ended && Date.now() - startedAt >= 25000) onProgress({ kind, elapsedMs: Date.now() - startedAt, ...update });
    }
  })();
  const guard = work => work.catch(error => { controller.abort(); throw error; });
  try {
    await Promise.all([guard(raw), guard(status), guard(exit.then(code => assert.equal(code, 0, "Native decoded-stream validator failed")))]);
    const result = { ...digest.finish(), ...progress.finish() };
    const after = await lstat(actual, { bigint: true });
    for (const key of ["dev", "ino", "size", "birthtimeNs", "mtimeNs"]) assert.equal(after[key], before[key]);
    return { ...result, kind, elapsedMs: Date.now() - startedAt, decoderThreads: 4, nativeToolUsedForConversion: false,
      maximumRetainedDecodedChunks: 1, fullMediaBufferCreated: false, sha256Provider: `Node/OpenSSL ${process.versions.openssl}` };
  } finally {
    clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) controller.abort();
    await Promise.allSettled([raw, status, exit]);
  }
}
