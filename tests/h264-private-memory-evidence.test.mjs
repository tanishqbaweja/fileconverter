import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const evidence = JSON.parse(await readFile(path.join(root, "evidence/h264-private-memory-2026-10-04.json"), "utf8"));
test("H264 720p trials preserve genuine validation but reject nonrepeatable whole-Chromium memory", () => {
  assert.equal(evidence.source.bytes, 105000218);
  assert.equal(evidence.source.frameTimes.length, 1800);
  assert.equal(evidence.attempts.length, 4);
  assert.match(evidence.attempts[0].failure.message, /larger than 50Mb/);
  const converted = evidence.attempts.slice(1);
  assert.equal(converted[0].runs[0].incrementalPrivateMiB, 268.4296875);
  assert.equal(converted[1].runs[0].incrementalPrivateMiB, 245.57421875);
  assert.equal(converted[2].runs[0].incrementalPrivateMiB, 269.171875);
  const hash = converted[0].runs[0].independentValidation.outputSha256;
  for (const attempt of evidence.attempts) {
    assert.equal(attempt.status, "failed");
    assert.equal(attempt.blankBaseline.stable, true);
    assert.equal(attempt.primaryLimitMiB, 250);
    assert.equal(attempt.publicProfilesChanged, false);
    for (const sample of attempt.samples) {
      if (sample.privateBytes == null) continue;
      assert.equal(sample.privateBytes, sample.processes.reduce((sum, process) => sum + process.privateBytes, 0));
      assert.ok(sample.processes.some((process) => process.type === "gpu-process"));
    }
    for (const run of attempt.runs) {
      const validation = run.independentValidation;
      assert.equal(validation.outputSha256, hash);
      assert.equal(validation.maximumFrameTimeErrorSeconds, 0);
      assert.equal(validation.outputFrameTimes.length, 1800);
      assert.equal(validation.fullDecodePassed, true);
      assert.ok(validation.ordinalSsim >= 0.98);
      assert.deepEqual(run.cleanup.opfsRemainingEntries, []);
      assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - attempt.blankBaseline.privateBytes) / 1024 ** 2);
    }
  }
  assert.equal(evidence.cleanup.convertedMediaAndGeneratedFixtureCopiesRetained, 0);
});
