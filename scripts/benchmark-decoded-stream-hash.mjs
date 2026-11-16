// Source-inspection benchmark only. Never performs a browser conversion or
// creates decoded media. Compare exact hashes before accepting any speed claim.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { mkvHevcRegressionFixture } from "./lib/mkv-exact-aac-staged-reference.mjs";
import { boundedNativeLines } from "./lib/bounded-native-lines.mjs";
import { createFullVideoDecodeProgress } from "./lib/mkv-full-video-decode.mjs";
import { hashDecodedMediaStream } from "./lib/streamed-decoded-hash.mjs";
assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === "--sustained");
const sustained = process.argv[2] === "--sustained", root = path.resolve(import.meta.dirname, ".."), parent = path.join(root, mkvHevcRegressionFixture.file);
const sha = b => createHash("sha256").update(b).digest("hex"), runtime = await createOwnedRuntimeScratch("decoded-hash-benchmark-");
let file = parent, expectedFrames = 288, expectedSeconds = 12.021;
const hashFile = async file => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file, { highWaterMark: 262144 })) hash.update(chunk); return hash.digest("hex"); };
const report = { scope: "pinned12second-source-inspection-hash-benchmark-not-browser-or-large-file-acceptance", fixture: mkvHevcRegressionFixture,
  samples: [], failures: [], nativeConversionUsed: false, publicAcceptance: false, originalFileAccessed: false };
const legacy = async () => {
  const parser = createFullVideoDecodeProgress(expectedFrames, expectedSeconds), hashes = new Map(), started = Date.now();
  const args = ["-v", "error", "-xerror", "-nostats", "-stats_period", "30", "-threads", "4", "-noautorotate", "-i", file,
    "-map", "0:v:0", "-map", "0:a:0", "-c:v", "rawvideo", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough",
    "-c:a", "pcm_s16le", "-progress", "pipe:1", "-f", "streamhash", "-hash", "sha256", "pipe:1"];
  for await (const line of boundedNativeLines("ffmpeg", args, { cwd: root, env: runtime.env, timeoutMs: 90000 })) {
    const match = /^(0,v|1,a),SHA256=([a-f0-9]{64})$/.exec(line);
    if (match) { assert.equal(hashes.has(match[1]), false); hashes.set(match[1], match[2]); } else parser.line(line);
  }
  assert.equal(hashes.size, 2);
  return { ...parser.finish(), decodedVideoSha256: hashes.get("0,v"), decodedPcmSha256: hashes.get("1,a"), elapsedMs: Date.now() - started };
};
const candidate = async () => {
  const options = { cwd: root, env: runtime.env, expectedFrames, expectedSeconds, timeoutMs: 90000 }, started = Date.now();
  const video = await hashDecodedMediaStream(file, { ...options, kind: "video-1280x720-yuv420p" });
  const audio = await hashDecodedMediaStream(file, { ...options, kind: "audio-48000-mono-s16le" });
  return { video, audio, elapsedMs: Date.now() - started, decodedVideoSha256: video.sha256, decodedPcmSha256: audio.sha256 };
};
try {
  assert.equal((await lstat(file)).size, mkvHevcRegressionFixture.bytes);
  assert.equal(await hashFile(file), mkvHevcRegressionFixture.sha256);
  if (sustained) {
    file = path.join(runtime.directory, "within-test-decoded-hash-sustained.mkv");
    await promisify(execFile)("C:/ffmpeg/bin/ffmpeg.exe", ["-v", "error", "-n", "-copyts", "-stream_loop", "19", "-i", parent,
      "-map", "0", "-c", "copy", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", file],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 });
    const bytes = (await lstat(file)).size; assert.ok(bytes > 96 * 1048576 && bytes < 128 * 1048576);
    const inspected = JSON.parse((await promisify(execFile)("C:/ffmpeg/bin/ffprobe.exe", ["-v", "error", "-count_packets", "-show_streams", "-show_format", "-of", "json", file],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 })).stdout);
    expectedFrames = 20 * 288; expectedSeconds = Number(inspected.format.duration);
    assert.equal(Number(inspected.streams[0].nb_read_packets), expectedFrames);
    report.scope = "real20loop-approx119MB-source-independent-validator-benchmark-not-browser-or-multiGB-acceptance";
    report.fixture = { parent: mkvHevcRegressionFixture, loops: 20, bytes, sha256: await hashFile(file), expectedFrames, expectedSeconds, nativeToolUsedOnlyForFixtureGeneration: true };
  }
  for (const order of [["legacy", "candidate"], ["candidate", "legacy"], ["legacy", "candidate"]]) {
    const row = { order }; report.samples.push(row);
    for (const name of order) row[name] = await (name === "legacy" ? legacy() : candidate());
    assert.equal(row.legacy.decodedVideoSha256, row.candidate.decodedVideoSha256);
    assert.equal(row.legacy.decodedPcmSha256, row.candidate.decodedPcmSha256);
  }
  assert.equal(await hashFile(file), report.fixture.sha256);
  const mean = name => report.samples.reduce((n, r) => n + r[name].elapsedMs, 0) / report.samples.length;
  report.result = { exactVideoAndPcmHashesMatchEveryPair: true, legacyMeanMs: mean("legacy"), candidateMeanMs: mean("candidate"),
    relativeSpeed: mean("legacy") / mean("candidate"), largeFileSpeedupProven: false, productionConverterChanged: false };
  report.status = "completed-small-source-validator-benchmark-not-conversion-acceptance";
} catch (error) { report.status = "failed-validator-benchmark"; report.failures.push(String(error.stack ?? error).slice(0, 2048)); process.exitCode = 1; }
finally {
  await runtime.close(); report.runtimeRemoved = true;
  report.sourcePins = {};
  for (const name of ["scripts/benchmark-decoded-stream-hash.mjs", "scripts/lib/streamed-decoded-hash.mjs", "scripts/lib/bounded-native-lines.mjs", "scripts/lib/mkv-full-video-decode.mjs"])
    report.sourcePins[name] = sha(await readFile(path.join(root, name)));
  const output = `evidence/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-decoded-stream-hash-benchmark.json`;
  await writeFile(path.join(root, output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file: output, status: report.status, result: report.result, failures: report.failures }));
}
