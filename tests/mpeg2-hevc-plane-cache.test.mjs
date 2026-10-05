import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const evidence = JSON.parse(await source("evidence/mpeg2-uncached-encoder-protected-failure-2026-10-05.json"));

test("Encoder-only uncaching passes genuine strict small conversion but not unchanged protected source", () => {
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.primaryMemoryAcceptance, false);
  assert.equal(evidence.speedGainClaim, null);
  assert.equal(evidence.manifest.allocatorDiagnostic, false);
  assert.equal(evidence.small.suite.passed, 3);
  assert.equal(evidence.small.suite.failed, 0);
  const encoded = evidence.small.genuineEncode;
  assert.equal(encoded.outputCodec, "mpeg2video");
  assert.equal(encoded.frames, "48");
  assert.equal(encoded.outputBytes, 321692);
  assert.equal(encoded.outputSha256, "74def572f4ff85144603c7fe579195e44cfc5417d63406d5eb530d377dbf6b4b");
  assert.ok(encoded.ssim >= 0.98);
  assert.equal(encoded.sourceFrameTimes.length, encoded.outputFrameTimes.length);
  encoded.sourceFrameTimes.forEach((t, i) => assert.ok(Math.abs(t - encoded.outputFrameTimes[i]) <= 0.001));
  const normalize = (tags) => Object.fromEntries(Object.entries(tags).map(([k, v]) => [k.toLowerCase(), v]));
  const output = normalize(evidence.small.outputContainerTags);
  for (const [key, value] of Object.entries(normalize(evidence.small.sourceContainerTags)))
    assert.equal(output[key], value, key);
  assert.equal(evidence.small.art.compressedArtworkHash,
    "SHA256=c2054a5f9be34cf027cbf53657509e0f9ddaa66caa4587c10d5a679be5396112");
  assert.equal(evidence.small.art.inputArt.width, evidence.small.art.outputArt.width);
  assert.equal(evidence.small.art.inputArt.height, evidence.small.art.outputArt.height);
  assert.equal(evidence.small.safety.length, 2);
  for (const row of evidence.small.safety) {
    assert.equal(row.status, "passed");
    assert.deepEqual(row.partialBytes, []);
    assert.equal(row.metrics.queuedBytes, 0);
    assert.equal(row.metrics.pendingOperations, 0);
  }
  assert.ok(evidence.small.safety.find((r) => r.kind === "cancel-after-direct-output").beforeCancel.outputBytes > 0);
});

test("Changed native allocation failure records full tree and no heap-saving or speed inference", () => {
  assert.equal(evidence.protectedSource.bytes, 2958573265);
  assert.equal(evidence.protectedSource.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(evidence.protectedSource.width, 1920);
  assert.equal(evidence.protectedSource.height, 804);
  const failed = evidence.fullRetry;
  assert.equal(failed.status, "failed");
  assert.equal(failed.diagnosticOnly, false);
  assert.equal(failed.requestedRuns, 3);
  assert.equal(failed.attemptedRuns, 1);
  assert.equal(failed.independentValidation, null);
  assert.match(failed.failure.message, /34551456 bytes \(OOM\)/);
  assert.match(failed.failure.message, /av_refstruct_pool_get/);
  assert.match(failed.failure.message, /alloc_frame/);
  assert.equal(failed.metrics.inputBytes, 353857);
  assert.equal(failed.metrics.outputBytes, 0);
  assert.equal(failed.metrics.wasmMemoryBytes, 33554432);
  assert.equal(failed.nativePeaks.peak.processes.reduce((s, p) => s + p.privateBytes, 0), failed.nativePeaks.peak.privateBytes);
  assert.equal((failed.peakPrivateBytes - failed.blankBaseline.privateBytes) / 1024 ** 2, failed.incrementalPrivateMiB);
  assert.ok(Object.values(failed.cleanup).every((x) => x === true));
  assert.deepEqual(failed.forbiddenRequests, []);
  assert.equal(evidence.cleanup.remainingHostedArtifacts, 0);
  assert.equal(evidence.cleanup.convertedCopiesRemaining, 0);
  assert.equal(evidence.nextInvestigation.claimOfMeasuredMemorySavings, false);
  assert.equal(evidence.nextInvestigation.inactiveDecoderPoolBytesAtFailure, null);
  assert.equal(evidence.nextInvestigation.provenFit, false);
});

test("HEVC follow-up changes only private pixel-cache predicate, with pinned two-stage reversal and heap", async () => {
  const patch = await source("media/ffmpeg/patches/hevc-decoder-uncached-frame-buffers.patch");
  const removed = patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
  assert.equal(removed.length, 3);
  assert.ok(removed.slice(0, 2).every((l) => l.includes("//")));
  assert.equal(removed[2], "-        pic->buf[i] = av_codec_is_encoder(s->codec)");
  assert.match(patch, /s->codec_id == AV_CODEC_ID_HEVC/);
  assert.doesNotMatch(patch, /tab_mvf|rpl_tab|av_refstruct|av_frame_unref|av_buffer_unref|avcodec_align_dimensions|av_image_fill|qmin|qmax|skip_frame|width\s*=|height\s*=/);
  const recipe = await source("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /hevc-decoder-uncached-frame-buffers.patch" source-bundle\//);
  assert.match(recipe, /910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4/);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=33554432" "-sMAXIMUM_MEMORY=33554432"/);
  const manifest = await source("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /HEVC decoder uncached planes/);
  assert.match(manifest, /other decoder and HEVC auxiliary pools unchanged/);
  const checker = await source("scripts/verify-mpeg2-frame-pool-patch.mjs");
  assert.match(checker, /assert.equal\(encoderStage, after\)/);
  assert.match(checker, /assert.equal\(restored, before\)/);
  assert.match(checker, /runtime.close\(\)/);
});
