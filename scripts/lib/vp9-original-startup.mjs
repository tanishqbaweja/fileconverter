// Read-only original input; bounded real CPU startup, NEVER full-file acceptance.
import assert from "node:assert/strict";
export const VP9_ORIGINAL_STARTUP = Object.freeze({ windowMs: 300000, cancellationGraceMs: 30000, maximumIncrementalMiB: 250,
  width: 1920, height: 804, frameRate: 24, bitRateBps: 4000000, minimumDiskBytes: 2147483648 });
export function originalStartupStop(peaks, baseline, elapsedMs) {
  assert.ok(typeof baseline === "number" && baseline > 0); assert.ok(Number.isFinite(elapsedMs) && elapsedMs >= 0);
  if (peaks.unavailableSamples > 0) return { kind: "unavailable-memory-samples", incrementalPrivateMiB: null };
  if (peaks.peak) {
    assert.ok(typeof peaks.peak.privateBytes === "number" && peaks.peak.privateBytes > 0);
    const incrementalPrivateMiB = (peaks.peak.privateBytes - baseline) / 1048576;
    if (incrementalPrivateMiB > 250) return { kind: "memory-budget-exceeded", incrementalPrivateMiB };
  } else if (elapsedMs >= 5000) return { kind: "no-valid-memory-samples", incrementalPrivateMiB: null };
  return elapsedMs >= VP9_ORIGINAL_STARTUP.windowMs ? { kind: "bounded-startup-window-ended", incrementalPrivateMiB: null } : null;
}
export async function runVp9OriginalStartup({ page, observer, blankBaseline, evidence }) {
  assert.equal(blankBaseline?.stable, true); assert.ok(blankBaseline.privateBytes > 0);
  Object.assign(evidence, { scope: "Untouched full original File supplied to production CPU AVIO; bounded startup only, NOT completed original conversion or fidelity",
    limits: VP9_ORIGINAL_STARTUP, explicitBackend: "CPU/Wasm single-thread; WebCodecs not invoked", progress: [], result: null,
    stop: null, cancellationRequested: false, cancellationError: null, observerError: null, partialOutputRemoved: false,
    memory: null, passedStartupOnly: false, fullOriginalConverted: false, independentFullFidelityPassed: false, publicAcceptance: false });
  const name = "within-private-vp9-original-startup.webm", started = Date.now();
  let timer, busy = false, pending = Promise.resolve();
  const cancel = async reason => {
    evidence.stop ??= { ...reason, acquiredAt: new Date().toISOString(), elapsedMs: Date.now() - started };
    if (evidence.cancellationRequested) return;
    evidence.cancellationRequested = true;
    try { await page.evaluate(() => {
      const value = window.__withinVp9OriginalCancel;
      if (!(value instanceof SharedArrayBuffer) || value.byteLength !== 4) throw new Error("Owned cancellation signal unavailable");
      Atomics.store(new Int32Array(value), 0, 1);
    }); } catch (error) { evidence.cancellationError = String(error).slice(0, 1024); }
  };
  await page.exposeBinding("__vp9OriginalProgress", (_caller, value) => {
    assert.ok(value && typeof value.phase === "string" && value.phase.length <= 512 && value.metrics);
    if (evidence.progress.length === 128) evidence.progress.shift();
    evidence.progress.push({ acquiredAt: new Date().toISOString(), phase: value.phase, metrics: value.metrics });
  });
  try {
    timer = setInterval(() => {
      if (busy) return; busy = true;
      pending = (async () => {
        try { observer.healthy(); const reason = originalStartupStop(observer.peaks(["conversion"]), blankBaseline.privateBytes, Date.now() - started);
          if (reason) await cancel(reason);
        } catch (error) { evidence.observerError = String(error).slice(0, 1024); await cancel({ kind: "observer-failure", incrementalPrivateMiB: null }); }
      })().finally(() => { busy = false; });
    }, 1000);
    evidence.result = await page.evaluate(async ({ name, limits }) => {
      const root = await navigator.storage.getDirectory(), storage = await navigator.storage.estimate();
      if (!Number.isFinite(storage.quota) || !Number.isFinite(storage.usage) || storage.quota - storage.usage < 536870912)
        throw new Error("Insufficient or unavailable OPFS quota for bounded original startup");
      const file = document.querySelector('input[type="file"]').files[0];
      if (file.size !== 2958573265) throw new Error("Protected original File was substituted");
      const handle = await root.getFileHandle(name, { create: true }), cancellation = new SharedArrayBuffer(4);
      window.__withinVp9OriginalCancel = cancellation;
      const worker = new Worker("/engines/webcodecs-vp9/qualification.mjs", { type: "module" });
      try {
        const result = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Original startup did not stop within its cancellation grace")), limits.windowMs + limits.cancellationGraceMs);
          worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
          worker.onmessage = ({ data }) => {
            if (data.type === "progress") { window.__vp9OriginalProgress(data).catch(() => {}); return; }
            clearTimeout(timeout); resolve(data);
          };
          worker.postMessage({ file, output: handle, cancellation, nativeProfile: 10, implementation: "wasm-baseline", fallbackCore: "single-thread",
            video: { codec: "vp9", quality: "automatic", maxWidth: limits.width, bitRateBps: limits.bitRateBps, frameRateFps: limits.frameRate } });
        });
        return { ...result, sourceFileBytes: file.size, sourceCopied: false, nativeBrowserCpuOnly: true,
          storageBefore: { usage: storage.usage, quota: storage.quota }, partialOutputBytes: (await handle.getFile()).size };
      } finally { worker.terminate(); delete window.__withinVp9OriginalCancel; }
    }, { name, limits: VP9_ORIGINAL_STARTUP });
  } finally {
    clearInterval(timer); await pending;
    try { await observer.through(Date.now()); } finally {
      const peaks = observer.peaks(["conversion"]); evidence.memory = { ...peaks,
        incrementalPrivateMiB: peaks.peak ? (peaks.peak.privateBytes - blankBaseline.privateBytes) / 1048576 : null };
      observer.setPhase("original-startup-cleanup");
      await page.evaluate(async name => { const root = await navigator.storage.getDirectory();
        await root.removeEntry(name).catch(error => { if (error.name !== "NotFoundError") throw error; });
      }, name); evidence.partialOutputRemoved = true;
    }
  }
  assert.equal(evidence.cancellationError, null); assert.equal(evidence.observerError, null);
  assert.equal(evidence.result.cleanupComplete, true); assert.equal(evidence.result.encoder, null, "No WebCodecs candidate may run in the explicit CPU test");
  assert.ok(evidence.memory.validSamples > 0 && evidence.memory.unavailableSamples === 0);
  assert.ok(evidence.memory.incrementalPrivateMiB !== null && evidence.memory.incrementalPrivateMiB <= 250, "Original CPU startup exceeded exact250MiB full-tree increment");
  assert.equal(evidence.stop?.kind, "bounded-startup-window-ended", "A native error or early exit is not a passing startup window");
  assert.equal(evidence.result.type, "error"); assert.equal(evidence.cancellationRequested, true);
  assert.ok(evidence.progress.length > 0); evidence.passedStartupOnly = true;
}
