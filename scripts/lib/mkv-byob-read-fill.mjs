import assert from "node:assert/strict";

// Experiment only: fill the native destination in place with up to four
// sequential calls through the *same* persistent BYOB input bridge. No read
// ahead, second buffer, larger request, or concurrent operation.
export function withMkvReadFill(options) {
  const bridge = options.withinBridge;
  return { ...options, withinBridge: { ...bridge, async read(offset, target) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(offset + target.byteLength) ||
        target.byteLength > 262144) throw new RangeError("MKV read exceeds the existing AVIO bounds");
    let filled = 0;
    for (let pulls = 0; filled < target.byteLength && pulls < 4; pulls++) {
      const remainder = filled === 0 ? target : target.subarray(filled);
      const n = await bridge.read(offset + filled, remainder);
      if (!Number.isSafeInteger(n) || n < 0 || n > remainder.byteLength) throw new RangeError("Invalid MKV short-read extent");
      if (n === 0) break;
      filled += n;
    }
    return filled;
  } } };
}

export const mkvReadAbOrder = Object.freeze(["control", "fill", "fill", "control"]);

// No isolated wall-clock outlier can qualify a change. Both orderings must
// agree, native crossings must fall and all four underlying gates must pass.
export function summarizeMkvReadAb(arms) {
  assert.deepEqual(arms.map(a => a.byobMode), mkvReadAbOrder);
  const comparables = arms.map(a => {
    const c = a.cases[0];
    if (a.status !== "passed-loop-source-fidelity-control") return { mode: a.byobMode, status: a.status };
    assert.equal(a.cases.length, 1);
    assert.ok(c.ioProfile && c.outputRemoved && c.validation.candidateGate.passed && a.ownedRuntimeRemoved &&
      a.memory.incrementalPrivateMiB <= 250 && a.memory.cleanupAboveIdleMiB <= 96);
    return { mode: a.byobMode, status: a.status, elapsedMs: c.ioProfile.elapsedMs, readMs: c.ioProfile.read.ms,
      nativeReadCalls: c.ioProfile.read.calls, fileWriteMs: c.ioProfile.fileWrite.ms,
      incrementalMiB: a.memory.incrementalPrivateMiB, cleanupMiB: a.memory.cleanupAboveIdleMiB,
      outputSha256: c.validation.outputSha256 };
  });
  if (comparables.some(a => a.elapsedMs === undefined)) return { comparables, comparable: false, decision: "incomplete-or-gate-failed" };
  assert.equal(new Set(comparables.map(a => a.outputSha256)).size, 1);
  const pairs = [[comparables[0], comparables[1]], [comparables[3], comparables[2]]].map(([a, b]) => ({
    elapsedRatio: b.elapsedMs / a.elapsedMs, readWaitRatio: b.readMs / a.readMs, nativeReadCallRatio: b.nativeReadCalls / a.nativeReadCalls,
    fileWriteWaitRatio: b.fileWriteMs / a.fileWriteMs,
  }));
  const promising = pairs.every(p => p.elapsedRatio <= 0.95 && p.readWaitRatio <= 1 && p.nativeReadCallRatio < 1) &&
    Math.max(comparables[1].incrementalMiB, comparables[2].incrementalMiB) <= Math.max(comparables[0].incrementalMiB, comparables[3].incrementalMiB);
  return { comparables, comparable: true, pairs, decision: promising ? "promising-private-needs-production-integration" : "do-not-adopt-no-consistent-safe-win" };
}
