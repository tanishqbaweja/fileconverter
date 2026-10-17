import assert from "node:assert/strict";

export function inspectOriginalIdleObservation(report) {
  const idle = report.progressProbe.idleControl;
  assert.equal(idle.minimumMs, 1560000); assert.ok(idle.actualMs >= idle.minimumMs);
  assert.equal(idle.actualMs, idle.finishedAt - idle.startedAt);
  assert.ok(idle.observations > 0 && idle.observations <= 192);
  for (const key of ["noPageReload", "noForcedGc", "noNativeValidationLoad"]) assert.equal(idle[key], true);
  for (const key of ["successfulSaveExercised", "originalLongRunFailureResolved", "fullOriginalAcceptance", "publicAcceptance"]) assert.equal(idle[key], false);
  assert.equal(idle.resumeHost.safeToStart, true);
  assert.ok(idle.resumeHost.freePhysicalBytes >= 2147483648 && idle.resumeHost.freeVirtualBytes >= 2147483648);
  const phase = report.nativeMemory.phases.find(row => row.phase === "diagnostic-idle-after-cancel");
  assert.ok(phase.validSamples >= 13000); assert.equal(phase.unavailableSamples, 0);
  assert.ok((phase.peak[3] - report.blankBaseline.privateBytes) / 1048576 <= 250);
  const conversions = report.nativeMemory.phases.filter(row => /^conversion-[123]$/.test(row.phase));
  assert.equal(conversions.length, 3);
  const phases = conversions.map((row, index) => {
    assert.ok(row.validSamples >= 90); assert.equal(row.unavailableSamples, 0);
    assert.equal(row.peak[3], report.runs[index].peakPrivateBytes);
    return { phase: row.phase, validSamples: row.validSamples, unavailableSamples: row.unavailableSamples,
      peakPrivateBytes: row.peak[3], incrementalPrivateMiB: (row.peak[3] - report.blankBaseline.privateBytes) / 1048576 };
  });
  const events = report.progressProbe.handoffWorkerEvents;
  const retirementBeforeIdle = events.filter(event => event.role === "codec" && event.event === "closed" && event.observedAt <= idle.startedAt);
  assert.equal(retirementBeforeIdle.length, 1);
  assert.deepEqual(events.filter(event => event.observedAt > idle.startedAt && event.observedAt < idle.finishedAt), [],
    "Same replacement worker must remain alive throughout the complete idle interval");
  assert.ok(report.runs[1].plannedStartupStopAt > idle.finishedAt);
  return { scope: idle.scope, actualMs: idle.actualMs, observations: idle.observations,
    nativeIdleSamples: phase.validSamples, nativeIdleUnavailableSamples: phase.unavailableSamples,
    phases, startupPeakChangeAfterIdleMiB: phases[1].incrementalPrivateMiB - phases[0].incrementalPrivateMiB,
    nativeValidationLoadEmulated: false, successfulSaveExercised: false,
    elapsedIdleAloneReproducedLongRunExcess: false, allocationCause: null,
    fullOriginalAcceptance: false, publicAcceptance: false,
    interpretation: "A26min wait after normal cancellation did not reproduce the long-run failure. This does not test the successful final-save handoff, a completed long conversion, or native validators' CPU/memory pressure." };
}
