import type {
  AudioConversionOptions,
  VideoConversionOptions,
} from "./media-conversion-options";
import type { VpxCompiledCore } from "./vpx-compiled-core";
import type { Mpeg2CompiledCore } from "./mpeg2-compiled-core";

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
  /** Actual ccall quality argument, not a native AVCodecContext measurement. */
  audioQualityArgument?: { requested: AudioConversionOptions["quality"]; nativeCode: number; automaticPolicy: "opus-to-vorbis-q7" | null };
  wasmMemoryBytes?: number;
  peakWasmMemoryBytes?: number;
  /** Actual MPEG-2 AVCodecContext fields after native settings-match succeeds. */
  mpeg2EncoderSettings?: { width: number; height: number; frameRateNumerator: number; frameRateDenominator: number;
    bitRateBps: number; qmin: number; qmax: number };
  wasmMemories?: Record<string, number>;
  codecWorkingBytes?: number;
  peakCodecWorkingBytes?: number;
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
  imageWorkingBytes?: number;
  peakImageWorkingBytes?: number;
  maxImagePixelStripBytes?: number;
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
    | {
        mode: "staged-handle";
        handle: FileSystemFileHandle;
        stagingName: string;
      }
    | { mode: "opfs-test"; name: string };
  audioOptions?: AudioConversionOptions;
  videoOptions?: VideoConversionOptions;
  /** Coordinator-owned static code only; never caller-provided user data. */
  vpxCompiledCore?: VpxCompiledCore;
  /** Coordinator-owned immutable MPEG-2 code pair, never caller media/state. */
  mpeg2CompiledCore?: Mpeg2CompiledCore;
  /** Lets synchronous Wasm observe cancellation before its worker can process another message. */
  cancellationBuffer?: SharedArrayBuffer;
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
      /** Bounded local stream preview; never a complete inventory or qualification claim. */
      mediaPlan?: import("./media-conversion-plan").MediaConversionPlan;
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
