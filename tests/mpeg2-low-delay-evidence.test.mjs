import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("MPEG2 low-delay trial is anchored to actual failed buffer events and not accepted prematurely", async () => {
  const evidence = JSON.parse(await readFile(new URL(
    "../evidence/mpeg2-native-allocation-measured-2026-10-05.json", import.meta.url), "utf8"));
  assert.equal(evidence.publicAcceptance, false); assert.equal(evidence.primaryMemoryAcceptance, false);
  assert.equal(evidence.build.conclusion, "success");
  assert.equal(evidence.diagnosticOnly, true); assert.equal(evidence.requestedRuns, 1);
  assert.equal(evidence.sourceBytes, 2958573265);
  assert.equal(evidence.sourceSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(evidence.metrics.outputBytes, 0);
  assert.equal(evidence.allocatorSamples.length, 52); assert.equal(evidence.allocatorSamplesEvicted, 0);
  const allocated = evidence.allocatorSamples.filter((s) => s.phase === 18 && s.encoder);
  assert.equal(allocated.length, 3);
  for (const row of allocated) {
    assert.equal(row.width, 1952); assert.equal(row.height, 836);
    assert.equal(row.frameBufferBytes, 2529861);
  }
  const last = evidence.allocatorSamples.at(-1);
  assert.equal(last.phase, 17); assert.equal(last.encoder, true);
  assert.equal(last.dynamicHeapBytes, 30077208);
  assert.equal(last.freeDynamicBytes, 20180); assert.equal(last.unclaimedHeapBytes, 446152);
  for (const [i, row] of evidence.allocatorSamples.entries()) {
    assert.equal(row.sequence, i + 1);
    assert.equal(row.freeBlockSizeBuckets.length, 32);
    assert.ok(row.freeDynamicBytes <= row.dynamicHeapBytes);
  }
  assert.equal(evidence.nextChangedCandidate.provenFit, false);
  assert.equal(evidence.nextChangedCandidate.provenFidelity, false);
  assert.equal(evidence.nextChangedCandidate.provenSpeedGain, false);
  const kernel = await readFile(new URL("../media/ffmpeg/mpeg2-candidate.c", import.meta.url), "utf8");
  assert.match(kernel, /max_b_frames = 0/);
  assert.match(kernel, /p.encoder->flags \|= AV_CODEC_FLAG_LOW_DELAY/);
  assert.match(kernel, /p.encoder->qmin = quality == 1 \? 8 : quality == 3 \? 2 : 4/);
  assert.match(kernel, /p.encoder->qmax = quality == 1 \? 31 : quality == 3 \? 12 : 20/);
  assert.match(kernel, /p.encoder->width = p.decoder->width/);
});
