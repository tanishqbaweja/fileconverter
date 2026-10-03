import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const evidence = JSON.parse(await readFile(path.join(root, "evidence/h264-timing-validation-2026-10-04.json"), "utf8"));

test("the private H264 timing candidate passes genuine small-fixture fidelity without claiming stress or memory acceptance", () => {
  assert.deepEqual(evidence.conversionValidation, { passed: 2, failed: 0 });
  const converted = evidence.rows.filter((row) => row.status === "passed" && row.container);
  assert.deepEqual(converted.map((row) => row.container), ["mp4", "mkv"]);
  for (const row of converted) {
    assert.equal(row.sourceCodec, "mpeg4");
    assert.equal(row.outputCodec, "h264");
    assert.equal(Number(row.frames), 48);
    assert.equal(row.audioTracks, 2);
    assert.equal(row.audioPacketHashes.length, 2);
    assert.ok(row.ssim >= 0.98);
    assert.equal(row.sourceFrameTimes.length, 48);
    for (let i = 0; i < 48; i++) assert.ok(Math.abs(row.sourceFrameTimes[i] - row.outputFrameTimes[i]) <= 0.001);
    assert.equal(row.metrics.peakWasmMemoryBytes, 64 * 1024 * 1024);
    assert.ok(row.metrics.peakQueuedBytes <= 256 * 1024);
    assert.ok(row.metrics.peakPendingOperations <= 1);
    assert.equal(row.metrics.pendingOperations, 0);
    assert.equal(row.metrics.queuedBytes, 0);
  }
  const fault = evidence.rows.find((row) => row.kind === "direct-write-failure");
  assert.equal(fault.status, "passed");
  assert.ok(fault.partialBytes.every((bytes) => bytes === 0));
  assert.equal(evidence.primaryIncrementalPrivateMiB, null);
  assert.equal(evidence.publicProfilesChanged, false);
  assert.equal(evidence.publicEnginesChanged, false);
  assert.ok(evidence.requiredRemainingGates.includes("complete-process private memory <=250 MiB"));
  assert.equal(evidence.cleanup.status, "verified-disposable-cleanup-with-explicit-static-tool-reuse");
  assert.equal(evidence.cleanup.hostedArtifactsRemaining, 0);
  assert.equal(evidence.cleanup.generatedDistEnginesMatchPublishedHashes, true);
  assert.equal(evidence.cleanup.retainedStaticCandidate.bytes, 8294487);
});

test("the accepted small H264 timing fixes are bound to current native, patch and browser sources", async () => {
  for (const [file, expected] of Object.entries(evidence.currentSources)) {
    assert.equal(createHash("sha256").update(await readFile(path.join(root, file))).digest("hex"), expected, file);
  }
  // This exact as-built small-fixture success precedes the immutable-dimension
  // safety fix. Keep its historical kernel hash rather than relabelling it.
  assert.equal(evidence.asBuiltManifest.candidateKernelSha256,
    "e9b45d17c9c95475c0d1900c25e5d2af9a32bfe9f460876e0fe7da59aa548061");
  assert.equal(evidence.asBuiltManifest.matroskaNoCuesPatchSha256, evidence.currentSources["media/ffmpeg/patches/matroska-bounded-no-cues.patch"]);
  assert.equal(evidence.asBuiltManifest.allowMemoryGrowth, false);
  assert.equal(evidence.asBuiltManifest.maximumWasmMemoryBytes, 64 * 1024 * 1024);
  assert.equal(evidence.asBuiltManifest.encoderFrameSkipping, false);
});
