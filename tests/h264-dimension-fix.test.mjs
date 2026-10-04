import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const e = JSON.parse(await readFile(new URL("../evidence/h264-dimension-fix-validation-2026-10-04.json", import.meta.url)));
test("fixed dimension guard rejects both early and after-written-byte changes with automatic cleanup", () => {
  for (const report of [e.dimension.report, e.failureAfterWrittenOutput.report]) {
    assert.equal(report.status, "passed-dimension-rejection");
    assert.equal(report.state.jobState, "error");
    assert.match(report.state.error, /source dimensions changed/);
    assert.deepEqual(report.opfsSizesAfterJob, []);
    assert.equal(report.state.metrics.pendingOperations, 0);
    assert.equal(report.state.metrics.queuedBytes, 0);
    assert.ok(report.state.metrics.peakQueuedBytes <= 262144);
    assert.ok(report.state.metrics.peakPendingOperations <= 1);
  }
  assert.equal(e.failureAfterWrittenOutput.report.source.frames.length, 96);
  assert.equal(e.failureAfterWrittenOutput.report.state.metrics.outputBytes, 247808);
  assert.equal(e.primaryIncrementalPrivateMiB, null); assert.equal(e.publicAcceptance, false);
  assert.equal(e.hostedBuild.remoteArtifactsRemaining, 0);
});
test("fixed kernel retains ordinary exact-timing quality/audio regressions and fixed 32 MiB memory", async () => {
  // Bind the historical browser binary to its executed source, not a newer candidate.
  const historical = execFileSync("git", ["show", "af4ee8fa010fbf70f8b9da290c2380d7dc0b265d:media/ffmpeg/h264-candidate.c"],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), windowsHide: true });
  const hash = createHash("sha256").update(historical).digest("hex");
  assert.equal(hash, e.dimension.report.asBuiltManifest.candidateKernelSha256);
  const rows = e.ordinaryRegression.report.rows.filter((row) => row.container && row.status === "passed");
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(Number(row.frames), 48); assert.equal(row.audioTracks, 2);
    assert.ok(row.ssim >= 0.98);
    assert.ok(row.sourceFrameTimes.every((time, i) => Math.abs(time - row.outputFrameTimes[i]) <= 0.001));
    assert.equal(row.metrics.peakWasmMemoryBytes, 33554432);
  }
  assert.equal(e.actualWasmMemoryLimits[0].initialPages, 512);
  assert.equal(e.actualWasmMemoryLimits[0].maximumPages, 512);
});
