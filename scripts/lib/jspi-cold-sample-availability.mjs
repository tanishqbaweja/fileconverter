// Enforce the ORIGINAL unavailable=null/excluded contract, never zero-fill.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export function inspectColdSampleAvailability(report) {
  const native = report.nativeMemory; assert.equal(native.error, null);
  const exceptions = []; let acquired = 0, unavailable = 0;
  for (const phase of native.phases) {
    for (const field of ["validSamples", "unavailableSamples", "firstSequence", "lastSequence"]) assert.ok(Number.isInteger(phase[field]) && phase[field] >= 0);
    assert.ok(phase.validSamples > 0);
    const visits = native.transitions.filter(row => row.phase === phase.phase).length;
    assert.ok(visits > 0);
    if (visits === 1) assert.equal(phase.validSamples + phase.unavailableSamples, phase.lastSequence - phase.firstSequence + 1,
      "A single uninterrupted phase must retain complete acquisition counts, not hide gaps");
    else assert.ok(phase.validSamples + phase.unavailableSamples <= phase.lastSequence - phase.firstSequence + 1,
      "A revisited phase such as the lower final blank excludes intervening phases");
    acquired += phase.validSamples + phase.unavailableSamples; unavailable += phase.unavailableSamples;
    assert.equal(phase.unavailableExamples.length, phase.unavailableSamples,
      "Cannot independently accept missing acquisitions whose bounded failure records are absent");
    const failed = new Set(phase.unavailableExamples.map(row => row[0])); assert.equal(failed.size, phase.unavailableSamples);
    for (const row of phase.unavailableExamples) {
      assert.equal(row[2], phase.phase); assert.equal(row[3], null); assert.equal(row[4], null); assert.equal(row[7], null);
      assert.ok(Number.isFinite(Date.parse(row[1]))); assert.match(row[6], /^(?:Toolhelp snapshot|OpenProcess \d+)$/);
      assert.equal(native.transitions.findLast(value => value.at <= Date.parse(row[1]))?.phase, phase.phase);
      assert.ok(row[0] > phase.firstSequence && row[0] < phase.lastSequence, "Unavailable phase boundary is not covered");
      assert.ok(!failed.has(row[0] - 1) && !failed.has(row[0] + 1), "Consecutive native gaps require separate investigation");
      exceptions.push({ sequence: row[0], timestamp: row[1], phase: row[2], privateBytes: null, rssBytes: null,
        processRows: null, sampleError: row[6], isolatedFailureInCompletePhaseCounts: true });
    }
    for (const peak of [phase.peak, phase.rssPeak]) {
      assert.ok(peak && peak[3] > 0 && peak[4] > 0); assert.equal(peak[6], null);
      assert.equal(peak[3], peak[7].reduce((sum, row) => sum + row[1], 0));
    }
  }
  assert.equal(acquired, native.sequence); assert.equal(unavailable, report.nativeFailureCapture.unavailableSamples);
  const conversionPhases = native.phases.filter(row => /^(?:pre-conversion|conversion)-[123]$/.test(row.phase));
  assert.equal(conversionPhases.length, 6);
  assert.equal(conversionPhases.reduce((sum, row) => sum + row.validSamples, 0), report.nativeFailureCapture.evaluatedConversionSamples);
  const cimUnavailable = report.samples.filter(row => row.privateBytes == null || row.sampleError != null).map(row => {
    assert.equal(row.privateBytes, null); assert.equal(row.rssBytes, null); assert.equal(row.processes, null);
    assert.ok(typeof row.sampleError === "string" && row.sampleError.length > 0);
    const phase = native.phases.find(value => value.phase === row.phase); assert.ok(phase && phase.validSamples > 0);
    assert.equal(phase.unavailableSamples, 0, "A failed CIM phase must have uninterrupted independent native acquisition for this audit");
    return { timestamp: row.timestamp, phase: row.phase, privateBytes: null, rssBytes: null,
      sampleErrorSha256: createHash("sha256").update(row.sampleError).digest("hex"),
      nativePhaseValidSamples: phase.validSamples, nativePhaseUnavailableSamples: 0 };
  });
  return { intervalMs: native.intervalMs, acquisitionCount: acquired, validSamples: acquired - unavailable, unavailableSamples: unavailable,
    exceptions, unavailableCimRetained: cimUnavailable, perRun: [1,2,3].map(number => {
      const row = native.phases.find(value => value.phase === `conversion-${number}`);
      return { number, validSamples: row.validSamples, unavailableSamples: row.unavailableSamples };
    }), missingValuesPreservedAsNullAndExcludedFromPeaks: true, noSyntheticSamplesOrZeroFill: true,
    original250MiBLimitAndSamplingCadenceChanged: false,
    limitation: "The next acquisition resumes after each isolated failure by the complete phase/sequence counts; exact neighbouring100ms timestamps are not retained after graph-ring eviction. Missing is unavailable, never proof of zero memory." };
}
