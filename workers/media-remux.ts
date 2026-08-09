import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import type { RandomAccessDestination } from "./random-access-destination";

const REMUX_MODULE_URL = "/engines/remux/within-remux.mjs";
const REMUX_WASM_URL = "/engines/remux/within-remux.wasm";
const MPEG4_MODULE_URL = "/engines/remux/within-mpeg4.mjs";
const MPEG4_WASM_URL = "/engines/remux/within-mpeg4.wasm";
const THREADED_VIDEO_MODULE_URL = "/engines/remux/within-webm.mjs";
const THREADED_VIDEO_WASM_URL = "/engines/remux/within-webm.wasm";
const VP9_MODULE_URL = "/engines/remux/within-vp9.mjs";
const VP9_WASM_URL = "/engines/remux/within-vp9.wasm";
const DIRECT_REMUX_MODULE_URL = "/engines/remux/within-direct.mjs";
const DIRECT_REMUX_WASM_URL = "/engines/remux/within-direct.wasm";
const MAX_AVIO_CHUNK = 256 * 1024;
const MPEG4_WORKER_POOL_SIZE = 4;
const WEBM_WORKER_POOL_SIZE = 8;
const VP9_WORKER_POOL_SIZE = 8;
const MAX_ENGINE_ERRORS = 32;
const MAX_ENGINE_ERROR_CHARS = 512;
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
  readSync?: (offset: number, destination: Uint8Array) => number;
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
  remuxProfile: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25;
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

