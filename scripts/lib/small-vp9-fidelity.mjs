// Independent validation of the pinned2s48-frame control only, not a converter.
import assert from "node:assert/strict";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { boundedNativeLines } from "./bounded-native-lines.mjs";
import { compareStreamingVideoClocks } from "./streaming-video-clock-fidelity.mjs";
import { inspectSsimSummary, requireNumericSsim } from "./cr-aware-ssim-summary.mjs";
export const SMALL_VP9_FIDELITY = Object.freeze({ frames: 48, frameRate: 24, minimumSsim: 0.98,
  maximumContainerDurationErrorSeconds: 0.001, maximumFramePtsErrorSeconds: 0.001,
  validatorTimeoutMs: 30000, validatorLogBytes: 1048576 });
const sha = value => createHash("sha256").update(value).digest("hex");
export async function* observeVp9FrameDurations(lines, summary) {
  for await (const line of lines) {
    assert.ok(typeof line === "string" && line.length <= 4096 && line.startsWith("frame|"));
    const fields = Object.fromEntries(line.split("|").filter(value => value.includes("=")).map(value => {
      const at = value.indexOf("="); return [value.slice(0, at), value.slice(at + 1)];
    }));
    const pts = Number(fields.best_effort_timestamp_time);
    assert.ok(fields.best_effort_timestamp_time && Number.isFinite(pts));
    const durationText = fields.duration_time ?? fields.pkt_duration_time;
    const duration = durationText && durationText !== "N/A" ? Number(durationText) : null;
    assert.ok(duration === null || (Number.isFinite(duration) && duration > 0));
    summary.frames++; assert.ok(summary.frames <= SMALL_VP9_FIDELITY.frames);
    summary.firstPtsSeconds ??= pts; summary.lastPtsSeconds = pts;
    summary.lastDurationSeconds = duration;
    if (duration !== null) summary.framesWithDuration++;
    yield line;
  }
}
export function inspectVp9ContainerDuration(sourceProbe, outputProbe) {
  const parse = probe => {
    const raw = probe.format?.duration, value = raw === undefined || raw === "N/A" || raw === "" ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const sourceSeconds = parse(sourceProbe), outputSeconds = parse(outputProbe);
  const errorSeconds = sourceSeconds === null || outputSeconds === null ? null : Math.abs(sourceSeconds - outputSeconds);
  return { sourceSeconds, outputSeconds, errorSeconds,
    toleranceSeconds: SMALL_VP9_FIDELITY.maximumContainerDurationErrorSeconds,
    passed: errorSeconds !== null && errorSeconds <= SMALL_VP9_FIDELITY.maximumContainerDurationErrorSeconds };
}
export async function validateSmallVp9Fidelity({ root, source, output, sourceProbe, outputProbe, ffmpeg, ffprobe, env,
  run = promisify(execFile), lines = boundedNativeLines }) {
  const report = { scope: "Independent complete48-frame small control validation; not original/near10GB/full-metadata acceptance",
    limits: SMALL_VP9_FIDELITY, failures: [], clocks: null, sourceFrames: { frames: 0, framesWithDuration: 0,
      firstPtsSeconds: null, lastPtsSeconds: null, lastDurationSeconds: null },
    outputFrames: { frames: 0, framesWithDuration: 0, firstPtsSeconds: null, lastPtsSeconds: null, lastDurationSeconds: null },
    containerDuration: inspectVp9ContainerDuration(sourceProbe, outputProbe), ssim: null, metadata: [], toolVersions: null,
    decodedDurationsAreNotEncodedPacketDurationProof: true, passed: false };
  for (const probe of [sourceProbe, outputProbe]) {
    assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].width, 320); assert.equal(probe.streams[0].height, 180);
    assert.equal(probe.streams[0].avg_frame_rate, "24/1");
  }
  assert.equal(sourceProbe.streams[0].codec_name, "h264"); assert.equal(outputProbe.streams[0].codec_name, "vp9");
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") ?? "PATH";
  const validatorEnv = { ...env, [pathKey]: path.dirname(ffprobe) + path.delimiter + (env[pathKey] ?? "") };
  try {
    const versions = await Promise.all([ffmpeg, ffprobe].map(command => run(command, ["-version"],
      { cwd: root, env: validatorEnv, windowsHide: true, timeout: 10000, maxBuffer: 65536 })));
    report.toolVersions = { ffmpeg: versions[0].stdout.split(/\r?\n/)[0].slice(0, 512), ffprobe: versions[1].stdout.split(/\r?\n/)[0].slice(0, 512) };
  } catch (error) { report.failures.push("Validator version: " + String(error).slice(0, 1024)); }
  const frameLines = file => lines("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_frames", "-show_entries",
    "frame=best_effort_timestamp_time,duration_time,pkt_duration_time", "-of", "compact", file],
  { cwd: root, env: validatorEnv, timeoutMs: SMALL_VP9_FIDELITY.validatorTimeoutMs });
  try {
    report.clocks = await compareStreamingVideoClocks(observeVp9FrameDurations(frameLines(source), report.sourceFrames),
      observeVp9FrameDurations(frameLines(output), report.outputFrames), SMALL_VP9_FIDELITY.frames);
  } catch (error) { report.failures.push("Frame clocks: " + String(error).slice(0, 1024)); }
  if (!report.containerDuration.passed) report.failures.push("Container duration differs or is unavailable; one-frame tolerance is NOT full-duration fidelity");
  if (report.sourceFrames.framesWithDuration !== 48 || report.outputFrames.framesWithDuration !== 48)
    report.failures.push("Decoded frame duration unavailable; do not substitute an invented zero or inferred duration");
  for (const field of ["pix_fmt", "sample_aspect_ratio", "display_aspect_ratio", "color_range", "color_space", "color_transfer", "color_primaries", "chroma_location"]) {
    const before = sourceProbe.streams[0][field] ?? null, after = outputProbe.streams[0][field] ?? null;
    report.metadata.push({ field, source: before, output: after, equal: before === after });
    if (before !== after) report.failures.push("Video metadata changed: " + field);
  }
  const args = ["-hide_banner", "-loglevel", "info", "-nostdin", "-nostats", "-threads", "1", "-i", source,
    "-threads", "1", "-i", output, "-filter_complex_threads", "1", "-lavfi",
    "[0:v:0]setpts=N/(24*TB)[reference];[1:v:0]setpts=N/(24*TB)[actual];[reference][actual]ssim=shortest=1:repeatlast=0",
    "-an", "-progress", "pipe:1", "-f", "null", "-"];
  try {
    const result = await run(ffmpeg, args, { cwd: root, env: validatorEnv, windowsHide: true,
      timeout: SMALL_VP9_FIDELITY.validatorTimeoutMs, maxBuffer: SMALL_VP9_FIDELITY.validatorLogBytes });
    const diagnostic = inspectSsimSummary(result.stderr), score = requireNumericSsim(diagnostic);
    const counts = [...result.stdout.matchAll(/^frame=(\d+)\r?$/gm)].map(match => Number(match[1]));
    report.ssim = { ...diagnostic, comparedFrames: counts.at(-1) ?? null, progressEnded: /(?:^|\n)progress=end\r?(?:\n|$)/.test(result.stdout),
      ordinalPairing: true, independentPtsGateAlsoRequired: true, nativeOutput: "null-validator-only", minimumRequired: SMALL_VP9_FIDELITY.minimumSsim,
      passed: score >= SMALL_VP9_FIDELITY.minimumSsim && counts.at(-1) === 48 && /(?:^|\n)progress=end\r?(?:\n|$)/.test(result.stdout),
      progressBytes: Buffer.byteLength(result.stdout), progressSha256: sha(result.stdout) };
    if (!report.ssim.passed) report.failures.push("Complete48-frame SSIM validation failed its existing0.98 gate or completed-frame/progress proof");
  } catch (error) { report.failures.push("SSIM validator: " + String(error).slice(0, 1024)); }
  report.passed = report.failures.length === 0; return report;
}
