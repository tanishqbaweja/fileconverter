// Native tools create/inspect ONE deterministic source fixture only. This does
// not convert an application output, replace a browser conversion or qualify a route.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createPcmPrefixDiagnostic } from "./lib/pcm-prefix-diagnostic.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
assert.equal(process.argv.length, 2);
const report = { scope: "native-independent-source-fixture-priming-diagnosis-no-browser-or-production-conversion",
  startedAt: new Date().toISOString(), publicAcceptance: false, noBrowserConversionClaim: true };
const reportPath = path.join(root, "outputs/reports", "aac-source-priming-" + report.startedAt.replaceAll(":", "-") + ".json");
const runtime = await createOwnedRuntimeScratch("aac-source-diagnostic-");
const native = (exe, args) => exec(exe, args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1024 ** 2 });
try {
  const disk = await statfs(runtime.directory); assert.ok(disk.bavail * disk.bsize >= 256 * 1024 ** 2);
  report.ffmpegVersion = (await native("ffmpeg", ["-version"])).stdout.split(/\r?\n/).slice(0, 2);
  report.ffprobeVersion = (await native("ffprobe", ["-version"])).stdout.split(/\r?\n/).slice(0, 2);
  const file = path.join(runtime.directory, "vp8.mkv");
  await native("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=480x270:rate=24:duration=2",
    "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=2", "-map", "0:v", "-map", "1:a",
    "-c:v", "libvpx", "-deadline", "good", "-cpu-used", "4", "-threads:v", "1", "-b:v", "0", "-crf", "4",
    "-c:a", "aac", "-b:a", "128k", "-metadata", "title=VPX café 音楽", "-metadata:s:a:0", "language=eng",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact", file]);
  const bytes = await readFile(file); assert.ok(bytes.length < 256 * 1024);
  report.fixture = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  const known = {
    "6e2baa02fe7d9469a2bd84dc516caa995a697eead2ad9f23eb3de2ecd2c74ab9": { scope: "Windows155 original source", decodedSource: "0293fc3f2c5f705d9669cb5d55013bea5c388f36f5e2afac6bbc56490d2007e6", decodedBrowserOutput: "0293fc3f2c5f705d9669cb5d55013bea5c388f36f5e2afac6bbc56490d2007e6" },
    "a49c52682e4cfc6d43c317792122e57d5f8487610740769263f91fea868cde80": { scope: "hosted151 failing source", decodedSource: "09950a34aef7448f035dfed455adbdd89d4503809f89f8a6653a3bde5ea1c770", decodedBrowserOutput: "74114f4fafb61584ccde4c5f7057371484fbd4df69fbd9bf97fbf5ce2a22604d" },
  };
  const baseline = known[report.fixture.sha256]; assert.ok(baseline, "Fixture changed; cannot diagnose the recorded failure with a different input");
  report.baseline = baseline;
  const probe = JSON.parse((await native("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_streams", "-show_packets", "-of", "json", file])).stdout);
  assert.equal(probe.streams.length, 1); assert.ok(probe.packets.length >= 2 && probe.packets.length <= 128);
  const audio = probe.streams[0], priming = audio.initial_padding;
  assert.equal(audio.codec_name, "aac"); assert.equal(audio.channels, 1); assert.equal(Number(audio.sample_rate), 48000); assert.equal(priming, 1024);
  report.stream = { sampleRate: audio.sample_rate, channels: audio.channels, initialPadding: priming,
    startTime: audio.start_time, timeBase: audio.time_base, packetCount: probe.packets.length };
  const packet = p => ({ pts: p.pts, dts: p.dts, duration: p.duration, pts_time: p.pts_time, duration_time: p.duration_time, side_data_list: p.side_data_list ?? [] });
  report.packetEdges = { first: probe.packets.slice(0, 3).map(packet), last: probe.packets.slice(-3).map(packet) };
  report.decodes = [];
  for (const manual of [false, true]) {
    const digest = createPcmPrefixDiagnostic({ channels: audio.channels, declaredLeadingSamples: priming });
    const controller = new AbortController(); let stderr = "";
    const args = ["-v", "error", ...(manual ? ["-flags2", "+skip_manual"] : []), "-i", file, "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"];
    const child = spawn("ffmpeg", args, { cwd: root, env: runtime.env, windowsHide: true,
      signal: controller.signal, stdio: ["ignore", "pipe", "pipe"] });
    // The unreaped direct child handle identifies this exact launch; no PID sweep
    // or unrelated-process termination is used on timeout/error.
    const exit = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      for await (const chunk of child.stdout) digest.update(chunk);
      const status = await exit; assert.equal(status.code, 0, stderr);
      const value = digest.finish(); report.decodes.push({ manualSkipRequested: manual, ...value,
        rawMatchesRecordedSource: value.rawSha256 === baseline.decodedSource,
        rawMatchesRecordedBrowserOutput: value.rawSha256 === baseline.decodedBrowserOutput,
        declaredPrefixRemovalMatchesRecordedBrowserOutput: value.afterDeclaredPrefixSha256 === baseline.decodedBrowserOutput });
    } finally { clearTimeout(timeout); if (child.exitCode === null && child.signalCode === null) controller.abort(); await exit.catch(() => {}); }
  }
  assert.equal(report.decodes[0].rawSha256, baseline.decodedSource, "Raw source decode no longer reproduces the recorded comparison");
  report.status = "source-diagnosis-completed-not-browser-or-fidelity-acceptance";
} catch (error) { report.status = "failed"; report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  try { await runtime.close(); report.disposableFixtureRemoved = true; }
  finally { await mkdir(path.dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify({ report: path.relative(root, reportPath), ...report })); }
}
