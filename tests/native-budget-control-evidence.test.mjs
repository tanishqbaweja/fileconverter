import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "..");
const proof = async () => JSON.parse(await readFile(path.join(root, "evidence/native-budget-failure-control-retry-2026-10-07.json")));

test("actual synthetic control starts exactly one detailed trace AFTER unchanged full-tree native failure", async () => {
  const r = await proof(), capture = r.nativeFailureCapture, event = capture.firstFailure;
  assert.equal(r.status, "completed-diagnostic");
  assert.equal(r.traceStartsBeforeAllocation, 0); assert.equal(r.traceStarts, 1);
  assert.equal(r.syntheticAllocationBytes, 264 * 1048576);
  assert.equal(capture.limits.incrementalPrivateBytes, 250 * 1048576);
  assert.deepEqual(event.baseline, r.blankBaseline);
  assert.equal(event.incrementalPrivateMiB, (event.after.privateBytes - r.blankBaseline.privateBytes) / 1048576);
  assert.equal(event.incrementalPrivateMiB, 267.1328125);
  assert.equal(event.after.processes.length, 10);
  assert.equal(event.after.processes.reduce((sum, row) => sum + row.privateBytes, 0), event.after.privateBytes);
  assert.equal(capture.maximumPendingCallbacks, 1); assert.equal(capture.callbackQueueLength, 0);
  assert.equal(capture.callback.status, "completed"); assert.equal(capture.callback.result.success, true);
  assert.equal(capture.sequence, 143); assert.equal(event.after.sequence, 134);
  assert.equal(capture.additionalOverBudgetSamples, 9); assert.equal(capture.unavailableSamples, 0);
  assert.equal(r.nativeMemory.error, null);
  assert.equal(r.traceReport.sessions.length, 1);
  const session = r.traceReport.sessions[0], trace = session.trace, dump = trace.dumps[0];
  assert.ok(Date.parse(session.startedAt) >= Date.parse(event.after.timestamp));
  assert.ok(Date.parse(dump.timestamp) >= Date.parse(session.startedAt));
  assert.equal(trace.dumps.length, 1); assert.equal(dump.memoryDump.dumpGuid, "0x3");
  assert.equal(trace.status, "completed-diagnostic"); assert.equal(trace.trace.serializedBytes, 3743080);
  assert.equal(trace.trace.events, 277); assert.equal(trace.trace.dataLossOccurred, false);
  assert.equal(trace.trace.overflow, false); assert.equal(trace.trace.parseError, null);
  assert.equal(trace.limits.chromiumBufferBytes, 4 * 1048576);
  assert.equal(trace.limits.maximumSerializedBytes, 16 * 1048576);
  assert.equal(trace.limits.maximumRealmRows, 1024); assert.equal(trace.limits.realmIntervalMs, 100);
  assert.equal(session.sessionDetached, true);
});

test("actual post-failure control source pins and owned cleanup remain valid without converter acceptance", async () => {
  const r = await proof();
  for (const [file, hash] of Object.entries(r.sourcePins))
    assert.equal(createHash("sha256").update(await readFile(path.join(root, file))).digest("hex"), hash, file);
  assert.equal(createHash("sha256").update(r.generatedHelper).digest("hex"), r.generatedHelperSha256);
  for (const value of Object.values(r.cleanup)) assert.equal(value, true);
  await assert.rejects(access(r.runtimeDirectory), { code: "ENOENT" });
  assert.equal(r.rootExitObservation.status, "owned-identity-absent");
  assert.equal(r.originalRead, false); assert.equal(r.converterLoaded, false);
  assert.equal(r.conversionsPerformed, 0); assert.equal(r.generatedMediaCopies, 0);
  assert.equal(r.noForcedGc, true); assert.equal(r.originalFailureCause, null);
  assert.equal(r.publicAcceptance, false); assert.equal(r.completeChromiumMemoryAcceptance, false);
  assert.equal(r.conversionSpeedAcceptance, false);
});
