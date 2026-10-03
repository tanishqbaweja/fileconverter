import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const evidence = JSON.parse(await readFile(path.join(root, "evidence/h264-encoder-feasibility-2026-10-03.json"), "utf8"));

test("H264 build success cannot be mistaken for browser conversion acceptance", () => {
  assert.equal(evidence.status, "partial-private-candidate-runtime-failed-no-public-profile");
  assert.equal(evidence.buildAttempts[0].result, "failed");
  assert.equal(evidence.buildAttempts[1].result, "passed");
  assert.deepEqual(evidence.asBuiltManifest.enabledEncoders, ["libopenh264"]);
  assert.equal(evidence.asBuiltManifest.allowMemoryGrowth, false);
  assert.equal(evidence.asBuiltManifest.initialWasmMemoryBytes, 64 * 1024 * 1024);
  assert.equal(evidence.asBuiltManifest.maximumWasmMemoryBytes, 64 * 1024 * 1024);
  assert.equal(evidence.asBuiltManifest.pthreadPoolSize, 0);
  assert.ok(evidence.browser.attempts.every((attempt) => attempt.acceptedH264Conversions === 0));
  assert.match(evidence.browser.latestFailure.error, /wasm-function\[2213\]:0x33a22d/);
  assert.equal(evidence.browser.latestFailure.metrics.outputBytes, 2385);
  assert.equal(evidence.browser.latestFailure.metrics.peakWasmMemoryBytes, 64 * 1024 * 1024);
  assert.equal(evidence.diagnosticMemory.primaryIncrementalPrivateMiB, null);
  assert.match(evidence.diagnosticMemory.acceptance, /not-evaluated/);
  assert.ok(evidence.diagnosticMemory.samples.every((sample) => sample.privateBytes === null || sample.privateBytes > 0));
  assert.equal(evidence.publicProfilesChanged, false);
  assert.equal(evidence.publicEnginesChanged, false);
  assert.equal(evidence.protectedTestMkvUsed, false);
  assert.equal(evidence.cleanup.remoteRunRemainingArtifacts, 0);
  assert.equal(evidence.cleanup.distAssetsRestoredToPublishedHashes, true);
});

test("private candidate diagnosis is anchored to current sources without changing published cores", async () => {
  for (const [file, expected] of Object.entries(evidence.currentSources)) {
    const actual = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
    assert.equal(actual, expected, file);
  }
  const published = JSON.parse(await readFile(path.join(root, "public/engines/remux/build-manifest.json"), "utf8"));
  assert.ok(!published.enabledEncoders.includes("libopenh264"));
  assert.equal(evidence.asBuiltManifest.candidateKernelSha256, evidence.currentSources["media/ffmpeg/h264-candidate.c"]);
  assert.ok(evidence.asBuiltManifest.enabledDecoders.includes("vp8"));
  assert.ok(evidence.asBuiltManifest.enabledDecoders.includes("vp9"));
  const recipe = await readFile(path.join(root, "media/ffmpeg/build-h264-candidate.sh"), "utf8");
  assert.match(recipe, /--profiling-funcs --emit-symbol-map/);
  assert.doesNotMatch(recipe, /-sEMULATE_FUNCTION_POINTER_CASTS/);
});
