// Read-only interpretation of retained samples. Never changes private-byte totals.
import assert from "node:assert/strict";
import { annotateNativeProcessTypes } from "./chromium-attribution.mjs";
const MiB = 1048576;
const sum = processes => processes.reduce((total, row) => {
  assert.ok(Number.isSafeInteger(row.privateBytes) && row.privateBytes > 0); return total + row.privateBytes;
}, 0);
function birthMicroseconds(iso) {
  const parts = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/.exec(iso ?? ""); assert.ok(parts, "Captured birth required");
  return BigInt(Date.parse(parts[1] + "Z")) * 1000n + BigInt((parts[2] ?? "").padEnd(6, "0").slice(0, 6));
}
const identity = row => `${row.pid}:${row.parentPid}:${birthMicroseconds(row.createdAt)}`;
export function analyzeRetainedSvgAllocation(browser) {
  assert.equal(browser.blankBaseline.stable, true); assert.equal(browser.baselineAdjusted, false);
  assert.ok(browser.memory.validSamples > 0); assert.equal(browser.memory.unavailableSamples, 0);
  const baseline = browser.blankSamples.find(row => row.privateBytes === browser.blankBaseline.privateBytes);
  assert.ok(baseline, "Use an actual complete sample equal to the stable median, never synthetic per-process values");
  assert.equal(baseline.sampleError, null); assert.equal(sum(baseline.processes), baseline.privateBytes);
  const rawPeak = browser.memory.peak; assert.equal(rawPeak.sampleError, null); assert.equal(sum(rawPeak.processes), rawPeak.privateBytes);
  assert.ok(rawPeak.processes.length <= 128 && baseline.processes.length <= 128);
  const roots = rawPeak.processes.filter(row => row.type === "browser"); assert.equal(roots.length, 1);
  const peak = structuredClone(rawPeak);
  annotateNativeProcessTypes([peak], [{ tree: baseline }], roots[0].pid);
  assert.equal(sum(peak.processes), rawPeak.privateBytes, "Annotations must never remove a process or alter memory");
  const byBirth = new Map(baseline.processes.map(row => [identity(row), row]));
  assert.equal(byBirth.size, baseline.processes.length);
  const processes = peak.processes.map(row => {
    const prior = byBirth.get(identity(row));
    const knownBornAfterBaseline = !prior && Date.parse(row.createdAt) > Date.parse(browser.blankBaseline.lastTimestamp);
    return { pid: row.pid, parentPid: row.parentPid, createdAt: row.createdAt, creationFileTime: row.creationFileTime,
      type: row.type, utilitySubtype: row.utilitySubtype ?? null, sandboxType: row.sandboxType ?? null,
      roleEvidence: prior && row.type !== "unknown" ? "same-PID-parent-and-birth-at-shared-microsecond-precision-in-captured-blank-sample" : "not-resolved-from-retained-baseline",
      peakPrivateBytes: row.privateBytes, blankPrivateBytes: prior?.privateBytes ?? null,
      measuredGrowthBytes: prior ? row.privateBytes - prior.privateBytes : null,
      measuredGrowthMiB: prior ? (row.privateBytes - prior.privateBytes) / MiB : null,
      knownBornAfterBaseline, missingBaselineValueReplacedWithZero: false };
  }).sort((a, b) => (b.measuredGrowthBytes ?? -Infinity) - (a.measuredGrowthBytes ?? -Infinity));
  const perRealm = new Map();
  for (const sample of browser.realmSamples) for (const target of sample.targets ?? []) {
    let row = perRealm.get(target.targetId);
    if (!row) { assert.ok(perRealm.size < 128); row = { targetId: target.targetId, type: target.type, firstObserved: sample.timestamp,
      lastObserved: sample.timestamp, validHeapSamples: 0, unavailableHeapSamples: 0, maximumUsedJsHeapBytes: null,
      maximumAllocatedJsHeapBytes: null, lastError: null }; perRealm.set(target.targetId, row); }
    row.lastObserved = sample.timestamp;
    if (target.usedJSHeapBytes == null) row.unavailableHeapSamples++;
    else { assert.ok(Number.isFinite(target.usedJSHeapBytes) && target.usedJSHeapBytes >= 0); row.validHeapSamples++;
      row.maximumUsedJsHeapBytes = Math.max(row.maximumUsedJsHeapBytes ?? 0, target.usedJSHeapBytes); }
    if (target.allocatedJSHeapBytes != null) row.maximumAllocatedJsHeapBytes = Math.max(row.maximumAllocatedJsHeapBytes ?? 0, target.allocatedJSHeapBytes);
    if (target.error) row.lastError = target.error;
  }
  const incrementalPrivateMiB = (rawPeak.privateBytes - baseline.privateBytes) / MiB;
  assert.equal(incrementalPrivateMiB, browser.memory.incrementalPrivateMiB);
  return { stableBaselineSample: { timestamp: baseline.timestamp, privateBytes: baseline.privateBytes },
    peak: { timestamp: peak.timestamp, privateBytes: peak.privateBytes, processCount: peak.processes.length },
    incrementalPrivateMiB, limitMiB: 250, passed: incrementalPrivateMiB <= 250,
    processCountOrTotalsChanged: false, formulaChanged: false, processes, realmHeaps: [...perRealm.values()],
    jsHeapOrWasmUsedAsAcceptanceMetric: false, specificAllocationStacksProven: false,
    staleWorkerHeapFailureProvesProductionWorkerLeak: false,
    sourceOfMetadata: "Captured blank sample, not process names guessed from sizes or current live processes",
    cleanupAuthority: false };
}
