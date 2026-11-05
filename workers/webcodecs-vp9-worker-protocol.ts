import type { ConversionMetrics } from "../lib/conversion-protocol";
import type { VideoConversionOptions } from "../lib/media-conversion-options";
import type { WebCodecsVp9Core } from "./webcodecs-vp9-core";
export interface Vp9WorkerRequest {
  file: File;
  output: FileSystemFileHandle;
  cancellation: SharedArrayBuffer;
  nativeProfile: 10 | 11;
  video: VideoConversionOptions;
  implementation: "candidate" | "wasm-baseline" | "automatic";
  diagnosticCheckpoints?: boolean;
  fallbackCore?: "default" | "single-thread";
  /** Private adverse-path qualification only; never a public conversion option. */
  qualificationFault?: "write" | "cancel-after-write";
}
export interface Vp9WorkerTerminal {
  type: "complete" | "error";
  elapsedMs: number;
  metrics: ConversionMetrics & { activeWorkerCount: number };
  warnings: string[];
  encoder: ReturnType<WebCodecsVp9Core["snapshot"]>;
  message?: string;
  errorName?: string;
  errorStage?: "request-validation" | "destination-open" | "engine-load" | "conversion" | "output-close";
  cleanupComplete: boolean;
  cleanupError?: string;
  writeAttempts: number;
}
