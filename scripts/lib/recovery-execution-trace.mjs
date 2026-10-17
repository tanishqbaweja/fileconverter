// Event-only diagnostic around actual recovery. No forced GC, flags, synthetic
// allocations, heap snapshots, media changes or acceptance from this trace.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const RECOVERY_TRACE_LIMITS = Object.freeze({ chromiumBufferKiB: 1024, readBytes: 262144,
  serializedBytes: 8388608, compressedBytes: 1048576, events: 50000, groups: 1024, markers: 4 });
export const RECOVERY_TRACE_CATEGORIES = Object.freeze(["v8.wasm", "v8.wasm.detailed",
  "disabled-by-default-v8.wasm.detailed", "disabled-by-default-v8.compile", "disabled-by-default-v8.gc", "v8"]);
export const RECOVERY_TRACE_PROBE = "evidence/2026-10-17T21-11-43-044Z-recovery-trace-capability.json.gz";
export const RECOVERY_TRACE_PROBE_RAW = "outputs/reports/2026-10-17T21-11-43-044Z-recovery-trace-capability.json.gz";
export async function verifyExplicitRecoveryCategories(root, browserVersion) {
  const zipped = await readFile(path.join(root, RECOVERY_TRACE_PROBE)); assert.equal(sha(zipped), "4446f2b1f3bc60ef498106c8dd884ed599eb5ee413276ced4dfbbf4440032eee");
  const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(raw), "969032444bb2bfa3e10144e5aecdb91a9ec4dc8d63b4c270f6641b1813378ce1");
  const probe = JSON.parse(raw); assert.equal(probe.status, "passed-browser-only-explicit-v8-event-selection-probe");
  assert.equal(probe.dataLossOccurred, false); assert.deepEqual(probe.cleanupErrors, []); assert.equal(probe.conversions, 0);
  for (const key of ["product", "revision", "jsVersion"]) assert.equal(browserVersion[key], probe.browserVersion[key], "Capability probe applies only to this exact browser/V8 revision");
  assert.equal(probe.rawArchive.path, RECOVERY_TRACE_PROBE_RAW);
  const traceZip = await readFile(path.join(root, RECOVERY_TRACE_PROBE_RAW)); assert.equal(sha(traceZip), probe.rawArchive.sha256);
  const traceRaw = gunzipSync(traceZip, { maxOutputLength: RECOVERY_TRACE_LIMITS.serializedBytes }); assert.equal(sha(traceRaw), probe.rawArchive.restoredSha256);
  const events = JSON.parse(traceRaw).traceEvents.filter(row => row.cat?.split(",").includes("v8.wasm") && /wasm\.(?:AsyncCompile|CompileLazy)/.test(row.name));
  assert.ok(events.length > 0, "Require actual compiler events, not just accepted filter strings");
  return { path: RECOVERY_TRACE_PROBE, sha256: sha(zipped), actualWasmEvents: events.length,
    browserRevisionPinned: true, discoveryListEmpty: probe.categoriesBefore.categories.length === 0 };
}
export function summarizeRecoveryExecution(trace) {
  assert.ok(Array.isArray(trace.traceEvents) && trace.traceEvents.length <= RECOVERY_TRACE_LIMITS.events);
  const groups = new Map(), threadNames = [], clockMarkers = [];
  for (const row of trace.traceEvents) {
    if (row.ph === "M" && row.name === "thread_name") {
      assert.ok(threadNames.length < 256); threadNames.push({ pid: row.pid, tid: row.tid, name: row.args?.name ?? null });
    }
    if (row.name === "clock_sync") {
      assert.ok(clockMarkers.length < 16); clockMarkers.push({ ts: row.ts, args: row.args });
    }
    if (row.ph === "M" || !RECOVERY_TRACE_CATEGORIES.some(category => row.cat?.split(",").includes(category))) continue;
    assert.ok(typeof row.name === "string" && row.name.length <= 512 && Number.isFinite(row.ts));
    const key = JSON.stringify([row.pid, row.tid, row.cat, row.name, row.ph]);
    if (!groups.has(key)) { assert.ok(groups.size < RECOVERY_TRACE_LIMITS.groups); groups.set(key,
      { pid: row.pid, tid: row.tid, category: row.cat, name: row.name, phase: row.ph, count: 0,
        firstTraceUs: row.ts, lastTraceUs: row.ts, durationUs: 0, numericArguments: {} }); }
    const group = groups.get(key); group.count++; group.firstTraceUs = Math.min(group.firstTraceUs, row.ts);
    group.lastTraceUs = Math.max(group.lastTraceUs, row.ts + (row.dur ?? 0));
    if (row.dur != null) { assert.ok(Number.isFinite(row.dur) && row.dur >= 0); group.durationUs += row.dur; }
    for (const [name, value] of Object.entries(row.args ?? {})) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      assert.ok(name.length <= 256 && (Object.hasOwn(group.numericArguments, name) || Object.keys(group.numericArguments).length < 32));
      const previous = group.numericArguments[name];
      group.numericArguments[name] = { minimum: Math.min(previous?.minimum ?? value, value), maximum: Math.max(previous?.maximum ?? value, value) };
    }
  }
  return { eventCount: trace.traceEvents.length, groups: [...groups.values()], threadNames, clockMarkers,
    exactAllocationBytes: false, allocationCauseProven: false, acceptanceMetric: false };
}
async function timed(operation) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Recovery trace command deadline")), 15000); })]); }
  finally { clearTimeout(timer); }
}
export function createRecoveryExecutionTrace({ root, reportBase, createSession, categories = RECOVERY_TRACE_CATEGORIES, windowKind = "recovery" }) {
  assert.equal(path.dirname(reportBase), path.join(root, "outputs/reports"));
  assert.ok(["cold-start", "recovery"].includes(windowKind));
  assert.ok(categories.includes("v8.wasm") && categories.length <= RECOVERY_TRACE_CATEGORIES.length && new Set(categories).size === categories.length);
  assert.ok(categories.every(category => RECOVERY_TRACE_CATEGORIES.includes(category)));
  const result = { scope: `actual-${windowKind}-v8-wasm-gc-events-only`, limits: RECOVERY_TRACE_LIMITS,
    requestedCategories: [...categories], selectedCategories: [], unavailableCategories: [], startedAt: null,
    finishedAt: null, browserVersion: null, markers: [], budgetFailure: null, rawArchive: null, summary: null,
    dataLossOccurred: null, detached: false, error: null, perturbsMemory: true, noForcedGc: true,
    browserFlagsChanged: false, codecSettingsChanged: false, acceptanceMetric: false,
    listedCategoryCount: null, categoryListIsMetadataOnly: true, explicitSelectionProof: null,
    bufferUsageMaximum: null, bufferUsageReports: 0 };
  let session, startPromise, stopPromise, tracing = false;
  const bufferUsage = event => {
    const value = event.percentFull ?? event.value;
    if (Number.isFinite(value) && value >= 0 && value <= 1) {
      result.bufferUsageMaximum = Math.max(result.bufferUsageMaximum ?? value, value); result.bufferUsageReports++;
    }
  };
  const mark = async phase => {
    assert.ok(result.markers.length < RECOVERY_TRACE_LIMITS.markers);
    const row = { phase, id: `within-recovery-${Date.now()}-${result.markers.length}`, beforeMs: Date.now(), afterMs: null, error: null };
    result.markers.push(row);
    try { await timed(session.send("Tracing.recordClockSyncMarker", { syncId: row.id })); }
    catch (error) { row.error = String(error).slice(0, 512); }
    finally { row.afterMs = Date.now(); }
  };
  return {
    start() {
      assert.equal(startPromise, undefined, "One trace window only");
      startPromise = (async () => {
        try {
          session = await createSession(); result.browserVersion = await timed(session.send("Browser.getVersion"));
          const supported = await timed(session.send("Tracing.getCategories")); assert.ok(supported.categories.length <= 4096);
          result.listedCategoryCount = supported.categories.length;
          result.unavailableCategories = categories.filter(category => !supported.categories.includes(category));
          if (!supported.categories.includes("v8.wasm")) result.explicitSelectionProof = await verifyExplicitRecoveryCategories(root, result.browserVersion);
          // Missing discovery names are not an unsupported-engine result. On the
          // pinned revision explicit selection has been verified with real events.
          result.selectedCategories = [...categories];
          session.on("Tracing.bufferUsage", bufferUsage);
          await timed(session.send("Tracing.start", { transferMode: "ReturnAsStream", bufferUsageReportingInterval: 100, traceConfig: {
            recordMode: "recordUntilFull", traceBufferSizeInKb: RECOVERY_TRACE_LIMITS.chromiumBufferKiB,
            includedCategories: result.selectedCategories, excludedCategories: ["*"] } }));
          tracing = true; result.startedAt = new Date().toISOString(); await mark(`before-${windowKind}`);
        } catch (error) { result.error = String(error).slice(0, 1024); throw error; }
      })();
      return startPromise;
    },
    noteBudgetFailure(event) {
      // Synchronous observation only: never delay the original production cancellation.
      result.budgetFailure = { observedAt: Date.now(), nativeTimestamp: event.after?.timestamp ?? null,
        nativeSequence: event.after?.sequence ?? null, privateBytes: event.after?.privateBytes ?? null,
        tracingAtNotification: tracing, startCompleted: Boolean(result.startedAt) };
    },
    stop(reason = "control-finally") {
      stopPromise ??= (async () => {
        try {
          if (startPromise) await startPromise.catch(() => {});
          if (!tracing) return result;
          await mark(reason); const completed = new Promise(resolve => session.once("Tracing.tracingComplete", resolve));
          await timed(session.send("Tracing.end")); tracing = false;
          const reply = await timed(completed); result.dataLossOccurred = reply.dataLossOccurred; assert.ok(reply.stream);
          const chunks = []; let bytes = 0;
          try {
            for (;;) {
              const chunk = await timed(session.send("IO.read", { handle: reply.stream, size: RECOVERY_TRACE_LIMITS.readBytes }));
              const value = Buffer.from(chunk.data, chunk.base64Encoded ? "base64" : "utf8");
              assert.ok(value.length <= RECOVERY_TRACE_LIMITS.readBytes); bytes += value.length;
              assert.ok(bytes <= RECOVERY_TRACE_LIMITS.serializedBytes, "Bounded serialized trace; fail rather than truncate");
              chunks.push(value); if (chunk.eof) break;
            }
          } finally { await timed(session.send("IO.close", { handle: reply.stream })); }
          const raw = Buffer.concat(chunks), compressed = gzipSync(raw, { level: 9 }); assert.ok(compressed.length <= RECOVERY_TRACE_LIMITS.compressedBytes);
          const file = reportBase + "-recovery-execution.json.gz"; await writeFile(file, compressed, { flag: "wx" });
          result.rawArchive = { path: path.relative(root, file).replaceAll(path.sep, "/"), bytes: compressed.length, sha256: sha(compressed), restoredBytes: raw.length, restoredSha256: sha(raw) };
          result.summary = summarizeRecoveryExecution(JSON.parse(raw));
          assert.equal(reply.dataLossOccurred, false, "Incomplete trace is not evidence of absent events");
          assert.ok(result.bufferUsageMaximum == null || result.bufferUsageMaximum < 0.99, "Saturated trace is not evidence of absent events");
        } catch (error) { result.error ??= String(error).slice(0, 1024); }
        finally {
          try { if (tracing) { await timed(session.send("Tracing.end")); tracing = false; } }
          catch (error) { result.error ??= String(error).slice(0, 1024); }
          try { if (session) { session.off("Tracing.bufferUsage", bufferUsage); await timed(session.detach()); result.detached = true; } }
          catch (error) { result.error ??= String(error).slice(0, 1024); }
          result.finishedAt = new Date().toISOString();
        }
        return result;
      })();
      return stopPromise;
    },
    report: () => result,
  };
}
