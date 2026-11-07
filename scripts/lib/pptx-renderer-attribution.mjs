// Diagnostic only: a page timing mark identifies the renderer in a Chrome
// trace; two native snapshots must independently confirm that PID's birth.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createBoundedDomCounterSampler } from "./bounded-dom-counters.mjs";
import { captureLiveMemoryInfra, LIVE_MEMORY_LIMITS } from "./live-memory-infra.mjs";

const category = "blink.user_timing";
const retainedAllocators = [
  "blink_gc", "blink_gc/main", "blink_gc/workers", "v8", "v8/main", "v8/workers",
  "partition_alloc", "partition_alloc/partitions", "partition_alloc/partitions/array_buffer",
  "partition_alloc/partitions/buffer", "malloc", "gpu", "skia", "shared_memory",
];

export function matchPageRenderer({ trace, mark, before, after, dump }) {
  assert.match(mark, /^within-pptx-renderer-[a-z-]{1,48}$/);
  assert.ok(Array.isArray(trace.traceEvents) && trace.traceEvents.length <= 100000);
  const matches = trace.traceEvents.filter(event => event.cat === category && event.name === mark);
  if (matches.length !== 1) return { available: false, reason: "Expected one exact page mark", matchCount: matches.length };
  const event = matches[0], pid = event.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(event.ts) ||
      !Number.isSafeInteger(event.tid) || event.tid <= 0 ||
      !Number.isFinite(dump?.traceIntervalMicroseconds?.[0]) || event.ts > dump.traceIntervalMicroseconds[0]) {
    return { available: false, reason: "Invalid mark identity or mark later than dump" };
  }
  const first = before?.processes?.filter(row => row.pid === pid) ?? [];
  const last = after?.processes?.filter(row => row.pid === pid) ?? [];
  const recorded = dump.processes?.filter(row => row.pid === pid) ?? [];
  if (first.length !== 1 || last.length !== 1 || recorded.length !== 1 ||
      !/^[1-9]\d{12,19}$/.test(first[0].creationFileTime ?? "") ||
      last[0].creationFileTime !== first[0].creationFileTime ||
      !Number.isSafeInteger(first[0].parentPid) || first[0].parentPid <= 0 ||
      first[0].parentPid !== last[0].parentPid) {
    return { available: false, reason: "Native renderer birth or dump join unavailable" };
  }
  const counters = recorded[0].liveAllocatorCounters ?? {};
  const risingBuckets = Object.entries(counters).flatMap(([name, value]) => {
    const size = value.size ?? value.allocated_objects_size;
    return Number.isSafeInteger(size) && size > 0 ? [{ name, size }] : [];
  }).sort((a, b) => b.size - a.size).slice(0, 16);
  return { available: true, pid, tid: event.tid, parentPid: first[0].parentPid,
    birth: first[0].creationFileTime, traceName: recorded[0].traceName, markTraceMicroseconds: event.ts,
    privateBefore: first[0].privateBytes, privateAfter: last[0].privateBytes,
    rssBefore: first[0].rssBytes, rssAfter: last[0].rssBytes,
    tracePrivateFootprintBytes: recorded[0].tracePrivateFootprintBytes,
    allocators: Object.fromEntries(retainedAllocators.map(name => [name, counters[name] ?? null])),
    largestReportedBuckets: risingBuckets, overlappingAllocatorValues: true };
}

const phases = ["loaded", "selected", "active", "complete", "cleanup-first", "removed"];
export async function createPptxRendererDiagnostic({ page, context, browser, realms, nextNative, directory, capture = captureLiveMemoryInfra }) {
  const domSession = await context.newCDPSession(page), dom = createBoundedDomCounterSampler(domSession);
  const rows = []; let pending = false;
  return {
    async sample(phase) {
      assert.equal(pending, false); assert.equal(phase, phases[rows.length]);
      pending = true;
      const row = { phase, startedAt: new Date().toISOString() }; rows.push(row);
      try {
        const mark = "within-pptx-renderer-" + phase;
        row.before = await nextNative();
        const session = await browser.newBrowserCDPSession();
        const trace = await capture({
          phase, processes: row.before?.processes ?? null,
          archivePath: path.join(directory, `pptx-renderer-${phase}.json.gz`),
          session: {
            async send(method, params) {
              if (method === "Tracing.start") {
                return session.send(method, { ...params, traceConfig: { ...params.traceConfig,
                  includedCategories: [...params.traceConfig.includedCategories, category] } });
              }
              if (method === "Tracing.requestMemoryDump") {
                row.stateAtMark = await page.evaluate(name => {
                  performance.mark(name);
                  performance.clearMarks(name);
                  const state = window.__WITHIN_TEST__.getState();
                  return { job: state.jobState, worker: state.workerStatus, outputBytes: state.metrics?.outputBytes ?? null };
                }, mark);
              }
              return session.send(method, params);
            },
            once: session.once.bind(session), off: session.off.bind(session), detach: session.detach.bind(session),
          },
        });
        row.after = await nextNative();
        row.dom = await dom.sample(phase);
        row.realms = await realms.sample();
        const packed = await readFile(trace.archive.path);
        assert.equal(packed.length, trace.archive.bytes);
        row.archive = { ...trace.archive, path: path.basename(trace.archive.path), retained: false };
        const events = JSON.parse(gunzipSync(packed, { maxOutputLength: LIVE_MEMORY_LIMITS.maximumTraceBytes }));
        row.renderer = matchPageRenderer({ trace: events, mark, before: row.before, after: row.after, dump: trace.summary[0] });
        return row;
      } finally { row.finishedAt = new Date().toISOString(); pending = false; }
    },
    report: () => ({ rows, maxPhases: phases.length, maxPendingDumps: 1, noForcedGc: true,
      perturbsMeasurement: true, acceptanceMetric: false, allocationStackAttribution: false }),
    async close() { dom.close(); await domSession.detach(); },
  };
}
