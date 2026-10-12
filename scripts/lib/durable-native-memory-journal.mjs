// Diagnostic checkpoint only. Never substitutes for full-run terminal acceptance.
import assert from "node:assert/strict";
import { access, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { createNativeMemoryPeaks } from "./native-memory-peaks.mjs";

export const DURABLE_NATIVE_LIMITS = Object.freeze({ maximumBytes: 2097152, minimumWriteIntervalMs: 1000,
  retainedGraphBuckets: 16, pendingWrites: 1, retainedSnapshots: 1 });
const baselineFields = ["stable", "privateBytes", "spreadBytes", "rssBytes", "firstTimestamp", "lastTimestamp", "sampleCount", "minimumElapsedMs"];
const canonical = file => process.platform === "win32" ? file.toLowerCase() : file;
const compactAggregate = aggregate => { const selected = { ...aggregate }; delete selected.unavailableExamples; return selected; };

export async function createDurableNativeMemoryJournal(rootPid, file, {
  getBlankBaseline = () => null, now = Date.now, writeOverride,
} = {}) {
  const root = path.resolve(import.meta.dirname, "../.."), parent = path.join(root, "outputs/reports");
  file = path.resolve(file);
  assert.equal(canonical(path.dirname(file)), canonical(parent));
  assert.match(path.basename(file), /^[a-zA-Z0-9-]{1,120}-native-checkpoint\.json$/);
  assert.equal(canonical(await realpath(parent)), canonical(parent));
  await assert.rejects(access(file), { code: "ENOENT" });
  await assert.rejects(access(file + ".next"), { code: "ENOENT" });
  assert.equal(typeof getBlankBaseline, "function");
  assert.ok(Number.isSafeInteger(rootPid) && rootPid > 0);
  const history = createNativeMemoryPeaks(rootPid); history.setPhase("blank-baseline", now());
  let baseline = null, pending = null, failure = null, lastWrittenAt = -Infinity, closed = false;
  let writtenSequence = null, writes = 0, coalesced = 0, closing = null;
  const identities = { root: null, monitor: null };
  const healthy = () => { if (failure) throw failure; };
  const captureBaseline = () => {
    const actual = getBlankBaseline();
    if (actual == null || actual.stable !== true) return;
    assert.ok(Number.isSafeInteger(actual.privateBytes) && actual.privateBytes > 0);
    const selected = Object.fromEntries(baselineFields.filter(key => Object.hasOwn(actual, key)).map(key => [key, actual[key]]));
    for (const [key, value] of Object.entries(selected)) {
      if (key === "stable") assert.equal(value, true);
      else if (key.endsWith("Timestamp")) assert.ok(typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value)));
      else assert.ok(Number.isFinite(value) && value >= 0);
    }
    baseline ??= selected; assert.deepEqual(selected, baseline, "Never change the real blank denominator");
  };
  const snapshot = status => {
    captureBaseline();
    const report = history.report();
    return { schema: 1, status, updatedAt: new Date(now()).toISOString(), rootPid, identities: { ...identities }, limits: DURABLE_NATIVE_LIMITS,
      baseline, primaryFormula: "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
      conversionAcceptance: false, completeRunCoverageProven: false, interruptionCause: null,
      coverageThroughSequence: report.sequence, coverageThroughTimestamp: report.lastAcquiredAt,
      native: { ...report, phases: report.phases.map(compactAggregate), graphBuckets: report.graphBuckets.slice(-16).map(compactAggregate) },
      retention: { graphIsRecentDiagnosticOnly: true, allPhasePeaksRetained: true, missingSamplesNeverZero: true,
        rawBatchesRetained: 0, rawSamplesReplacedByBoundedAggregates: true, maximumPendingWrites: 1,
        priorSuccessfulWrites: writes, coalescedCheckpointRequests: coalesced } };
  };
  const diskWrite = async bytes => {
    const next = file + ".next"; let handle;
    try {
      handle = await open(next, "wx"); await handle.writeFile(bytes); await handle.sync();
      await handle.close(); handle = null; await rename(next, file);
    } finally {
      if (handle) await handle.close();
      await unlink(next).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  };
  const request = (status = "observer-live-not-terminal-acceptance", force = false) => {
    healthy();
    if (pending || (!force && now() - lastWrittenAt < 1000)) { coalesced++; return pending; }
    let value, bytes;
    try {
      value = snapshot(status); bytes = Buffer.from(JSON.stringify(value) + "\n");
      assert.ok(bytes.length <= DURABLE_NATIVE_LIMITS.maximumBytes, "Bounded native checkpoint cap exceeded; no silent evidence omission");
    } catch (error) { failure ??= error; throw error; }
    pending = (async () => {
      try {
        await (writeOverride ?? diskWrite)(bytes);
        writtenSequence = value.coverageThroughSequence; lastWrittenAt = now(); writes++;
      } catch (error) { failure ??= error; }
      finally { pending = null; }
    })();
    return pending;
  };
  return {
    file,
    setIdentities(rootIdentity, monitorIdentity) {
      assert.equal(rootIdentity.pid, rootPid);
      for (const identity of [rootIdentity, monitorIdentity]) {
        assert.ok(Number.isSafeInteger(identity.pid) && identity.pid > 0 && Number.isSafeInteger(identity.parentPid));
        assert.ok(Number.isFinite(Date.parse(identity.createdAt)));
      }
      const select = ({ pid, parentPid, createdAt }) => ({ pid, parentPid, createdAt });
      identities.root = select(rootIdentity); identities.monitor = select(monitorIdentity);
    },
    setPhase(phase, at) { healthy(); assert.equal(closed, false); history.setPhase(phase, at); request(); },
    consume(batch) { healthy(); assert.equal(closed, false); history.consume(batch); request(); },
    healthy,
    async flush() {
      if (pending) await pending; healthy(); await request("observer-live-not-terminal-acceptance", true); healthy();
    },
    report: () => ({ file, failure: failure ? String(failure).slice(0, 2048) : null, writes, coalesced,
      writtenSequence, maximumPendingWrites: 1, retainedGraphBuckets: 16, closed, conversionAcceptance: false }),
    close() {
      closing ??= (async () => {
        closed = true; if (pending) await pending; healthy();
        await request("observer-closed-not-conversion-acceptance", true); healthy();
      })();
      return closing;
    },
  };
}
