export interface ConversionMetrics {
  inputBytes: number;
  outputBytes: number;
  queuedBytes: number;
  peakQueuedBytes: number;
  pendingOperations: number;
  peakPendingOperations: number;
  maxReadChunkBytes: number;
  maxWriteChunkBytes: number;
  elapsedMs: number;
  wasmMemoryBytes?: number;
  peakWasmMemoryBytes?: number;
  wasmMemories?: Record<string, number>;
  scratchBytes?: number;
  peakScratchBytes?: number;
  maxScratchReadChunkBytes?: number;
  maxScratchWriteChunkBytes?: number;
  archiveCompression?: "copy" | "lzma2";
  sharedArrayBufferBytes?: number;
  activeWorkerCount?: number;
  imageFrameFormat?: string | null;
  imageColorSpace?: {
    primaries: string | null;
    transfer: string | null;
    matrix: string | null;
    fullRange: boolean | null;
  };
}

export type TestFault =
  | "write"
  | "quota"
  | "permission"
  | "worker-crash";

export interface StartConversionMessage {
  type: "start";
  jobId: string;
  profileId: string;
  file: File;
  destination:
    | { mode: "handle"; handle: FileSystemFileHandle }
    | { mode: "opfs-test"; name: string };
  /** Localhost-only Playwright fault injection; never sent for user destinations. */
  testFault?: TestFault;
}

export interface CancelConversionMessage {
  type: "cancel";
  jobId: string;
}

export type WorkerRequest = StartConversionMessage | CancelConversionMessage;

export type WorkerResponse =
  | { type: "ready" }
  | {
      type: "progress";
      jobId: string;
      phase: string;
      metrics: ConversionMetrics;
    }
  | { type: "warning"; jobId: string; message: string }
  | {
      type: "complete";
      jobId: string;
      metrics: ConversionMetrics;
      opfsName?: string;
    }
  | {
      type: "cancelled";
      jobId: string;
      metrics: ConversionMetrics;
    }
  | {
      type: "error";
      jobId: string;
      message: string;
      metrics: ConversionMetrics;
    };