function assertBoundedChunk(
  length: number,
  operation: string,
  maximum = MAX_AVIO_CHUNK,
): void {
  if (length < 0 || length > maximum) {
    throw new Error(
      `${operation} requested ${length} bytes; the AVIO safety limit is ${maximum} bytes.`,
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
  const phase =
    remuxProfile === 1
      ? "Lossless remux"
      : remuxProfile === 12
        ? "Extracting H.264 video"
      : remuxProfile === 13
        ? "Extracting MPEG-2 video"
      : remuxProfile === 14
        ? "Wrapping MPEG-2 video"
      : remuxProfile === 15
        ? "Extracting MPEG-4 video"
      : remuxProfile === 16
        ? "Wrapping MPEG-4 video"
      : remuxProfile === 17
        ? "Copying AV1 WebM"
      : remuxProfile === 18
        ? "Extracting MP3 audio"
      : remuxProfile === 19
        ? "Extracting AAC audio"
      : remuxProfile === 20
        ? "Extracting Ogg Vorbis audio"
      : remuxProfile === 21
        ? "Extracting Ogg Opus audio"
      : remuxProfile === 22
        ? "Extracting HEVC video"
      : remuxProfile === 23
        ? "Remuxing to Matroska"
      : remuxProfile === 24
        ? "Remuxing to MPEG-TS"
      : remuxProfile === 25
        ? "Remuxing to 3GP"
      : remuxProfile === 2
        ? "Extracting audio"
        : remuxProfile === 3
          ? "Converting audio"
          : remuxProfile === 6
            ? "Encoding FLAC audio"
          : remuxProfile === 8
            ? "Encoding Apple Lossless audio"
          : remuxProfile === 9
            ? "Encoding Windows Media Audio"
          : remuxProfile === 10 || remuxProfile === 11
            ? "Encoding VP9 WebM"
          : remuxProfile === 5 || remuxProfile === 7
            ? "Encoding VP8 WebM"
            : "Encoding MPEG-4 video";
  const engineErrors: string[] = [];
  const recordEngineError = (text: string): void => {
    const bounded = text.trim().slice(0, MAX_ENGINE_ERROR_CHARS);
    if (!bounded) return;
    if (engineErrors.length === MAX_ENGINE_ERRORS) engineErrors.shift();
    engineErrors.push(bounded);
  };
  let totalReadBytes = 0;
  let inputReader: ReadableStreamBYOBReader | null = null;
  let inputReaderPosition = -1;
  let inputBuffer = new Uint8Array(MAX_AVIO_CHUNK);
  const synchronousFileReader =
    typeof FileReaderSync === "function" ? new FileReaderSync() : null;
  const synchronousInputReader =
    (remuxProfile >= 19 && remuxProfile <= 21) ||
    remuxProfile === 23 ||
    remuxProfile === 24 ||
    remuxProfile === 25
      ? null
      : synchronousFileReader;
  const threadedWorkerPoolSize =
    remuxProfile === 4
      ? MPEG4_WORKER_POOL_SIZE
      : remuxProfile === 5 || remuxProfile === 7
        ? WEBM_WORKER_POOL_SIZE
      : remuxProfile === 10 || remuxProfile === 11
        ? VP9_WORKER_POOL_SIZE
        : 0;
  metrics.activeWorkerCount =
    1 +
    threadedWorkerPoolSize +
    (writable.additionalWorkerCount ?? 0);
  const writerSharedBytes = writable.sharedBufferBytes ?? 0;
  const maximumOutputWriteBytes = writable.maximumWriteBytes ?? MAX_AVIO_CHUNK;
  const useDirectRemuxCore =
    remuxProfile === 1 && maximumOutputWriteBytes > MAX_AVIO_CHUNK;
  const coalescedOutput =
    (remuxProfile === 2 ||
      remuxProfile === 3 ||
      remuxProfile === 6 ||
      remuxProfile === 8 ||
      remuxProfile === 9) &&
    writable.writeSync &&
    writable.additionalWorkerCount === 1
      ? new Uint8Array(maximumOutputWriteBytes)
      : null;
  let coalescedOutputOffset = 0;
  let coalescedOutputLength = 0;
  metrics.sharedArrayBufferBytes = writerSharedBytes;

  const assertActive = (): void => {
    if (isCancelled()) {
      throw new DOMException("Conversion cancelled", "AbortError");
    }
  };

  const recordRead = (bytes: number): void => {
    totalReadBytes += bytes;
    metrics.inputBytes = Math.min(file.size, totalReadBytes);
    metrics.maxReadChunkBytes = Math.max(metrics.maxReadChunkBytes, bytes);
    emitProgress(jobId, phase, metrics, startedAt);
  };

  const recordWrite = (offset: number, bytes: number): void => {
    metrics.maxWriteChunkBytes = Math.max(metrics.maxWriteChunkBytes, bytes);
    metrics.outputBytes = Math.max(metrics.outputBytes, offset + bytes);
    metrics.queuedBytes = 0;
    metrics.pendingOperations = 0;
    emitProgress(jobId, phase, metrics, startedAt);
  };

  const writeDestinationSync = (
    offset: number,
    source: Uint8Array<ArrayBuffer>,
  ): number => {
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
    let completed: boolean;
    try {
      completed = writable.writeSync!({
        type: "write",
        position: offset,
        data: source,
      });
    } catch (error) {
      metrics.queuedBytes = 0;
      metrics.pendingOperations = 0;
      throw error;
    }
    if (!completed) {
      metrics.queuedBytes = 0;
      metrics.pendingOperations = 0;
      return ROTATE_REQUIRED;
    }
    recordWrite(offset, source.byteLength);
    return source.byteLength;
  };

  const flushCoalescedOutputSync = (): void => {
    if (!coalescedOutput || coalescedOutputLength === 0) return;
    const result = writeDestinationSync(
      coalescedOutputOffset,
      coalescedOutput.subarray(0, coalescedOutputLength),
    );
    if (result === ROTATE_REQUIRED) {
      throw new Error(
        "The direct destination unexpectedly requested output rotation.",
      );
    }
    coalescedOutputLength = 0;
  };

  const bridge: RemuxBridge = {
    inputSize: file.size,
    copyOutput: writable.requiresOwnedWriteBuffer,
    readSync: synchronousInputReader
      ? (offset, destination) => {
          assertActive();
          assertBoundedChunk(destination.byteLength, "Input read");
          if (!Number.isSafeInteger(offset) || offset < 0) {
            throw new Error(`FFmpeg requested an invalid input offset: ${offset}.`);
          }
          const end = Math.min(file.size, offset + destination.byteLength);
          if (end <= offset) return 0;
          const bytes = new Uint8Array(
            synchronousInputReader.readAsArrayBuffer(file.slice(offset, end)),
          );
          destination.set(bytes);
          recordRead(bytes.byteLength);
          return bytes.byteLength;
        }
      : undefined,
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
          assertBoundedChunk(
            source.byteLength,
            "Output write",
            maximumOutputWriteBytes,
          );
          if (!Number.isSafeInteger(offset) || offset < 0) {
            throw new Error(
              `FFmpeg requested an invalid output offset: ${offset}.`,
            );
          }

          if (!coalescedOutput) {
            return writeDestinationSync(offset, source);
          }
          const expectedOffset =
            coalescedOutputOffset + coalescedOutputLength;
          if (
            coalescedOutputLength > 0 &&
            (offset !== expectedOffset ||
              source.byteLength >
                coalescedOutput.byteLength - coalescedOutputLength)
          ) {
            flushCoalescedOutputSync();
          }
          if (source.byteLength > coalescedOutput.byteLength) {
            return writeDestinationSync(offset, source);
          }
          if (coalescedOutputLength === 0) {
            coalescedOutputOffset = offset;
          }
          coalescedOutput.set(source, coalescedOutputLength);
          coalescedOutputLength += source.byteLength;
          metrics.outputBytes = Math.max(
            metrics.outputBytes,
            offset + source.byteLength,
          );
          metrics.queuedBytes = coalescedOutputLength;
          metrics.peakQueuedBytes = Math.max(
            metrics.peakQueuedBytes,
            metrics.queuedBytes,
          );
          emitProgress(jobId, phase, metrics, startedAt);
          if (coalescedOutputLength === coalescedOutput.byteLength) {
            flushCoalescedOutputSync();
          }
          return source.byteLength;
        }
      : undefined,
    async write(offset, source) {
      assertActive();
      assertBoundedChunk(
        source.byteLength,
        "Output write",
        maximumOutputWriteBytes,
      );
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
          flushCoalescedOutputSync();
          writable.truncateSync!(size);
          metrics.outputBytes = size;
        }
      : undefined,
    async truncate(size) {
      assertActive();
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(`FFmpeg requested an invalid truncate size: ${size}.`);
      }
      flushCoalescedOutputSync();
      await writable.truncate(size);
      metrics.outputBytes = size;
    },
    flushSync: writable.flushSync
      ? () => {
          assertActive();
          flushCoalescedOutputSync();
          writable.flushSync!();
        }
      : undefined,
    async flush() {
      assertActive();
      flushCoalescedOutputSync();
      await writable.flush?.();
    },
    cancelled: isCancelled,
    message(level, text) {
      if (level === 1) {
        post({ type: "warning", jobId, message: text });
      } else if (level >= 2) {
        recordEngineError(text);
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
      metrics.sharedArrayBufferBytes = progress.wasmMemoryBytes + writerSharedBytes;
      metrics.peakWasmMemoryBytes = Math.max(
        metrics.peakWasmMemoryBytes ?? 0,
        progress.wasmMemoryBytes,
      );
      emitProgress(jobId, phase, metrics, startedAt);
    },
  };

  const moduleUrl =
    useDirectRemuxCore
      ? DIRECT_REMUX_MODULE_URL
      : remuxProfile === 4
      ? MPEG4_MODULE_URL
      : remuxProfile === 5 || remuxProfile === 7
        ? THREADED_VIDEO_MODULE_URL
      : remuxProfile === 10 || remuxProfile === 11
        ? VP9_MODULE_URL
        : REMUX_MODULE_URL;
  const wasmUrl =
    useDirectRemuxCore
      ? DIRECT_REMUX_WASM_URL
      : remuxProfile === 4
      ? MPEG4_WASM_URL
      : remuxProfile === 5 || remuxProfile === 7
        ? THREADED_VIDEO_WASM_URL
      : remuxProfile === 10 || remuxProfile === 11
        ? VP9_WASM_URL
        : REMUX_WASM_URL;
  const imported = (await import(
    /* @vite-ignore */ moduleUrl
  )) as { default: RemuxModuleFactory };
  const engineModule = await imported.default({
    withinBridge: bridge,
    locateFile: (path) =>
      path.endsWith(".wasm") ? wasmUrl : `/engines/remux/${path}`,
    print: () => {},
    printErr: (text) => {
      recordEngineError(text);
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
  if (result === 0) {
    flushCoalescedOutputSync();
  }
  if (result === 0 && metrics.outputBytes === 0) {
    throw new Error(
      engineErrors.join(" | ") ||
        "FFmpeg completed without producing any output bytes.",
    );
  }
  if (result !== 0) {
    throw new Error(
      engineErrors.join(" | ") || `FFmpeg remux failed with code ${result}.`,
    );
  }
}
