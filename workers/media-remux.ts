import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import type { RandomAccessDestination } from "./random-access-destination";

const REMUX_MODULE_URL = "/engines/remux/within-remux.mjs";
const REMUX_WASM_URL = "/engines/remux/within-remux.wasm";
const MAX_AVIO_CHUNK = 256 * 1024;
const ROTATE_REQUIRED = -4096;

interface RemuxProgress {
  inputPosition: number;
  outputSize: number;
  mediaTimeUs: number;
  durationUs: number;
  wasmMemoryBytes: number;
}

interface RemuxBridge {
  inputSize: number;
  copyOutput: boolean;
  read: (offset: number, destination: Uint8Array) => Promise<number>;
  writeSync?: (offset: number, source: Uint8Array<ArrayBuffer>) => number;
  write: (offset: number, source: Uint8Array<ArrayBuffer>) => Promise<number>;
  rotate?: () => Promise<void>;
  truncateSync?: (size: number) => void;
  truncate: (size: number) => Promise<void>;
  flushSync?: () => void;
  flush: () => Promise<void>;
  cancelled: () => boolean;
  message: (level: number, text: string) => void;
  progress: (progress: RemuxProgress) => void;
}

interface RemuxModule {
  ccall: (
    name: string,
    returnType: "number",
    argumentTypes: readonly ["number"],
    arguments_: readonly [number],
    options: { async: true },
  ) => Promise<number>;
}

type RemuxModuleFactory = (options: {
  withinBridge: RemuxBridge;
  locateFile: (path: string) => string;
  print: (text: string) => void;
  printErr: (text: string) => void;
}) => Promise<RemuxModule>;

export interface MediaRemuxOptions {
  file: File;
  writable: RandomAccessDestination;
  remuxProfile: 1 | 2;
  jobId: string;
  metrics: ConversionMetrics;
  startedAt: number;
  isCancelled: () => boolean;
  emitProgress: (
    jobId: string,
    phase: string,
    metrics: ConversionMetrics,
    startedAt: number,
    force?: boolean,
  ) => void;
  post: (message: WorkerResponse) => void;
}

function assertBoundedChunk(length: number, operation: string): void {
  if (length < 0 || length > MAX_AVIO_CHUNK) {
    throw new Error(
      `${operation} requested ${length} bytes; the AVIO safety limit is ${MAX_AVIO_CHUNK} bytes.`,
    );
  }
}

