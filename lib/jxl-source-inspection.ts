export const MAX_JXL_INSPECTION_BYTES = 4 * 1024 * 1024;
export const JXL_INSPECTOR_WASM_MEMORY_BYTES = 16 * 1024 * 1024;

export interface JxlHeaderInspection {
  width: number;
  height: number;
  bitDepth: number;
  colorChannels: number;
  alphaBits: number;
  orientation: number;
  intrinsicWidth: number;
  intrinsicHeight: number;
  hasAnimation: boolean;
  ticksPerSecondNumerator: number;
  ticksPerSecondDenominator: number;
  loopCount: number;
  hasTimecodes: boolean;
  frameCount: number;
  frameCountExact: boolean;
  totalDurationTicks: number;
  namedFrameCount: number;
  inspectedBytes: number;
  peakDecoderAllocationBytes: number;
  wasmMemoryBytes: number;
  maximumReadBytes: number;
}

type WorkerReply =
  | { ok: true; inspection: JxlHeaderInspection }
  | { ok: false; error: string };

export function inspectJxlHeader(
  file: File,
  signal?: AbortSignal,
): Promise<JxlHeaderInspection> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/jxl-source-inspection-worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const timeout = window.setTimeout(() => {
      finish();
      reject(new Error("JPEG XL header inspection exceeded its 30-second deadline."));
    }, 30_000);
    const finish = () => {
      if (settled) return false;
      settled = true;
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      return true;
    };
    const abort = () => {
      if (!finish()) return;
      reject(new DOMException("JPEG XL header inspection was cancelled.", "AbortError"));
    };
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (!finish()) return;
      if (event.data.ok) resolve(event.data.inspection);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      if (!finish()) return;
      reject(new Error(event.message || "JPEG XL inspection worker failed."));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage({ file });
  });
}
