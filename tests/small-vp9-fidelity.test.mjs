import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { SMALL_VP9_FIDELITY, inspectVp9ContainerDuration, validateSmallVp9Fidelity } from "../scripts/lib/small-vp9-fidelity.mjs";
const root = path.resolve(import.meta.dirname, ".."), source = path.join(root, "work/source.mkv"), output = path.join(root, "work/output.webm");
const probe = (codec = "h264", duration = "2") => ({ streams: [{ codec_name: codec, width: 320, height: 180,
  avg_frame_rate: "24/1", pix_fmt: "yuv420p", color_space: "bt709" }], format: { duration } });
async function runCase({ sourceProbe = probe(), outputProbe = probe("vp9"), score = "0.99", frames = 48,
  outputClockOffset = 0, omitDurations = false, progressEnd = true, summary = undefined } = {}) {
  const calls = [];
  const report = await validateSmallVp9Fidelity({ root, source, output, sourceProbe, outputProbe,
    ffmpeg: path.join(root, "mock/ffmpeg"), ffprobe: path.join(root, "mock/ffprobe"), env: { Path: "unit-only" },
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      if (args[0] === "-version") return { stdout: "native validator unit version\n", stderr: "" };
      return { stdout: `frame=${frames}\nprogress=${progressEnd ? "end" : "continue"}\n`,
        stderr: summary ?? `[Parsed_ssim_0 @ unit] SSIM Y:0.99 U:0.99 V:0.99 All:${score} (20.0)\r` };
    }, lines: (_command, args, options) => (async function* () {
      assert.ok(options.env.Path.startsWith(path.join(root, "mock"))); assert.equal(options.timeoutMs, 30000);
      for (let n = 0; n < 48; n++) yield `frame|best_effort_timestamp_time=${(n / 24 + (args.at(-1) === output ? outputClockOffset : 0)).toFixed(6)}` +
        (omitDurations && args.at(-1) === output ? "" : "|duration_time=0.041667");
    })(),
  }); return { report, calls };
}
test("strict container duration rejects the known one-frame shortfall instead of using the old0.05s tolerance", () => {
  assert.equal(inspectVp9ContainerDuration(probe(), probe("vp9", "1.958")).passed, false);
  assert.equal(inspectVp9ContainerDuration(probe(), probe("vp9", "2")).passed, true);
  for (const duration of [undefined, "N/A", "", "0", "NaN"]) {
    const row = inspectVp9ContainerDuration(probe(), probe("vp9", duration));
    if (duration === undefined) { const missing = probe("vp9"); delete missing.format.duration;
      assert.equal(inspectVp9ContainerDuration(probe(), missing).errorSeconds, null); }
    else { assert.equal(row.errorSeconds, null); assert.equal(row.passed, false); }
  }
});
test("valid full48-frame control needs exact clocks, frame durations, metadata and unchanged0.98SSIM gate", async () => {
  const { report, calls } = await runCase(); assert.equal(report.passed, true); assert.deepEqual(report.failures, []);
  assert.equal(report.clocks.frames, 48); assert.equal(report.clocks.maximumVideoPtsErrorSeconds, 0);
  assert.equal(report.sourceFrames.framesWithDuration, 48); assert.equal(report.outputFrames.framesWithDuration, 48);
  assert.equal(report.ssim.score, 0.99); assert.equal(report.ssim.comparedFrames, 48); assert.equal(report.ssim.minimumRequired, 0.98);
  assert.equal(report.ssim.nativeOutput, "null-validator-only"); assert.equal(SMALL_VP9_FIDELITY.minimumSsim, 0.98);
  const native = calls.find(row => row.args.includes("-lavfi")); assert.deepEqual(native.args.slice(-3), ["-f", "null", "-"]);
  assert.equal(native.options.windowsHide, true); assert.equal(native.options.maxBuffer, 1048576);
});
test("known duration failure still collects quality and all frame clock facts before final rejection", async () => {
  const { report } = await runCase({ outputProbe: probe("vp9", "1.958") });
  assert.equal(report.passed, false); assert.equal(report.clocks.frames, 48); assert.equal(report.ssim.passed, true);
  assert.ok(report.failures.some(x => x.includes("Container duration")));
});
test("unknown frame durations stay null, not inferred from FPS or fabricated as zero", async () => {
  const { report } = await runCase({ omitDurations: true }); assert.equal(report.passed, false);
  assert.equal(report.outputFrames.lastDurationSeconds, null); assert.equal(report.outputFrames.framesWithDuration, 0);
  assert.ok(report.failures.some(x => x.includes("Decoded frame duration unavailable")));
});
test("an ordinal SSIM score cannot hide a changed presentation clock", async () => {
  const { report } = await runCase({ outputClockOffset: 1 / 24 }); assert.equal(report.passed, false);
  assert.equal(report.clocks, null); assert.equal(report.ssim.passed, true); assert.ok(report.failures.some(x => x.includes("Frame clocks")));
});
test("a genuine numeric low SSIM is retained as measured failure, not a missing-parser result", async () => {
  const { report } = await runCase({ score: "0.979999" }); assert.equal(report.passed, false);
  assert.equal(report.ssim.score, 0.979999); assert.equal(report.ssim.passed, false);
});
test("unavailable or ambiguous quality cannot be recorded as a passing or zero score", async () => {
  for (const summary of ["no quality summary", "SSIM Y:1 All:0.99\nSSIM Y:1 All:0.99\n"]) {
    const { report } = await runCase({ summary }); assert.equal(report.ssim, null); assert.equal(report.passed, false);
    assert.ok(report.failures.some(x => x.includes("SSIM validator")));
  }
});
test("complete quality proof requires all48 frames and an explicit end marker", async () => {
  for (const opts of [{ frames: 47 }, { progressEnd: false }]) {
    const { report } = await runCase(opts); assert.equal(report.passed, false); assert.equal(report.ssim.passed, false);
  }
});
test("missing or guessed source color metadata is not silently accepted", async () => {
  const outputProbe = probe("vp9"); outputProbe.streams[0].color_primaries = "bt709";
  const { report } = await runCase({ outputProbe }); assert.equal(report.passed, false);
  assert.ok(report.failures.some(x => x.includes("color_primaries")));
});