export async function runMediaRemux({
  file,
  writable,
  remuxProfile,
  jobId,
  metrics,
  startedAt,
  isCancelled,
  emitProgress,
  post,
}: MediaRemuxOptions): Promise<void> {
  const engineErrors: string[] = [];
  let totalReadBytes = 0;
  let inputReader: ReadableStreamBYOBReader | null = null;
  let inputReaderPosition = -1;
  let inputBuffer = new Uint8Array(MAX_AVIO_CHUNK);
  metrics.activeWorkerCount = 1;
  metrics.sharedArrayBufferBytes = 0;

  const assertActive = (): void => {
    if (isCancelled()) {
      throw new DOMException("Conversion cancelled", "AbortError");
    }
  };

  const recordRead = (bytes: number): void => {
    totalReadBytes += bytes;
    metrics.inputBytes = Math.min(file.size, totalReadBytes);
    metrics.maxReadChunkBytes = Math.max(metrics.maxReadChunkBytes, bytes);
    emitProgress(jobId, "Lossless remux", metrics, startedAt);
  };

  const recordWrite = (offset: number, bytes: number): void => {
    metrics.maxWriteChunkBytes = Math.max(metrics.maxWriteChunkBytes, bytes);
    metrics.outputBytes = Math.max(metrics.outputBytes, offset + bytes);
    metrics.queuedBytes = 0;
    metrics.pendingOperations = 0;
    emitProgress(jobId, "Lossless remux", metrics, startedAt);
  };

  const bridge: RemuxBridge = {
    inputSize: file.size,
    copyOutput: writable.requiresOwnedWriteBuffer,
    async read(offset, destination) {
      assertActive();
      assertBoundedChunk(destination.byteLength, "Input read");
      if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new Error(`FFmpeg requested an invalid input offset: ${offset}.`);
      }
      const end = Math.min(file.size, offset + destination.byteLength);
      if (end <= offset) return 0;
      if (!inputReader || inputReaderPosition !== offset) {
        await inputReader?.cancel("FFmpeg input seek");
        inputReader = file
          .slice(offset)
          .stream()
          .getReader({ mode: "byob" });
        inputReaderPosition = offset;
      }
      if (inputBuffer.byteLength < destination.byteLength) {
        inputBuffer = new Uint8Array(MAX_AVIO_CHUNK);
      }
      const { done, value } = await inputReader.read(
        inputBuffer.subarray(0, end - offset),
      );
      assertActive();
      if (done || !value) {
        inputReader = null;
        inputReaderPosition = file.size;
        return 0;
      }
      destination.set(value);
      inputReaderPosition += value.byteLength;
      inputBuffer =
        value.buffer.byteLength >= MAX_AVIO_CHUNK
          ? new Uint8Array(value.buffer)
          : new Uint8Array(MAX_AVIO_CHUNK);
      recordRead(value.byteLength);
      return value.byteLength;
    },
    writeSync: writable.writeSync
      ? (offset, source) => {
          assertActive();
          assertBoundedChunk(source.byteLength, "Output write");
          if (!Number.isSafeInteger(offset) || offset < 0) {
            throw new Error(
              `FFmpeg requested an invalid output offset: ${offset}.`,
            );
          }
          metrics.queuedBytes = source.byteLength;
          metrics.peakQueuedBytes = Math.max(
            metrics.peakQueuedBytes,
            metrics.queuedBytes,
          );
          metrics.pendingOperations = 1;
          metrics.peakPendingOperations = Math.max(
            metrics.peakPendingOperations,
            metrics.pendingOperations,
          );
          if (
            !writable.writeSync!({
              type: "write",
              position: offset,
              data: source,
            })
          ) {
            metrics.queuedBytes = 0;
            metrics.pendingOperations = 0;
            return ROTATE_REQUIRED;
          }
          recordWrite(offset, source.byteLength);
          return source.byteLength;
        }
      : undefined,
    async write(offset, source) {
      assertActive();
      assertBoundedChunk(source.byteLength, "Output write");
      if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new Error(`FFmpeg requested an invalid output offset: ${offset}.`);
      }

      metrics.queuedBytes = source.byteLength;
      metrics.peakQueuedBytes = Math.max(
        metrics.peakQueuedBytes,
        metrics.queuedBytes,
      );
      metrics.pendingOperations = 1;
      metrics.peakPendingOperations = Math.max(
        metrics.peakPendingOperations,
        metrics.pendingOperations,
      );
      metrics.maxWriteChunkBytes = Math.max(
        metrics.maxWriteChunkBytes,
        source.byteLength,
      );
      try {
        await writable.write({
          type: "write",
          position: offset,
          data: source,
        });
        recordWrite(offset, source.byteLength);
        return source.byteLength;
      } finally {
        metrics.queuedBytes = 0;
        metrics.pendingOperations = 0;
      }
    },
    rotate: writable.rotate
      ? async () => {
          assertActive();
          await writable.rotate!();
        }
      : undefined,
    truncateSync: writable.truncateSync
      ? (size) => {
          assertActive();
          writable.truncateSync!(size);
          metrics.outputBytes = size;
        }
      : undefined,
    async truncate(size) {
      assertActive();
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(`FFmpeg requested an invalid truncate size: ${size}.`);
      }
      await writable.truncate(size);
      metrics.outputBytes = size;
    },
    flushSync: writable.flushSync
      ? () => {
          assertActive();
          writable.flushSync!();
        }
      : undefined,
    async flush() {
      assertActive();
      await writable.flush?.();
    },
    cancelled: isCancelled,
    message(level, text) {
      if (level === 1) {
        post({ type: "warning", jobId, message: text });
      } else if (level >= 2) {
        engineErrors.push(text);
      }
    },
    progress(progress) {
      const timelineRatio =
        progress.durationUs > 0
          ? Math.min(1, Math.max(0, progress.mediaTimeUs / progress.durationUs))
          : 0;
      metrics.inputBytes = Math.max(
        metrics.inputBytes,
        Math.round(file.size * timelineRatio),
      );
      metrics.outputBytes = Math.max(metrics.outputBytes, progress.outputSize);
      metrics.wasmMemoryBytes = progress.wasmMemoryBytes;
      metrics.peakWasmMemoryBytes = Math.max(
        metrics.peakWasmMemoryBytes ?? 0,
        progress.wasmMemoryBytes,
      );
      emitProgress(jobId, "Lossless remux", metrics, startedAt);
    },
  };

  const imported = (await import(
    /* @vite-ignore */ REMUX_MODULE_URL
  )) as { default: RemuxModuleFactory };
  const engineModule = await imported.default({
    withinBridge: bridge,
    locateFile: (path) =>
      path.endsWith(".wasm") ? REMUX_WASM_URL : `/engines/remux/${path}`,
    print: () => {},
    printErr: (text) => {
      if (text.trim()) engineErrors.push(text.trim());
    },
  });
  assertActive();

  const result = await engineModule.ccall(
    "within_remux",
    "number",
    ["number"],
    [remuxProfile],
    { async: true },
  );
  if (isCancelled()) {
    throw new DOMException("Conversion cancelled", "AbortError");
  }
  if (result !== 0) {
    throw new Error(
      engineErrors.join(" | ") || `FFmpeg remux failed with code ${result}.`,
    );
  }
}
