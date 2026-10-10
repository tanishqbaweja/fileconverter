import assert from "node:assert/strict";
import { StringDecoder } from "node:string_decoder";
import { connectRealmSampler } from "./cdp-realm-memory.mjs";

export const AIFF_DIAGNOSTIC_LIMITS = Object.freeze({ snapshots: 256, targets: 16, phases: 32,
  logLines: 64, gpuLogLines: 32, logChars: 512, versionBytes: 16384 });

export function createAiffDirectDiagnosticObserver(stderr, { connectSampler = connectRealmSampler,
  fetchVersion = fetch, now = Date.now } = {}) {
  assert.ok(stderr && typeof stderr.on === "function");
  const limits = AIFF_DIAGNOSTIC_LIMITS, decoder = new StringDecoder("utf8");
  const snapshots = [], logs = [], gpuLogs = [], phases = new Map();
  let sampler = null, partial = "", sequence = 0, logCount = 0, evictedSnapshots = 0, truncatedLogs = 0;
  let closed = false, sampling = false;
  const ring = (array, entry, cap) => { array.push(entry); if (array.length > cap) array.shift(); };
  const log = line => {
    if (!line) return;
    const entry = { timestamp: new Date(now()).toISOString(), text: line.slice(0, limits.logChars) };
    logCount++; ring(logs, entry, limits.logLines);
    if (/gpu|angle|swiftshader|context.*lost|crash/i.test(entry.text)) ring(gpuLogs, entry, limits.gpuLogLines);
  };
  const onData = chunk => {
    // Retain at most512 characters of an incomplete line, even when no newline arrives.
    for (const part of decoder.write(chunk).split(/(?<=\n)/)) {
      const text = partial + part, complete = part.endsWith("\n");
      if (text.length > limits.logChars) truncatedLogs++;
      partial = text.slice(0, limits.logChars);
      if (complete) { log(partial.trimEnd()); partial = ""; }
    }
  };
  stderr.on("data", onData);
  return {
    async connect(port, origin) {
      assert.equal(sampler, null); assert.equal(closed, false);
      assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535);
      const response = await fetchVersion(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.ok, true);
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength; assert.ok(bytes <= limits.versionBytes, "Browser metadata admission cap exceeded"); chunks.push(chunk);
      }
      const metadata = JSON.parse(Buffer.concat(chunks, bytes)), socket = new URL(metadata.webSocketDebuggerUrl);
      assert.equal(socket.protocol, "ws:"); assert.equal(socket.hostname, "127.0.0.1"); assert.equal(socket.port, String(port));
      assert.match(socket.pathname, /^\/devtools\/browser\/[a-zA-Z0-9-]+$/);
      sampler = await connectSampler(socket.href, origin);
    },
    async sample(phase) {
      assert.equal(sampling, false, "Diagnostic samples must stay single-flight");
      assert.equal(closed, false); assert.ok(sampler);
      sampling = true;
      try {
        let result, error = null;
        try { result = await sampler.sample(); }
        catch (failure) { result = { targetsAvailable: false, targets: null }; error = String(failure).slice(0, 512); }
        assert.ok(result.targets === null || result.targets.length <= limits.targets);
        const targets = result.targets?.map(target => ({ targetId: target.targetId.slice(0, 96), type: target.type.slice(0, 32),
          url: target.url.slice(0, 256), usedJSHeapBytes: target.usedJSHeapBytes, allocatedJSHeapBytes: target.allocatedJSHeapBytes,
          backingStorageBytes: target.backingStorageBytes, embedderHeapUsedBytes: target.embedderHeapUsedBytes,
          error: target.error?.slice(0, 512) ?? null })) ?? null;
        const snapshot = { sequence: ++sequence, timestamp: new Date(now()).toISOString(), phase: phase.slice(0, 64),
          targetsAvailable: result.targetsAvailable, targets, error };
        if (snapshots.length === limits.snapshots) evictedSnapshots++;
        ring(snapshots, snapshot, limits.snapshots);
        if (!phases.has(phase)) {
          assert.ok(phases.size < limits.phases, "Diagnostic phase cap exceeded");
          phases.set(phase, { phase, observations: 0, unavailableTargetLists: 0, workerObservations: 0,
            unavailableWorkerHeaps: 0, peakWorkerUsedJSHeapBytes: null, peakWorkerAllocatedJSHeapBytes: null,
            peakWorkerBackingStorageBytes: null });
        }
        const summary = phases.get(phase); summary.observations++;
        if (!targets) summary.unavailableTargetLists++;
        for (const target of targets ?? []) if (target.type.includes("worker")) {
          summary.workerObservations++;
          if (target.usedJSHeapBytes === null) summary.unavailableWorkerHeaps++;
          for (const [field, aggregate] of [["usedJSHeapBytes", "peakWorkerUsedJSHeapBytes"],
            ["allocatedJSHeapBytes", "peakWorkerAllocatedJSHeapBytes"], ["backingStorageBytes", "peakWorkerBackingStorageBytes"]]) {
            const value = target[field];
            if (value !== null) summary[aggregate] = summary[aggregate] === null ? value : Math.max(summary[aggregate], value);
          }
        }
        return { sequence, targetsAvailable: result.targetsAvailable,
          workerHeapsAvailable: targets?.filter(target => target.type.includes("worker") && target.usedJSHeapBytes !== null).length ?? null,
          error };
      } finally { sampling = false; }
    },
    close() {
      if (!closed) {
        sampler?.close(); stderr.off("data", onData); partial += decoder.end(); log(partial); partial = ""; closed = true;
      }
      return { diagnosticOnly: true, productionAcceptance: false, scope: "CDP isolate heaps and bounded Chrome stderr; never replace complete-tree OS private memory",
        noForcedGarbageCollection: true, noConversionOrCodecChanges: true, limits, sequence, evictedSnapshots,
        logCount, truncatedLogs, logs, gpuLogs, phases: [...phases.values()], snapshots, observerClosed: closed };
    },
  };
}
