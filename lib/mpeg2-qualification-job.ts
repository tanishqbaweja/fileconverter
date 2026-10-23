import type { ConversionMetrics, StartConversionMessage, WorkerResponse } from "./conversion-protocol";
import { MPEG2_JOB_PROFILE } from "./mpeg2-stage-policy";
import { isOwnedCompletedStage } from "./staged-copy-protocol";
import type { MediaConversionPlan } from "./media-conversion-plan";

type TerminalResponse = Extract<WorkerResponse, { type: "complete" | "cancelled" | "error" }>;
export type Mpeg2QualificationResult = TerminalResponse & {
  phases: string[];
  nativeMetrics: ConversionMetrics | null;
  /** MPEG-2 jobs expose this; the shared bridge's VPX results may omit it. */
  plan?: MediaConversionPlan | null;
};

export function validateMpeg2QualificationRequest(request: StartConversionMessage): void {
  if (request.type !== "start" || request.profileId !== MPEG2_JOB_PROFILE ||
      request.destination.mode !== "staged-handle" ||
      !isOwnedCompletedStage(request.profileId, request.destination.stagingName, request.jobId) ||
      !(request.file instanceof File) || request.file.size <= 0 ||
      !(request.cancellationBuffer instanceof SharedArrayBuffer) || request.cancellationBuffer.byteLength !== 4) {
    throw new TypeError("Only an owned, staged MPEG-2 qualification job is allowed.");
  }
}

/** Observe the existing application lifecycle, never construct a second worker.
 * Only the localhost test bridge exposes this unpublished backend qualification.
 * This does not prove registry/planner/settings or public-route acceptance.
 */
export async function runMpeg2QualificationJob(worker: Worker, request: StartConversionMessage,
  signal: AbortSignal): Promise<Mpeg2QualificationResult> {
  validateMpeg2QualificationRequest(request);
  signal.throwIfAborted();
  const phases: string[] = [];
  let nativeMetrics: ConversionMetrics | null = null;
  let plan: MediaConversionPlan | null = null;
  let onMessage: EventListener, onError: EventListener, onAbort: () => void;
  try {
    return await new Promise<Mpeg2QualificationResult>((resolve, reject) => {
      onMessage = event => {
        const message = (event as MessageEvent<WorkerResponse>).data;
        if (message.type === "ready" || message.jobId !== request.jobId) return;
        if (message.type === "progress") {
          if (message.mediaPlan) plan = message.mediaPlan;
          const phase = message.phase.slice(0, 256);
          if (phases.at(-1) !== phase) {
            if (phases.length === 32) phases.shift();
            phases.push(phase);
          }
          if (phase === "Encoding MPEG-2 MP4") nativeMetrics = { ...message.metrics, wasmMemories: { ...message.metrics.wasmMemories } };
        } else if (message.type === "complete" || message.type === "cancelled" || message.type === "error") {
          resolve({ ...message, phases, nativeMetrics, plan });
        }
      };
      onError = event => reject(new Error((event as ErrorEvent).message || "Qualification worker failed."));
      onAbort = () => reject(signal.reason);
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      signal.addEventListener("abort", onAbort, { once: true });
      worker.postMessage(request);
    });
  } finally {
    worker.removeEventListener("message", onMessage!);
    worker.removeEventListener("error", onError!);
    signal.removeEventListener("abort", onAbort!);
  }
}
