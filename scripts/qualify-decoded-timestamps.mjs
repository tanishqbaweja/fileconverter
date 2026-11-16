// Independent-validator diagnosis ONLY. One deterministic48-loop source crosses
// the real rawvideo timestamp collision; no browser/native conversion claim.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { mkvHevcRegressionFixture } from "./lib/mkv-exact-aac-staged-reference.mjs";
import { boundedUtf8Lines } from "./lib/bounded-native-lines.mjs";
import { createFullVideoDecodeProgress } from "./lib/mkv-full-video-decode.mjs";
import { decodedMediaStreamArguments, hashDecodedMediaStream } from "./lib/streamed-decoded-hash.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), native = "C:/ffmpeg/bin/ffmpeg.exe", parent = path.join(root, mkvHevcRegressionFixture.file);
const sha = b => createHash("sha256").update(b).digest("hex");
const hashFile = async file => { const h = createHash("sha256"); for await (const b of createReadStream(file, { highWaterMark: 262144 })) h.update(b); return h.digest("hex"); };
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 2 * 1024 ** 3);
const runtime = await createOwnedRuntimeScratch("decoded-timestamp-control-"), file = path.join(runtime.directory, "within-test-48loop.mkv");
const r = { status: "running", scope: "48loop-source-independent-validator-timestamp-control-not-browser-acceptance",
  nativeConversionUsed: false, productionConverterChanged: false, publicAcceptance: false, originalFileAccessed: false, failures: [] };
try {
  assert.equal((await lstat(parent)).size, mkvHevcRegressionFixture.bytes); assert.equal(await hashFile(parent), mkvHevcRegressionFixture.sha256);
  await promisify(execFile)(native, ["-v", "error", "-n", "-copyts", "-stream_loop", "47", "-i", parent, "-map", "0", "-c", "copy", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", file],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 });
  const inspected = JSON.parse((await promisify(execFile)("C:/ffmpeg/bin/ffprobe.exe", ["-v", "error", "-count_packets", "-show_streams", "-show_format", "-of", "json", file],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 })).stdout);
  const expectedFrames = 48 * 288, expectedSeconds = Number(inspected.format.duration), expectedAudioSamples = 48 * 564 * 1024 - 1024;
  assert.equal(Number(inspected.streams[0].nb_read_packets), expectedFrames); assert.equal(Number(inspected.streams[1].nb_read_packets), 48 * 564);
  r.fixture = { parent: mkvHevcRegressionFixture, loops: 48, bytes: (await lstat(file)).size, sha256: await hashFile(file), expectedFrames, expectedSeconds, expectedAudioSamples };
  // Reproduce OLD argv, no corrected encoder time base. stdout is discarded by
  // the OS, never buffered in JS or saved. Keep bounded error evidence only.
  const oldArgs = decodedMediaStreamArguments(file, "video-1280x720-yuv420p"), at = oldArgs.indexOf("-enc_time_base:v");
  assert.ok(at > 0); oldArgs.splice(at, 2);
  const controller = new AbortController(), errors = [], startedAt = Date.now(); let lines = 0;
  const child = spawn(native, oldArgs, { cwd: root, env: runtime.env, windowsHide: true, signal: controller.signal, stdio: ["ignore", "ignore", "pipe"] });
  const exit = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }); void exit.catch(() => {});
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    for await (const line of boundedUtf8Lines(child.stderr)) {
      assert.ok(++lines <= 2000);
      if (/Application provided invalid, non monotonically increasing dts/.test(line)) {
        errors.push(line); assert.ok(errors.length <= 8); controller.abort(); break;
      }
      assert.match(line, /^[a-z_0-9]+=/);
    }
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) controller.abort(); await exit.catch(() => {}); }
  assert.equal(errors.length, 1, "Must reproduce the historical raw-mux timestamp error before accepting the correction");
  r.oldRawMux = { status: "reproduced-invalid-dts-no-acceptance", errors, elapsedMs: Date.now() - startedAt, stdoutDiscarded: true, decodedFileCreated: false };
  // Existing independent streamhash oracle, require stderr genuinely EMPTY.
  const oracleStart = Date.now(), legacy = await promisify(execFile)(native,
    ["-v", "error", "-xerror", "-nostats", "-stats_period", "30", "-threads", "4", "-noautorotate", "-i", file,
      "-map", "0:v:0", "-map", "0:a:0", "-c:v", "rawvideo", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough", "-c:a", "pcm_s16le",
      "-progress", "pipe:1", "-f", "streamhash", "-hash", "sha256", "pipe:1"],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 150000, maxBuffer: 2097152 });
  assert.equal(legacy.stderr, "");
  const parser = createFullVideoDecodeProgress(expectedFrames, expectedSeconds), hashes = new Map();
  for (const line of legacy.stdout.trim().split(/\r?\n/)) {
    const match = /^(0,v|1,a),SHA256=([a-f0-9]{64})$/.exec(line);
    if (match) { assert.equal(hashes.has(match[1]), false); hashes.set(match[1], match[2]); } else parser.line(line);
  }
  assert.equal(hashes.size, 2); r.oracle = { ...parser.finish(), elapsedMs: Date.now() - oracleStart, decodedVideoSha256: hashes.get("0,v"), decodedPcmSha256: hashes.get("1,a"), stderrEmpty: true };
  const options = { cwd: root, env: runtime.env, expectedFrames, expectedSeconds, expectedAudioSamples, timeoutMs: 150000 };
  r.corrected = { video: await hashDecodedMediaStream(file, { ...options, kind: "video-1280x720-yuv420p" }),
    audio: await hashDecodedMediaStream(file, { ...options, kind: "audio-48000-mono-s16le" }) };
  assert.equal(r.corrected.video.sha256, r.oracle.decodedVideoSha256); assert.equal(r.corrected.audio.sha256, r.oracle.decodedPcmSha256);
  assert.equal(await hashFile(file), r.fixture.sha256);
  r.status = "passed-reproduced-old-error-and-complete-corrected-hash-parity-not-large-browser-acceptance";
} catch (error) { r.status = "failed-independent-validator-timestamp-control"; r.failures.push(String(error.stack ?? error).slice(0, 2048)); process.exitCode = 1; }
finally {
  try { await runtime.close(); r.runtimeRemoved = true; } catch (error) { r.failures.push(String(error)); r.runtimeRemoved = false; r.status = "failed-cleanup"; process.exitCode = 1; }
  r.sourcePins = {};
  for (const name of ["scripts/qualify-decoded-timestamps.mjs", "scripts/lib/streamed-decoded-hash.mjs", "scripts/lib/mkv-full-video-decode.mjs", "scripts/lib/bounded-native-lines.mjs"])
    r.sourcePins[name] = sha(await readFile(path.join(root, name)));
  const output = `evidence/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-decoded-timestamp-control.json`;
  await writeFile(path.join(root, output), JSON.stringify(r, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file: output, status: r.status, failures: r.failures }));
}
