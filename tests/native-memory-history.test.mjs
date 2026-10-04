import assert from "node:assert/strict";
import test from "node:test";
import { combinedTreePeak, createNativeMemoryHistory } from "../scripts/lib/native-memory-history.mjs";

const sample = (sequence, timestamp, childBytes) => ({ sequence, timestamp, completedAt: timestamp, nativeElapsedMs: 2,
  sampleError: null, privateBytes: 10 + childBytes, rssBytes: 40, processes: [
    { pid: 1, parentPid: 0, createdAt: "2026-10-04T16:00:00Z", creationFileTime: "134040000000000000", privateBytes: 10, rssBytes: 20 },
    { pid: 2, parentPid: 1, createdAt: "2026-10-04T16:00:01Z", creationFileTime: "134040000010000000", privateBytes: childBytes, rssBytes: 20 },
  ] });
test("compact native history preserves an actual short-lived whole-tree peak and acquisition-time phases", () => {
  const h = createNativeMemoryHistory(1);
  h.setPhase("blank-baseline", Date.parse("2026-10-04T17:00:00Z"));
  h.setPhase("conversion-1", Date.parse("2026-10-04T17:00:01Z"));
  h.setPhase("validation-1", Date.parse("2026-10-04T17:00:02Z"));
  h.consume({ overflow: false, observerCpuMs: 5, samples: [
    sample(1, "2026-10-04T17:00:00.900Z", 20), sample(2, "2026-10-04T17:00:01.100Z", 100),
    sample(3, "2026-10-04T17:00:01.200Z", 20), sample(4, "2026-10-04T17:00:02.100Z", 200),
  ] });
  const p = h.peaks(["conversion-1"]);
  assert.equal(p.peak.privateBytes, 110); assert.equal(p.peak.sequence, 2);
  assert.equal(p.peak.processes[1].type, "unknown");
  assert.equal(p.peak.processes.reduce((s, p) => s + p.privateBytes, 0), 110);
  assert.equal(p.validSamples, 2);
  assert.equal(h.report().identities.length, 2);
  assert.equal(h.report().timeline.length, 4);
  assert.equal(h.peaks(["validation-1"]).peak.privateBytes, 210);
});
test("both sampler peaks count and unavailable native readings remain null", () => {
  const h = createNativeMemoryHistory(1); h.setPhase("conversion-1", 0);
  const s = sample(1, "2026-10-04T17:00:00Z", 20);
  Object.assign(s, { sampleError: "Process exited", privateBytes: null, rssBytes: null, processes: null });
  h.consume({ overflow: false, observerCpuMs: 0, samples: [s] });
  assert.deepEqual(h.peaks(["conversion-1"]), { peak: null, peakRssBytes: null, validSamples: 0, unavailableSamples: 1 });
  assert.equal(h.report().timeline[0][3], null);
  assert.equal(combinedTreePeak(100, 120, 10).peakPrivateBytes, 120);
  assert.equal(combinedTreePeak(140, 120, 10).peakPrivateBytes, 140);
  assert.throws(() => combinedTreePeak(140, null, 10));
  assert.throws(() => combinedTreePeak(140, 0, 10));
});
