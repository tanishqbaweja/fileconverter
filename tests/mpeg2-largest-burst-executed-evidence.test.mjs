import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { joinMicrosecondNativeTypes } from "../scripts/lib/microsecond-native-type-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = value => createHash("sha256").update(value).digest("hex");
const load = async name => JSON.parse(await readFile(path.join(root, `evidence/${name}-2026-10-07.json`)));
test("actual changed original preserves busy failure/all ten peak processes and complete two independently closed traces", async () => {
  const p = await load("mpeg2-largest-burst-attribution");
  assert.equal(p.failure.message, "Diagnostic callback unavailable or busy; record failure rather than queue requests");
  assert.equal(p.finalNativeIncrementalPrivateMiB, 259.26953125); assert.equal(p.finalNativePeak.processes.length, 10);
  assert.equal(p.finalNativePeak.privateBytes, p.finalNativePeak.processes.reduce((n, v) => n + v.privateBytes, 0));
  assert.equal(p.nativeObserverError, null); assert.equal(p.blankBaseline.privateBytes, 238915584);
  assert.equal(p.attribution.sessions.length, 2);
  for (const s of p.attribution.sessions) {
    assert.equal(s.trace.status, "completed-diagnostic"); assert.equal(s.sessionDetached, true);
    assert.equal(s.trace.trace.dataLossOccurred, false); assert.equal(s.trace.trace.overflow, false);
    assert.equal(s.trace.dumps.length, 1); assert.equal(s.trace.limits.chromiumBufferBytes, 4194304);
  }
  assert.equal(p.nativeBursts.callbacks[0].result.success, true);
  assert.equal(p.nativeBursts.callbacks[1].status, "skipped-busy-no-queue");
  assert.equal(p.joined[0].acquisitionToDumpRequestMs, 56); assert.equal(p.joined[0].acquisitionToDumpCompletionMs, 244);
  assert.equal(p.completeOriginalConversion, false); assert.equal(p.splitFinalSamples[0].frames, 37);
  assert.equal(p.lastPreCancellationMetrics.outputBytes, 0); assert.equal(p.publicAcceptance, false);
  for (const [file, digest] of Object.entries(p.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  for (const [name, source] of Object.entries(p.generatedSources)) assert.equal(sha(source), p.generatedSourceHashes[name]);
});
test("actual microsecond-only derivative recovers type identity without rewriting the original empty exact-string join", async () => {
  const p = await load("mpeg2-largest-burst-attribution"), a = await load("mpeg2-largest-burst-analysis");
  assert.deepEqual(p.largestTypeChanges[0].joined, []);
  assert.deepEqual(a.joined, joinMicrosecondNativeTypes(p.attribution.sessions.map(s => s.trace)));
  const renderer = a.joined.find(row => row.pid === 30556); assert.ok(renderer);
  assert.equal(renderer.birthComparison.beforeCreatedAt, "2026-10-07T11:01:09.3586260Z");
  assert.equal(renderer.birthComparison.afterCreatedAt, "2026-10-07T11:01:09.3586266Z");
  assert.equal(renderer.beforeHeaps[0].allocatedObjectsBytes, 15932000);
  assert.equal(renderer.afterHeaps[0].allocatedObjectsBytes, 16409992);
  assert.equal(a.originalUninstrumentedFailureCause, null); assert.equal(a.noNewConversion, true);
  for (const [file, digest] of Object.entries(a.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
});
test("actual failed PID-only cleanup assumption is archived; identity-aware retry proves independent cleanup without killing replacement", async () => {
  const failed = await load("mpeg2-largest-burst-analysis-pid-only-failure"), a = await load("mpeg2-largest-burst-analysis");
  assert.equal(sha(failed.executedSource), failed.executedSourceSha256);
  assert.equal(failed.observedCurrent[0].pid, failed.historicalNativeIdentity.pid);
  assert.notEqual(failed.observedCurrent[0].createdAt, failed.historicalNativeIdentity.createdAt);
  assert.notEqual(failed.observedCurrent[0].parentPid, failed.historicalNativeIdentity.parentPid);
  assert.equal(failed.processesKilled, 0); assert.equal(failed.postSourceHashReached, false);
  assert.equal(a.cleanup.sampledIdentities, 21); assert.equal(a.cleanup.checkedPids, 26);
  for (const key of ["allSampledNativeIdentitiesAbsent", "originalFullPostHashMatches", "innerAndGeneratedRuntimeAbsent", "sixPublishedAssetsRestored", "ninePrivateAssetsAbsent"])
    assert.equal(a.cleanup[key], true);
  assert.equal(a.failedReadOnlyPidAssumptionPreserved.executedSourceSha256, failed.executedSourceSha256);
});
