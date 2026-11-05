import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { createVp9NativeAllocationDiagnostic, VP9_NATIVE_PHASES } from "../scripts/lib/vp9-native-allocation-diagnostic.mjs";
const root = path.resolve(import.meta.dirname, "..");
function setup(overrides = {}) {
  const calls = [], session = { name: "mock-session" }, processes = [{ pid: 1, parentPid: 0, createdAt: "mock-birth", privateBytes: 100 }];
  const diagnostic = createVp9NativeAllocationDiagnostic({ root,
    createSession: async () => { calls.push("session"); return session; },
    sampleProcesses: async () => { calls.push("processes"); return { privateBytes: 100, processes }; },
    capture: async options => { calls.push(options); return { acceptanceMetric: false, summedAllocatorTotal: null }; }, ...overrides });
  return { diagnostic, calls, session, processes };
}
test("native diagnostic captures four bounded phases, preserves identities and never sums overlapping allocator counters", async () => {
  const { diagnostic, calls, session, processes } = setup(), liveReport = diagnostic.report();
  for (const phase of VP9_NATIVE_PHASES) assert.equal(await diagnostic.capture(phase), true);
  assert.equal(liveReport.checkpoints.length, 4); assert.equal(liveReport.acceptanceMetric, false);
  assert.equal(liveReport.perturbsMemoryAndTiming, true); assert.equal(liveReport.noForcedGc, true);
  assert.equal(liveReport.summedAllocatorTotal, null); assert.equal(liveReport.allocationStackAttribution, false);
  assert.equal(liveReport.maximumPending, 1); assert.equal(liveReport.queuedRequests, 0);
  for (const [index, row] of liveReport.checkpoints.entries()) {
    assert.equal(row.label, VP9_NATIVE_PHASES[index]); assert.ok(row.finishedAt); assert.equal(row.error, null);
    assert.deepEqual(row.processSample.processes, processes);
    const options = calls[index * 3 + 2]; assert.equal(options.session, session);
    assert.equal(options.captureMs, 2500); assert.equal(options.phase, row.label);
    assert.equal(options.archivePath, path.join(root, "evidence", `2026-11-05-webcodecs-vp9-native-allocation-${row.label}.trace.json.gz`));
  }
  await assert.rejects(diagnostic.capture("loaded-idle"), /duplicate/);
});
test("unselected or hostile phase never opens a native session or creates a path", async () => {
  const { diagnostic, calls } = setup();
  for (const phase of ["webcodecs-vp9-ready", "workers-terminated", "../../outside", "unknown"])
    assert.equal(await diagnostic.capture(phase), false);
  assert.deepEqual(calls, []); assert.equal(diagnostic.report().checkpoints.length, 0);
});
test("native diagnostic rejects concurrent calls instead of queueing them", async () => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const { diagnostic } = setup({ capture: () => { started(); return new Promise(resolve => { release = resolve; }); } });
  const pending = diagnostic.capture("loaded-idle"); await ready;
  await assert.rejects(diagnostic.capture("candidate-disposed"), /overlap or queue/);
  release({ acceptanceMetric: false }); await pending;
  assert.equal(diagnostic.report().checkpoints.length, 1);
});
test("sampling failure is explicit and never creates a CDP session", async () => {
  const { diagnostic, calls } = setup({ sampleProcesses: async () => { throw new Error("OS sample unavailable"); } });
  await assert.rejects(diagnostic.capture("loaded-idle"), /unavailable/); assert.deepEqual(calls, []);
  const [row] = diagnostic.report().checkpoints; assert.equal(row.result, null); assert.ok(row.finishedAt);
  assert.match(row.error, /OS sample unavailable/);
});
test("capture failure retains bounded evidence and does not erase the checkpoint", async () => {
  const { diagnostic } = setup({ capture: async () => { throw new Error("x".repeat(2000)); } });
  await assert.rejects(diagnostic.capture("candidate-disposed"));
  const [row] = diagnostic.report().checkpoints; assert.equal(row.error.length, 1024);
  assert.equal(row.result, null); assert.ok(row.finishedAt);
  await assert.rejects(diagnostic.capture("candidate-disposed"), /duplicate/);
});
test("missing or excessive process rows fail before native capture", async () => {
  for (const processes of [[], Array.from({ length: 65 }, (_, pid) => ({ pid }))]) {
    const { diagnostic, calls } = setup({ sampleProcesses: async () => ({ processes }) });
    await assert.rejects(diagnostic.capture("loaded-idle")); assert.deepEqual(calls, []);
    assert.ok(diagnostic.report().checkpoints[0].error);
  }
});
