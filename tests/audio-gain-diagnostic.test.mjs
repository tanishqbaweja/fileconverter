import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { comparePcm16 } from "../scripts/lib/streaming-audio-fidelity.mjs";
const pcm = values => { const bytes = Buffer.alloc(values.length * 2); values.forEach((value, index) => bytes.writeInt16LE(value, index * 2)); return bytes; };
const chunks = async function*(bytes) { yield bytes.subarray(0, 1); yield bytes.subarray(1, 7); yield bytes.subarray(7); };
test("optional gain diagnosis computes exact unmodified power/cross-product across odd chunks; default result remains unchanged", async () => {
  const data = pcm([20000, -20000, 0, 5000, -5000]);
  const normal = await comparePcm16(chunks(data), chunks(data), { lossless: true });
  const diagnosed = await comparePcm16(chunks(data), chunks(data), { lossless: true, diagnoseGain: true });
  const { amplitudeDiagnostic, ...base } = diagnosed; assert.deepEqual(base, normal); assert.equal(Object.hasOwn(normal, "amplitudeDiagnostic"), false);
  assert.equal(amplitudeDiagnostic.sourcePower, 850000000); assert.equal(amplitudeDiagnostic.outputPower, 850000000);
  assert.equal(amplitudeDiagnostic.crossProduct, 850000000); assert.equal(amplitudeDiagnostic.leastSquaresGain, 1);
  assert.equal(amplitudeDiagnostic.rawSquaredError, 0); assert.equal(amplitudeDiagnostic.leastSquaresResidualSquaredError, 0);
});
test("a95percent-amplitude fit remains a FAILED raw60dB comparison; no normalization, trimming or acceptance substitution", async () => {
  const source = pcm([20000, -20000, 10000, -10000]), output = pcm([19000, -19000, 9500, -9500]);
  await assert.rejects(comparePcm16(chunks(source), chunks(output), { diagnoseGain: true }), error => {
    assert.match(error.message, /below60dB/); assert.equal(error.fidelity.minimumPsnrDb, 60); assert.equal(error.fidelity.samples, 4);
    const diagnostic = error.fidelity.amplitudeDiagnostic;
    assert.equal(diagnostic.leastSquaresGain, 0.95); assert.equal(diagnostic.sourcePower, 1000000000);
    assert.equal(diagnostic.outputPower, 902500000); assert.equal(diagnostic.crossProduct, 950000000);
    assert.equal(diagnostic.rawSquaredError, 2500000); assert.equal(diagnostic.leastSquaresResidualSquaredError, 0);
    assert.ok(Math.abs(diagnostic.gainComponentSquaredError - 2500000) < 1e-6);
    assert.equal(diagnostic.acceptanceUsesUnmodifiedSamples, true); assert.equal(diagnostic.audioNormalized, false);
    assert.equal(diagnostic.alignmentApplied, false); assert.equal(diagnostic.thresholdChanged, false); return true;
  });
});
test("silence does not invent a gain or correlation, and malformed options/truncation still fail", async () => {
  const silence = pcm([0, 0, 0, 0]), near = pcm([1, -1, 1, -1]);
  const result = await comparePcm16(chunks(silence), chunks(near), { diagnoseGain: true });
  assert.equal(result.amplitudeDiagnostic.leastSquaresGain, null); assert.equal(result.amplitudeDiagnostic.correlation, null);
  await assert.rejects(comparePcm16(chunks(silence), chunks(near.subarray(0, 6)), { diagnoseGain: true }), /counts differ/);
  await assert.rejects(comparePcm16(chunks(silence), chunks(silence), { diagnoseGain: "yes" }));
});
test("new one-job browser diagnostic pins prior complete output/PCM/MSE and actual automatic argument without changing pass criteria", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--mp3-gain-diagnostic/); assert.match(source, /mp3GainDiagnostic \? \[\{ source: "flac", destination: "mp3", artwork: "png", gainDiagnostic: true \}\]/);
  assert.match(source, /diagnoseGain: true/); assert.match(source, /row.gainDiagnostic = row.fidelity.amplitudeDiagnostic/);
  assert.match(source, /sameRetainedAutomaticBytesAndUnmodifiedPcm/); assert.ok(source.includes("4710ff605bb185db713b003a3b985ced3094dde4ea0c4a01c81501f33571dcaf"));
  assert.match(source, /row.fidelity.squaredError, 2016507993/); assert.match(source, /nativeCode: 0, automaticPolicy: null/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
});
