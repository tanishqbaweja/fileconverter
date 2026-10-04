import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { h264StressProfile, startupConversionOverlap } from "../scripts/lib/h264-stress-profile.mjs";

test("long H264 startup gate retains short default and rejects a profiler/single-run substitute", () => {
  assert.equal(h264StressProfile().durationSeconds, 60);
  assert.equal(h264StressProfile("startup-scaling").durationSeconds, 600);
  assert.equal(h264StressProfile("startup-scaling").requireStartupOverlap, true);
  assert.ok(Object.isFrozen(h264StressProfile()));
  assert.throws(() => h264StressProfile("smaller"));
  assert.throws(() => h264StressProfile("startup-scaling", true), /CPU profiler/);
});
test("startup gate requires real running-conversion observations before and beyond browser startup", () => {
  const sample = (age, phase = "conversion-1", jobState = "running") => ({ browserAgeMs: age, phase, jobState });
  assert.equal(startupConversionOverlap([sample(20000), sample(190001)]).observed, true);
  assert.equal(startupConversionOverlap([sample(190001)]).observed, false);
  assert.equal(startupConversionOverlap([sample(20000), sample(190001, "loaded-idle")]).observed, false);
  assert.equal(startupConversionOverlap([sample(20000), sample(190001, "conversion-1", "complete")]).observed, false);
  assert.deepEqual(startupConversionOverlap([sample(null), sample(-1)]), { observed: false, earliestBrowserAgeMs: null, latestBrowserAgeMs: null });
});
test("larger genuine fixture reuses production I/O and strict validation without baseline enlargement or process omission", async () => {
  const source = await readFile(new URL("../scripts/h264-private-memory.mjs", import.meta.url), "utf8");
  assert.match(source, /duration=\$\{fixtureDuration\}/);
  assert.match(source, /sourceEvidence.frameTimes.length, fixtureDuration \* fps/);
  assert.match(source, /video.nb_read_frames\), fixtureDuration \* fps/);
  assert.match(source, /startupConversionOverlap\(samples\).observed/);
  assert.match(source, /early clean baseline\/full Chromium tree/);
  assert.match(source, /it stays in the primary total/);
  assert.match(source, /summary.incrementalPrivateMiB <= 250/);
  assert.match(source, /ordinalSsim >= 0.98/);
  assert.match(source, /maximumFrameTimeErrorSeconds <= 0.001/);
  assert.match(source, /await rm\(work, \{ recursive: true/);
  assert.doesNotMatch(source, /test\.mkv"|Debugger.pause|190000\).*delay|--disable-features=.*OnDevice/);
});
