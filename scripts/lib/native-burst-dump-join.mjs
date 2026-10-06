// Join actual native trigger rows to the bounded trace's exact dump GUIDs.
// Allocator values overlap, trace PIDs have no birth IDs, and post-trigger dumps
// are NOT snapshots at the native peak. Never infer an object/callsite or sum.
import assert from "node:assert/strict";
const sameIdentity = (a, b) => a && b && a.pid === b.pid && a.parentPid === b.parentPid &&
  (a.creationFileTime && b.creationFileTime ? a.creationFileTime === b.creationFileTime
    : Number.isFinite(Date.parse(a.createdAt)) && Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) < 1);
const time = value => { const at = Date.parse(value); assert.ok(Number.isFinite(at)); return at; };
const difference = (current, earlier) => Number.isFinite(current) && Number.isFinite(earlier) ? current - earlier : null;

export function joinNativeBurstDumps(bursts, attribution) {
  assert.ok(bursts.events.length <= 8 && bursts.callbacks.length <= 8);
  assert.equal(new Set(bursts.events.map(event => event.after.sequence)).size, bursts.events.length);
  assert.equal(new Set(bursts.callbacks.map(row => row.sequence)).size, bursts.callbacks.length);
  assert.ok(attribution.dumps.length <= 8);
  const summaries = attribution.allocatorSummary ?? [];
  assert.ok(summaries.length <= 8);
  const baseline = attribution.dumps.find(row => row.phase === "pre-conversion-attribution") ?? null;
  const baselineSummary = baseline ? summaries.find(row => row.requestDumpGuid === baseline.memoryDump?.dumpGuid) : null;
  return bursts.callbacks.map(callback => {
    const event = bursts.events.find(event => event.after.sequence === callback.sequence);
    assert.ok(event, "Diagnostic callback requires its actual native trigger");
    assert.ok(event.after.processes.length > 0 && event.after.processes.length <= 128);
    const guid = callback.result?.success === true ? callback.result.dumpGuid : null;
    const dumpRows = guid ? attribution.dumps.filter(row => row.memoryDump?.dumpGuid === guid) : [];
    const summaryRows = guid ? summaries.filter(row => row.requestDumpGuid === guid) : [];
    assert.ok(dumpRows.length <= 1 && summaryRows.length <= 1, "Ambiguous dump GUID");
    const dump = dumpRows[0] ?? null, summary = summaryRows[0] ?? null;
    const requestedAt = dump ? time(dump.timestamp) : null;
    const completedAt = dump?.finishedAt ? time(dump.finishedAt) : null;
    if (requestedAt != null) assert.ok(requestedAt >= time(event.after.timestamp), "Dump cannot precede its trigger");
    if (completedAt != null) assert.ok(completedAt >= requestedAt);
    assert.ok(!summary || summary.processes.length <= 128);
    const processes = event.delta.processDeltas.filter(p => p.deltaPrivateBytes !== 0).map(delta => {
      const native = event.after.processes.find(p => p.pid === delta.pid && p.creationFileTime === delta.creationFileTime);
      assert.ok(native, "Delta/native identity mismatch");
      const preDump = dump?.processes?.find(p => sameIdentity(p, native)) ?? null;
      const trace = summary?.processes.find(p => p.pid === native.pid) ?? null;
      const baselineNative = baseline?.processes?.find(p => sameIdentity(p, native)) ?? null;
      const baselineTrace = baselineNative ? baselineSummary?.processes.find(p => p.pid === native.pid) : null;
      const allocatorDeltas = {};
      assert.ok(Object.keys(trace?.allocators ?? {}).length <= 64);
      for (const [name, attrs] of Object.entries(trace?.allocators ?? {})) {
        assert.ok(Object.keys(attrs).length <= 64);
        allocatorDeltas[name] = Object.fromEntries(Object.entries(attrs).map(([field, value]) =>
          [field, difference(value, baselineTrace?.allocators?.[name]?.[field])]));
      }
      return { nativeIdentity: { pid: native.pid, parentPid: native.parentPid, createdAt: native.createdAt,
        creationFileTime: native.creationFileTime }, nativeDeltaPrivateBytes: delta.deltaPrivateBytes,
        privateBytesAtNativeTrigger: native.privateBytes,
        matchingPreDumpNativeIdentity: Boolean(preDump), matchingBaselineIdentity: Boolean(baselineNative),
        tracePidJoinOnly: Boolean(trace), traceName: trace?.traceName ?? null,
        tracePrivateFootprintBytes: trace?.tracePrivateFootprintBytes ?? null,
        allocatorsAtDump: trace?.allocators ?? null, allocatorDeltasFromSameIdentityBaseline: allocatorDeltas,
        allocatorValuesOverlap: true, summedAllocatorTotal: null, allocationObjectOrCallsite: null };
    });
    return { triggerSequence: event.after.sequence, nativeAcquiredAt: event.after.timestamp,
      treeIncreaseBytes: event.delta.treeDeltaPrivateBytes, callbackStatus: callback.status,
      callbackError: callback.error, dumpGuid: guid, dumpRequestedAt: dump?.timestamp ?? null,
      dumpFinishedAt: dump?.finishedAt ?? null,
      acquisitionToDumpRequestMs: requestedAt == null ? null : requestedAt - time(event.after.timestamp),
      acquisitionToDumpCompletionMs: completedAt == null ? null : completedAt - time(event.after.timestamp),
      allocatorSummaryAvailable: Boolean(summary), processes,
      caveat: "Trace PID join has no birth ID. Native identity is matched only where supplied; dump is later than trigger, not proof of the peak's allocator/object/callsite. No original uninstrumented cause or summed allocation is inferred.",
      acceptanceMetric: false, originalFailureCause: null };
  });
}
