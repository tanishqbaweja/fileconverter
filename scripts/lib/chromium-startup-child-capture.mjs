import assert from "node:assert/strict";
export const STARTUP_CHILD_LIMITS = Object.freeze({ beginMs: 178000, endMs: 188000,
  maximumQueries: 32, maximumMetadataRows: 32, maximumSamples: 2200, maximumStdoutBytes: 524288 });

// No filtering or subtraction of native processes. Join metadata only when
// PID, parent and exact native100ns birth all agree, including reused PIDs.
export function joinStartupChildMetadata(samples, events, rootPid, rootCreatedFileTime) {
  assert.ok(Number.isSafeInteger(rootPid) && rootPid > 0); assert.match(rootCreatedFileTime, /^\d{17,19}$/);
  assert.ok(samples.length <= STARTUP_CHILD_LIMITS.maximumSamples);
  const children = events.filter(row => row.event === "child"); assert.ok(children.length <= STARTUP_CHILD_LIMITS.maximumMetadataRows);
  const keys = new Set();
  return children.map(child => {
    assert.equal(child.parentPid, rootPid); assert.ok(Number.isSafeInteger(child.pid) && child.pid > 0 && child.pid !== rootPid);
    assert.match(child.creationFileTime, /^\d{17,19}$/); assert.ok(BigInt(child.creationFileTime) >= BigInt(rootCreatedFileTime));
    assert.ok(typeof child.commandLine === "string" && child.commandLine.length <= 16384);
    assert.ok(typeof child.type === "string" && child.type.length <= 128);
    for (const field of ["utilitySubtype", "sandboxType"]) assert.ok(child[field] === null || (typeof child[field] === "string" && child[field].length <= 256));
    const key = child.pid + ":" + child.creationFileTime; assert.equal(keys.has(key), false); keys.add(key);
    const observed = samples.flatMap(sample => (sample.processes ?? []).filter(row =>
      row.pid === child.pid && row.parentPid === rootPid && row.creationFileTime === child.creationFileTime)
      .map(row => ({ sequence: sample.sequence, timestamp: sample.timestamp, privateBytes: row.privateBytes })));
    return { ...child, nativeIdentityMatched: observed.length > 0, observedSamples: observed.length,
      firstNativeSequence: observed[0]?.sequence ?? null, lastNativeSequence: observed.at(-1)?.sequence ?? null,
      peakNativePrivateBytes: observed.length ? Math.max(...observed.map(row => row.privateBytes)) : null };
  });
}
