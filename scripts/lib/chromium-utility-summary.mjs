// Diagnostic attribution only. Never replaces the complete-tree acceptance formula.
export function summarizeUtilityActivity(samples) {
  const phases = new Map(), utilities = new Map();
  for (const sample of samples) {
    if (!phases.has(sample.phase)) phases.set(sample.phase, {
      phase: sample.phase, availableSamples: 0, unavailableSamples: 0,
      minimumPrivateBytes: null, peakPrivateBytes: null, peakSample: null,
    });
    const phase = phases.get(sample.phase);
    if (!Number.isFinite(sample.privateBytes) || !Array.isArray(sample.processes)) {
      phase.unavailableSamples++;
      continue;
    }
    phase.availableSamples++;
    phase.minimumPrivateBytes = Math.min(phase.minimumPrivateBytes ?? Infinity, sample.privateBytes);
    if (phase.peakPrivateBytes == null || sample.privateBytes > phase.peakPrivateBytes) {
      phase.peakPrivateBytes = sample.privateBytes;
      phase.peakSample = { timestamp: sample.timestamp, elapsedMs: sample.elapsedMs,
        privateBytes: sample.privateBytes, rssBytes: sample.rssBytes, processes: sample.processes };
    }
    for (const entry of sample.processes) {
      if (entry.type !== "utility") continue;
      const key = `${entry.pid}:${entry.createdAt ?? "unknown-creation"}`;
      const parent = sample.processes.find((process) => process.pid === entry.parentPid);
      const age = Date.parse(entry.createdAt) - Date.parse(parent?.createdAt);
      if (!utilities.has(key)) utilities.set(key, {
        pid: entry.pid, parentPid: entry.parentPid, createdAt: entry.createdAt ?? null,
        utilitySubtype: entry.utilitySubtype ?? null, sandboxType: entry.sandboxType ?? null,
        firstSeenPhase: sample.phase, firstSeenTimestamp: sample.timestamp,
        browserAgeAtProcessCreationMs: parent?.type === "browser" && Number.isFinite(age) ? age : null,
        peakPrivateBytes: null, peakPhase: null, peakTimestamp: null, observations: 0,
      });
      const utility = utilities.get(key);
      utility.observations++;
      if (utility.peakPrivateBytes == null || entry.privateBytes > utility.peakPrivateBytes) {
        utility.peakPrivateBytes = entry.privateBytes;
        utility.peakPhase = sample.phase; utility.peakTimestamp = sample.timestamp;
      }
    }
  }
  return { phases: [...phases.values()], utilities: [...utilities.values()] };
}
