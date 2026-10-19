import assert from "node:assert/strict";
const canonicalBirth = value => {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,7}))?Z$/.exec(value);
  assert.ok(match); return `${match[1]}.${(match[2] ?? "").padEnd(7,"0")}Z`;
};
const birthKey = row => `${row.pid}:${canonicalBirth(row.createdAt)}`;
// Win32_Process truncates the100ns native FILETIME to microseconds. Match only
// that explicitly observed precision for classification, NEVER for subtraction.
export const wmiBirthKey = row => `${row.pid}:${canonicalBirth(row.createdAt).slice(0,-2)}Z`;
export function attributeJspiRetention(report) {
  const identityTypes = new Map();
  for (const sample of report.samples) for (const process of sample.processes ?? []) {
    if (!process.type || process.type === "unknown") continue;
    const key = wmiBirthKey(process), previous = identityTypes.get(key);
    if (previous) assert.equal(previous, process.type, "One process birth must not change classification");
    identityTypes.set(key, process.type);
  }
  const microBirths = new Map();
  for (const identity of report.nativeMemory.identities) {
    const key = wmiBirthKey(identity), previous = microBirths.get(key);
    if (previous) assert.equal(previous, birthKey(identity), "Ambiguous PID reuse at WMI precision cannot be classified");
    microBirths.set(key, birthKey(identity));
  }
  const names = ["loaded-idle", "cleanup-1", "cleanup-2", "cleanup-3"];
  const snapshots = names.map(phase => {
    const aggregate = report.nativeMemory.phases.find(row => row.phase === phase), sample = aggregate?.last;
    assert.ok(sample && sample[3] != null && sample[6] == null, "A missing native snapshot cannot be treated as zero");
    const processes = sample[7].map(([id, privateBytes, rssBytes]) => {
      const identity = report.nativeMemory.identities[id]; assert.ok(identity);
      assert.ok(Number.isSafeInteger(privateBytes) && privateBytes >= 0);
      return { id, ...identity, type: identityTypes.get(wmiBirthKey(identity)) ?? identity.type, privateBytes, rssBytes };
    });
    assert.equal(processes.reduce((sum, row) => sum + row.privateBytes, 0), sample[3]);
    return { phase, timestamp: sample[1], sequence: sample[0], privateBytes: sample[3], processes };
  });
  const orderedBirths = snapshot => snapshot.processes.map(birthKey).sort();
  for (const snapshot of snapshots) assert.deepEqual(orderedBirths(snapshot), orderedBirths(snapshots[0]), "Only matching measured process births may be subtracted");
  const perProcess = snapshots[0].processes.map(identity => {
    const privateBytes = snapshots.map(snapshot => snapshot.processes.find(row => birthKey(row) === birthKey(identity)).privateBytes);
    return { pid: identity.pid, createdAt: identity.createdAt, type: identity.type, privateBytes,
      stepChangesBytes: privateBytes.slice(1).map((value, index) => value - privateBytes[index]),
      loadedToFinalBytes: privateBytes.at(-1) - privateBytes[0] };
  });
  const changes = snapshots.slice(1).map((snapshot, index) => {
    const processChanges = perProcess.map(row => ({ pid: row.pid, createdAt: row.createdAt, type: row.type, deltaBytes: row.stepChangesBytes[index] }));
    const deltaBytes = snapshot.privateBytes - snapshots[index].privateBytes;
    assert.equal(processChanges.reduce((sum, row) => sum + row.deltaBytes, 0), deltaBytes);
    return { from: names[index], to: names[index + 1], deltaBytes, processChanges };
  });
  const last = changes.at(-1), lastRendererDeltaBytes = last.processChanges.filter(row => row.type === "renderer").reduce((sum, row) => sum + row.deltaBytes, 0);
  const stableRecoveries = report.runs.map(run => ({ number: run.number, privateBytes: run.recovery.privateBytes,
    aboveLoadedMiB: (run.recovery.privateBytes - report.loadedIdle.privateBytes) / 1048576 }));
  const finalSample = report.samples.findLast(row => row.phase === "cleanup-3" && row.cdpIsolateHeaps?.targetsAvailable);
  assert.ok(finalSample); const realms = finalSample.cdpIsolateHeaps.targets;
  assert.equal(finalSample.metrics.wasmMemoryBytes, 0); assert.equal(finalSample.metrics.sharedArrayBufferBytes, 4);
  const compiled = report.progressProbe.compiledCacheEvents.filter(row => row.event === "compiled");
  assert.equal(compiled.length, 2); assert.ok(report.progressProbe.compiledCacheEvents.every(row => row.modules <= 2));
  return { status: "saved-full-session-retention-attributed-to-processes-not-allocations",
    snapshotKind: "Last simultaneous native sample in each phase; NOT stable-window median or sum of per-process maxima",
    classificationTimestampPrecisionNanoseconds: 1000, processSubtractionTimestampPrecisionNanoseconds: 100,
    snapshots, perProcess, changes, lastRendererDeltaBytes,
    stableLoadedPrivateBytes: report.loadedIdle.privateBytes, stableRecoveries,
    retainedSamplePhases: [...new Set(report.samples.map(row => row.phase))], finalRealms: realms,
    earlierCleanupRealmSamplesAvailable: ["cleanup-1", "cleanup-2"].map(phase => ({ phase, available: report.samples.some(row => row.phase === phase && row.cdpIsolateHeaps?.targetsAvailable) })),
    lastStateWasmBytes: finalSample.metrics.wasmMemoryBytes, lastStateSharedBytes: finalSample.metrics.sharedArrayBufferBytes,
    compiledModuleCount: compiled.length, workerLifecycle: report.progressProbe.handoffWorkerEventSummary,
    browserPhysicallyStoppedAfterReport: report.cleanup.sampledChromeRootStopped,
    allocationCause: null, zeroPrivateGrowthProven: false, noLeakProven: false,
    rendererProcessToPageMappingProven: false, anotherUnchangedFullConversionNeededForThisAttribution: false,
    acceptanceMetricChanged: false, publicAcceptance: false };
}
