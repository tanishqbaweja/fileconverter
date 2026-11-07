import assert from "node:assert/strict";
// Self-contained browser callback: repeated direct outputs reuse a basename, so
// never accept stale complete state or use an OPFS temporary filename as job ID.
export async function completeNewBrowserJob({ getState, start, nextFrame, now }) {
  const previousMetrics = getState()?.metrics, deadline = now() + 300000;
  start();
  while (now() < deadline) {
    await nextFrame(); const state = getState();
    if (!state?.metrics || state.metrics === previousMetrics) continue;
    if (state.jobState === "complete") return state;
    if (["error", "cancelled"].includes(state.jobState))
      throw new Error("New direct job did not complete: " + String(state.error ?? state.jobState).slice(0, 1024));
  }
  throw new Error("New direct job did not genuinely complete before deadline");
}

// Metadata-only observation. Forward the identical original arguments and
// transfer list; never copy/read/log file content, retain handles or change jobs.
// Installed only in the owned headless test page, not production.
export function installDocxDestinationObservation() {
  const original = Worker.prototype.postMessage, rows = [];
  window.__WITHIN_DOCX_DESTINATIONS__ = rows;
  Worker.prototype.postMessage = function (...args) {
    const message = args[0];
    if (message?.type === "start" && message.profileId === "docx-to-html") {
      if (rows.length >= 16) throw new Error("Finite document destination observation limit");
      const destination = message.destination;
      rows.push({ mode: destination?.mode ?? null,
        actualFileHandle: destination?.handle instanceof FileSystemFileHandle,
        sourceBytes: message.file?.size ?? null, jobId: message.jobId });
    }
    return Reflect.apply(original, this, args);
  };
}

export function assertDirectDocxCompletion(state, observation, implementation = "shared-atomics") {
  assert.ok(["shared-atomics", "async-file-stream"].includes(implementation));
  assert.equal(state.jobState, "complete"); assert.equal(state.error, null);
  assert.equal(state.selectedProfileId, "docx-to-html"); assert.equal(state.opfsName, null);
  assert.equal(state.batchOutputNames.length, 1);
  const name = state.batchOutputNames[0];
  assert.match(name, /^within-test-direct-docx-html-[a-z0-9-]+\.html$/);
  assert.equal(observation.mode, "handle"); assert.equal(observation.actualFileHandle, true);
  assert.equal(observation.sourceBytes, state.metrics.inputBytes);
  assert.equal(state.metrics.activeWorkerCount, implementation === "shared-atomics" ? 2 : 1);
  assert.equal(state.metrics.sharedArrayBufferBytes, implementation === "shared-atomics" ? 262144 + 4096 + 32 : 0);
  assert.equal(state.metrics.peakWasmMemoryBytes, 0);
  return name;
}
