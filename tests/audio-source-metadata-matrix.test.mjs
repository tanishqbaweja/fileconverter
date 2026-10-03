import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { conversionProfiles } from "../lib/capability-registry.ts";

const evidence = JSON.parse(await readFile(new URL(
  "../evidence/audio-source-metadata-matrix-2026-10-03.json", import.meta.url,
), "utf8"));
const browserSource = await readFile(new URL(
  "../tests/browser/audio-source-metadata.spec.ts", import.meta.url,
), "utf8");

test("M-08 Unicode field evidence covers six source containers and nine public routes", () => {
  assert.equal(evidence.test.passed, 9);
  assert.equal(evidence.test.failed, 0);
  assert.equal(evidence.cases.length, 9);
  assert.deepEqual([...new Set(evidence.cases.map((row) => row.sourceId))].sort(),
    ["aiff", "alac", "flac", "mp3", "wav", "wma"]);
  assert.equal(new Set(evidence.cases.map((row) => row.profileId)).size, 9);
  for (const row of evidence.cases) {
    assert.ok(conversionProfiles.some((profile) =>
      profile.id === row.profileId && profile.public && profile.automatedTestStatus === "passed"));
    assert.equal(row.expectedFields.length, row.sourceId === "aiff" ? 4 : 7);
    assert.deepEqual(row.missingFields, []);
    assert.match(row.sourceSha256, /^[a-f0-9]{64}$/);
    assert.match(row.outputSha256, /^[a-f0-9]{64}$/);
  }
});

test("independent canonical decoder checks preserve exact PCM identity, not a relaxed tolerance", () => {
  const lossless = evidence.cases.filter((row) => row.losslessOutput);
  assert.equal(lossless.length, 8);
  for (const row of lossless) assert.equal(row.outputPcmSha256, row.sourcePcmSha256);
  const mp3 = evidence.cases.find((row) => row.sourceId === "mp3");
  const wma = evidence.cases.find((row) => row.sourceId === "wma");
  assert.deepEqual(mp3.nativeReferenceDecoderOptions, ["-c:a", "mp3"]);
  assert.deepEqual(wma.nativeReferenceDecoderOptions, ["-cpuflags", "0"]);
  for (const row of [mp3, wma]) {
    assert.equal(row.defaultNativeDecoderDifference.peakAbsoluteDifference, 1);
    assert.equal(row.matchingNativeDecoderDifference.differingSamples, 0);
    assert.equal(row.matchingNativeDecoderDifference.peakAbsoluteDifference, 0);
    assert.equal(row.matchingNativeDecoderDifference.sourceSamples,
      row.matchingNativeDecoderDifference.outputSamples);
  }
  assert.equal(evidence.cases.filter((row) => !row.losslessOutput).length, 1);
});

test("small metadata browser evidence remains bounded and anchored to the executable suite", async () => {
  assert.equal(createHash("sha256").update(browserSource).digest("hex"), evidence.test.sha256);
  const wasm = await readFile(new URL("../public/engines/remux/within-remux.wasm", import.meta.url));
  assert.equal(createHash("sha256").update(wasm).digest("hex"), evidence.engine.sha256);
  for (const row of evidence.cases) {
    assert.ok(row.sourceBytes < 1024 * 1024 && row.outputBytes < 1024 * 1024);
    assert.ok(row.maxReadBytes <= 256 * 1024 && row.maxWriteBytes <= 256 * 1024);
    assert.ok(row.peakQueuedBytes <= 256 * 1024);
    assert.equal(row.peakPendingOperations, 1);
    assert.equal(row.terminalQueuedBytes, 0);
    assert.equal(row.terminalPendingOperations, 0);
    assert.equal(row.wasmBytes, 32 * 1024 * 1024);
  }
  assert.ok(browserSource.includes('if (file.size > 1024 * 1024)'));
  assert.ok(browserSource.includes('await rm(outputPath, { force: true })'));
  assert.ok(browserSource.includes('await rm(workRoot, { recursive: true, force: true })'));
  assert.ok(browserSource.includes('expect(remaining).toEqual([])'));
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("- audio-source-metadata"));
  assert.ok(workflow.includes('TMPDIR="$task_browser_tmp" npx playwright test'));
  assert.equal(evidence.cleanup.perConversionOpfsEmpty, true);
  assert.equal(evidence.engine.changed, false);
  assert.ok(evidence.limitations.some((item) => item.includes("no new complete-process memory")));
});

test("CI repository-local browser temporary paths fit Linux singleton sockets", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes('mktemp -d "$GITHUB_WORKSPACE/work/t.XXXXXX"'));
  const workspace = "/home/runner/work/fileconverter/fileconverter";
  const socketSuffix = "/org.chromium.Chromium.165DAM/SingletonSocket";
  const rejected = `${workspace}/work/ci-browser-streaming-conversions-AQ7rYA${socketSuffix}`;
  const retained = `${workspace}/work/t.ABCDEF${socketSuffix}`;
  assert.ok(Buffer.byteLength(rejected) >= 108);
  assert.ok(Buffer.byteLength(retained) < 108);
  assert.ok(workflow.includes("trap 'rm -rf --"));
});
