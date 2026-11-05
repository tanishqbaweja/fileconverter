// Private lifecycle candidate. No native engine is imported into this coordinator.
import type { Vp9WorkerRequest, Vp9WorkerTerminal } from "./webcodecs-vp9-worker-protocol";
type Child = Pick<Worker, "onmessage" | "onerror" | "onmessageerror" | "postMessage" | "terminate">;
function terminal(value: unknown): Vp9WorkerTerminal {
  if (!value || typeof value !== "object") throw new TypeError("Invalid private child result");
  const row = value as Vp9WorkerTerminal;
  if (!["complete", "error"].includes(row.type) || !Number.isSafeInteger(row.writeAttempts) || row.writeAttempts < 0 ||
      typeof row.cleanupComplete !== "boolean" || (row.type === "complete" && !row.cleanupComplete) || !row.metrics ||
      !Number.isSafeInteger(row.metrics.activeWorkerCount) || row.metrics.activeWorkerCount < 1 || !Number.isFinite(row.elapsedMs) ||
      !Array.isArray(row.warnings) || row.warnings.length > 32 || row.warnings.some(text => typeof text !== "string" || text.length > 512) ||
      (row.type === "error" && (typeof row.errorName !== "string" || row.errorName.length > 64 ||
        typeof row.message !== "string" || row.message.length > 4096 ||
        !["request-validation", "destination-open", "engine-load", "conversion", "output-close"].includes(row.errorStage ?? ""))))
    throw new TypeError("Invalid bounded private child terminal");
  return row;
}
export async function runIsolatedWebCodecsVp9(request: Vp9WorkerRequest, {
  createChild, progress = () => {}, deadlineMs = 60000,
}: { createChild: () => Child; progress?: (message: unknown) => void; deadlineMs?: number }) {
  if (!(request.file instanceof File) || !(request.cancellation instanceof SharedArrayBuffer) || request.cancellation.byteLength !== 4 ||
      request.implementation !== "automatic" || request.diagnosticCheckpoints || ![10, 11].includes(request.nativeProfile) ||
      !["default", "single-thread"].includes(request.fallbackCore ?? "single-thread") ||
      (request.qualificationFault !== undefined && !["write", "cancel-after-write"].includes(request.qualificationFault)) ||
      !Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 1800000)
    throw new TypeError("Invalid private isolated VP9 request");
  const cancelled = new Int32Array(request.cancellation), startedAt = performance.now();
  let childrenStarted = 0, terminationRequests = 0;
  const assertActive = () => { if (Atomics.load(cancelled, 0) !== 0) throw new DOMException("Conversion cancelled", "AbortError"); };
  const run = async (implementation: "candidate" | "wasm-baseline") => {
    assertActive(); const child = createChild(); childrenStarted++; let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<Vp9WorkerTerminal>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Private isolated child deadline exceeded")), deadlineMs);
        child.onerror = event => reject(new Error(String(event.message || "Private child failed").slice(0, 512)));
        child.onmessageerror = () => reject(new Error("Private child message could not be cloned"));
        child.onmessage = ({ data }) => {
          try {
            if (data?.type === "progress") {
              if (typeof data.phase !== "string" || data.phase.length > 512 || !data.metrics ||
                  !Number.isSafeInteger(data.metrics.activeWorkerCount) || data.metrics.activeWorkerCount < 1)
                throw new TypeError("Invalid private child progress");
              progress({ type: "progress", phase: data.phase, metrics: { ...data.metrics, activeWorkerCount: data.metrics.activeWorkerCount + 1 } });
            } else resolve(terminal(data));
          } catch (error) { reject(error); }
        };
        child.postMessage({ ...request, implementation, diagnosticCheckpoints: false,
          fallbackCore: request.fallbackCore ?? "single-thread" });
      });
    } finally {
      clearTimeout(timer); child.onmessage = null; child.onerror = null; child.onmessageerror = null;
      child.terminate(); terminationRequests++;
    }
  };
  // The terminal is structured-cloned bounded metadata, never a native instance,
  // raw exception, File contents, output buffer or decoded frame.
  const first = await run("candidate");
  let result = first, backend: "webcodecs" | "wasm" = "webcodecs", fallbackReason: string | null = null;
  if (Atomics.load(cancelled, 0) === 0 && first.type === "error" && first.errorName === "NotSupportedError" && first.writeAttempts === 0 &&
      ["engine-load", "conversion"].includes(first.errorStage ?? "") && first.cleanupComplete && !first.cleanupError) {
    fallbackReason = first.message!.slice(0, 512);
    // Candidate stream abort has completed, and its owned worker termination
    // was requested BEFORE another worker opens the same destination handle.
    result = await run("wasm-baseline"); backend = "wasm";
  }
  if (Atomics.load(cancelled, 0) !== 0 && result.type === "error") {
    // Keep bounded actual abort/write/cleanup evidence instead of discarding it
    // in a fresh exception. Cancellation never permits another attempt.
    result = { ...result, errorName: "AbortError", message: "Conversion cancelled" };
  } else assertActive();
  const elapsedMs = performance.now() - startedAt;
  return { ...result, elapsedMs, metrics: { ...result.metrics, elapsedMs, activeWorkerCount: result.metrics.activeWorkerCount + 1 },
    encoder: backend === "wasm" ? first.encoder : result.encoder,
    selection: { backend, fallbackReason, ...(backend === "wasm" ? { wasmFallbackCore: request.fallbackCore ?? "single-thread" } : {}) },
    isolation: { childrenStarted, terminationRequests, maximumOwnedChildHandles: 1, coordinatorWorkers: 1,
      candidateTerminationRequestedBeforeFallback: backend === "wasm", synchronousTerminationConfirmed: false,
      actualPeakWorkerRealms: null },
    scope: "private-isolated-worker-control-not-public-or-stress-acceptance" };
}
