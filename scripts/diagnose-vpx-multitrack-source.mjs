// Exact deterministic SOURCE fixture inspection only. No application output,
// browser launch, route acceptance, native converter substitute or retained media.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const report = { scope: "exact-source-fixture-only-multitrack-priming-layout-diagnosis", startedAt: new Date().toISOString(),
  publicAcceptance: false, browserConversionClaim: false, nativeOutputConversion: false };
const reportFile = path.join(root, "outputs/reports/vpx-multitrack-source-" + report.startedAt.replaceAll(":", "-") + ".json");
const runtime = await createOwnedRuntimeScratch("vpx-multi-source-");
const native = (tool, args) => exec(tool, args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1024 ** 2 });
try {
  const disk = await statfs(runtime.directory); assert.ok(disk.bavail * disk.bsize >= 256 * 1024 ** 2);
  report.ffmpegVersion = (await native("ffmpeg", ["-version"])).stdout.split(/\r?\n/).slice(0, 2);
  const base = path.join(runtime.directory, "vp8.mkv"), file = path.join(runtime.directory, "vp8-multi.mkv");
  await native("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=480x270:rate=24:duration=2",
    "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=2", "-map", "0:v", "-map", "1:a",
    "-c:v", "libvpx", "-deadline", "good", "-cpu-used", "4", "-threads:v", "1", "-b:v", "0", "-crf", "4",
    "-c:a", "aac", "-b:a", "128k", "-metadata", "title=VPX café 音楽", "-metadata:s:a:0", "language=eng",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact", base]);
  const metadata = path.join(runtime.directory, "chapters.ffmetadata");
  await writeFile(metadata, ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=500\nEND=1500\ntitle=VPX chapitre café\n", { flag: "wx" });
  await native("ffmpeg", ["-v", "error", "-i", base, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
    "-f", "ffmetadata", "-i", metadata, "-map", "0:v", "-map", "0:a", "-map", "1:a", "-map_metadata", "0", "-map_chapters", "2",
    "-c", "copy", "-c:a:1", "aac", "-b:a:1", "128k", "-metadata:s:a:0", "language=eng", "-metadata:s:a:1", "language=hin",
    "-fflags", "+bitexact", "-flags:a", "+bitexact", file]);
  const info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 256 * 1024);
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 65536 })) digest.update(chunk);
  const hash = digest.digest("hex");
  const known = { "1705c9399cd4cb8112665e305ee4716b7544a465467713ab334f735457f47672": 123374,
    "44a80ddbf4cafddd5b70513c8dc5de94c700903839ddacc366d310015fa84b17": 123559 };
  assert.equal(info.size, known[hash], "Different input cannot diagnose the recorded Windows/hosted failure");
  report.fixture = { bytes: info.size, sha256: hash, matchesRecordedBrowserSourceExactly: true };
  const probe = JSON.parse((await native("ffprobe", ["-v", "error", "-select_streams", "a", "-show_streams", "-show_packets", "-show_chapters", "-show_format", "-of", "json", file])).stdout);
  assert.equal(probe.streams.length, 2); assert.ok(probe.packets.length <= 256);
  report.chapters = probe.chapters; report.formatStartTime = probe.format.start_time;
  const packet = value => ({ pts: value.pts, dts: value.dts, pts_time: value.pts_time, dts_time: value.dts_time,
    duration_time: value.duration_time ?? null, side_data_list: value.side_data_list ?? [] });
  report.audioTracks = probe.streams.map(stream => {
    assert.equal(stream.codec_name, "aac"); assert.equal(Number(stream.sample_rate), 48000);
    const packets = probe.packets.filter(value => value.stream_index === stream.index); assert.ok(packets.length >= 2 && packets.length <= 128);
    return { index: stream.index, initialPadding: stream.initial_padding ?? null, startTime: stream.start_time ?? null,
      timeBase: stream.time_base, language: stream.tags?.language, packets: packets.length,
      first: packets.slice(0, 3).map(packet), last: packets.slice(-3).map(packet) };
  });
  report.status = "source-layout-recorded-no-fidelity-or-chapter-acceptance";
} catch (error) { report.status = "failed"; report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  try { await runtime.close(); report.disposableFixturesRemoved = true; }
  finally { await mkdir(path.dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ report: path.relative(root, reportFile), ...report })); }
}
