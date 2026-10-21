import type { ConversionMetrics, StartConversionMessage, WorkerResponse } from "./conversion-protocol";
import { isVpxDecoderProfile } from "./vpx-decoder-policy";
import { isOwnedCompletedStage } from "./staged-copy-protocol";
type Terminal = Extract<WorkerResponse, { type: "complete" | "cancelled" | "error" }>;
export type VpxQualificationResult = Terminal & { phases: string[]; nativeMetrics: ConversionMetrics | null };
export function validateVpxQualificationRequest(request: StartConversionMessage): void {
  if (request.type !== "start" || !isVpxDecoderProfile(request.profileId) || request.destination.mode !== "staged-handle" ||
      !isOwnedCompletedStage(request.profileId, request.destination.stagingName, request.jobId) ||
      !(request.file instanceof File) || request.file.size <= 0 ||
      !(request.cancellationBuffer instanceof SharedArrayBuffer) || request.cancellationBuffer.byteLength !== 4) {
    throw new TypeError("Only an owned, staged VPX qualification job is allowed.");
  }
}
/** Observe the actual app coordinator/worker, not an alternate converter. */
export async function runVpxQualificationJob(worker: Worker, request: StartConversionMessage, signal: AbortSignal): Promise<VpxQualificationResult> {
  validateVpxQualificationRequest(request); signal.throwIfAborted();
  const phases: string[] = []; let nativeMetrics: ConversionMetrics | null = null;
  let onMessage: EventListener, onError: EventListener, onAbort: () => void;
  try {
    return await new Promise<VpxQualificationResult>((resolve, reject) => {
      onMessage = event => {
        const message = (event as MessageEvent<WorkerResponse>).data;
        if (message.type === "ready" || message.jobId !== request.jobId) return;
        if (message.type === "progress") {
          const phase = message.phase.slice(0, 256);
          if (phases.at(-1) !== phase) { if (phases.length === 32) phases.shift(); phases.push(phase); }
          if (phase.startsWith("Decoding VP") ||
              (phase === "Copying staged MP4 to selected destination" && (message.metrics.wasmMemoryBytes ?? 0) > 0))
            nativeMetrics = { ...message.metrics, wasmMemories: { ...message.metrics.wasmMemories } };
        } else if (message.type === "complete" || message.type === "cancelled" || message.type === "error") resolve({ ...message, phases, nativeMetrics });
      };
      onError = event => reject(new Error((event as ErrorEvent).message || "VPX qualification worker failed."));
      onAbort = () => reject(signal.reason);
      worker.addEventListener("message", onMessage); worker.addEventListener("error", onError);
      signal.addEventListener("abort", onAbort, { once: true }); worker.postMessage(request);
    });
  } finally {
    worker.removeEventListener("message", onMessage!); worker.removeEventListener("error", onError!); signal.removeEventListener("abort", onAbort!);
  }
}
