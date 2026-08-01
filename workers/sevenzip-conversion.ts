import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import type { RandomAccessDestination } from "./random-access-destination";

const MODULE_URL = "/engines/archive7z/within-archive7z.mjs";
const WASM_URL = "/engines/archive7z/within-archive7z.wasm";
const INPUT_BUFFER_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const WASM_MEMORY_BYTES = 64 * 1024 * 1024;
const MAX_ENGINE_ERRORS = 8;
const MAX_ENGINE_ERROR_CHARS = 512;

interface SevenZipBridge {
  read(offset: number, destination: Uint8Array): Promise<number> | number;
  write(offset: number, source: Uint8Array<ArrayBuffer>): Promise<number>;
  cancelled(): boolean;
  message(text: string): void;
  progress(inputPosition: number, outputPosition: number, entries: number): void;
}

interface SevenZipModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  ccall(
    name: "within_archive_7z_to_tar",
    returnType: "number",
    argumentTypes: readonly ["number"],
    arguments_: readonly [number],
    options: { async: true },
  ): Promise<number>;
  _within_archive_error(): number;
  UTF8ToString(pointer: number, maximumBytesToRead?: number): string;
}

type SevenZipModuleFactory = (options: {
  withinBridge: SevenZipBridge;
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<SevenZipModule>;

export interface SevenZipConversionOptions {
  file: File;
  writable: RandomAccessDestination;
  jobId: string;
  metrics: ConversionMetrics;
  startedAt: number;
  isCancelled(): boolean;
  emitProgress(
    jobId: string,
    phase: string,
    metrics: ConversionMetrics,
    startedAt: number,
    force?: boolean,
  ): void;
  post(message: WorkerResponse): void;
}

export async function runSevenZipToTar({
  file,
  writable,
  jobId,
  metrics,
  startedAt,
  isCancelled,
  emitProgress,
  post,
}: SevenZipConversionOptions): Promise<void> {
  const phase = "Converting 7Z to TAR";
  const errors: string[] = [];
  let reader: ReadableStreamBYOBReader | null = null;
  let readerPosition = -1;
  let readBuffer = new Uint8Array(INPUT_BUFFER_BYTES);
  const synchronousReader =
    typeof FileReaderSync === "function" ? new FileReaderSync() : null;

  const assertActive = (): void => {
    if (isCancelled()) {
      throw new DOMException("Conversion cancelled", "AbortError");
    }
  };

  const recordError = (text: string): void => {
    const bounded = text.trim().slice(0, MAX_ENGINE_ERROR_CHARS);
    if (!bounded) return;
    if (errors.length === MAX_ENGINE_ERRORS) errors.shift();
    errors.push(bounded);
  };

  const recordRead = (position: number, bytes: number): void => {
    metrics.inputBytes = Math.max(
      metrics.inputBytes,
      Math.min(file.size, position + bytes),
    );
    metrics.maxReadChunkBytes = Math.max(metrics.maxReadChunkBytes, bytes);
    emitProgress(jobId, phase, metrics, startedAt);
  };

  const bridge: SevenZipBridge = {
    read(offset, destination) {
      assertActive();
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        destination.byteLength > INPUT_BUFFER_BYTES
      ) {
        throw new Error("The 7Z engine requested an invalid bounded input read.");
      }
      const end = Math.min(file.size, offset + destination.byteLength);
      if (end <= offset) return 0;

      if (synchronousReader) {
        const bytes = new Uint8Array(
          synchronousReader.readAsArrayBuffer(file.slice(offset, end)),
        );
        destination.set(bytes);
        recordRead(offset, bytes.byteLength);
        return bytes.byteLength;
      }

      return (async () => {
        if (!reader || readerPosition !== offset) {
          await reader?.cancel("7Z input seek");
          reader = file.slice(offset).stream().getReader({ mode: "byob" });
          readerPosition = offset;
        }
        const requested = end - offset;
        const result = await reader.read(readBuffer.subarray(0, requested));
        assertActive();
        if (result.done || !result.value) {
          reader = null;
          readerPosition = file.size;
          return 0;
        }
        destination.set(result.value);
        readerPosition += result.value.byteLength;
        readBuffer =
          result.value.buffer.byteLength >= INPUT_BUFFER_BYTES
            ? new Uint8Array(result.value.buffer)
            : new Uint8Array(INPUT_BUFFER_BYTES);
        recordRead(offset, result.value.byteLength);
        return result.value.byteLength;
      })();
    },
    async write(offset, source) {
      assertActive();
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        source.byteLength > OUTPUT_BUFFER_BYTES
      ) {
        throw new Error("The 7Z engine requested an invalid bounded output write.");
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
        await writable.write({ type: "write", position: offset, data: source });
        metrics.outputBytes = Math.max(metrics.outputBytes, offset + source.byteLength);
        emitProgress(jobId, phase, metrics, startedAt);
        return source.byteLength;
      } finally {
        metrics.queuedBytes = 0;
        metrics.pendingOperations = 0;
      }
    },
    cancelled: isCancelled,
    message: recordError,
    progress(inputPosition, outputPosition) {
      metrics.inputBytes = Math.max(
        metrics.inputBytes,
        Math.min(file.size, inputPosition),
      );
      metrics.outputBytes = Math.max(metrics.outputBytes, outputPosition);
      emitProgress(jobId, phase, metrics, startedAt);
    },
  };

  metrics.activeWorkerCount = 1 + (writable.additionalWorkerCount ?? 0);
  metrics.sharedArrayBufferBytes = writable.sharedBufferBytes ?? 0;

  try {
    const imported = (await import(
      /* @vite-ignore */ MODULE_URL
    )) as { default: SevenZipModuleFactory };
    const archiveModule = await imported.default({
      withinBridge: bridge,
      locateFile: (name) => (name.endsWith(".wasm") ? WASM_URL : name),
      print: () => {},
      printErr: recordError,
    });
    assertActive();
    metrics.wasmMemoryBytes = archiveModule.HEAPU8.buffer.byteLength;
    if (metrics.wasmMemoryBytes !== WASM_MEMORY_BYTES) {
      throw new Error(
        `The 7Z engine loaded ${metrics.wasmMemoryBytes} bytes of Wasm memory; expected the fixed ${WASM_MEMORY_BYTES}-byte heap.`,
      );
    }
    metrics.peakWasmMemoryBytes = Math.max(
      metrics.peakWasmMemoryBytes ?? 0,
      metrics.wasmMemoryBytes,
    );
    const result = await archiveModule.ccall(
      "within_archive_7z_to_tar",
      "number",
      ["number"],
      [file.size],
      { async: true },
    );
    if (isCancelled()) {
      throw new DOMException("Conversion cancelled", "AbortError");
    }
    if (result !== 0) {
      const nativeError = archiveModule.UTF8ToString(
        archiveModule._within_archive_error(),
        1024,
      );
      const details = [nativeError, ...errors].filter(Boolean).join(" | ");
      throw new Error(details || `7Z conversion failed with code ${result}.`);
    }
    if (metrics.outputBytes === 0) {
      throw new Error("The 7Z engine completed without producing a TAR archive.");
    }
    metrics.inputBytes = file.size;
    await writable.flush?.();
    emitProgress(jobId, phase, metrics, startedAt, true);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      for (const message of errors) {
        post({ type: "warning", jobId, message });
      }
    }
    throw error;
  } finally {
    const activeReader = reader as ReadableStreamBYOBReader | null;
    await activeReader?.cancel("7Z conversion finished").catch(() => {});
  }
}
