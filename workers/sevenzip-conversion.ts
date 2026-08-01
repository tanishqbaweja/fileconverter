import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import { convertSequentialTarToZip } from "./archive-conversion";
import type { RandomAccessDestination } from "./random-access-destination";

const MODULE_URL = "/engines/archive7z/within-archive7z.mjs";
const WASM_URL = "/engines/archive7z/within-archive7z.wasm";
const INPUT_BUFFER_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const WASM_MEMORY_BYTES = 56 * 1024 * 1024;
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

interface SevenZipReaderOptions extends SevenZipConversionOptions {
  phase: string;
  trackTarDestinationMetrics: boolean;
}

async function writeTrackedDestination(
  options: SevenZipConversionOptions,
  position: number,
  source: Uint8Array<ArrayBuffer>,
  phase: string,
): Promise<void> {
  const { writable, jobId, metrics, startedAt, emitProgress } = options;
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
    await writable.write({ type: "write", position, data: source });
    metrics.outputBytes = Math.max(
      metrics.outputBytes,
      position + source.byteLength,
    );
    emitProgress(jobId, phase, metrics, startedAt);
  } finally {
    metrics.queuedBytes = 0;
    metrics.pendingOperations = 0;
  }
}

async function runSevenZipReader({
  file,
  writable,
  jobId,
  metrics,
  startedAt,
  isCancelled,
  emitProgress,
  post,
  phase,
  trackTarDestinationMetrics,
}: SevenZipReaderOptions): Promise<void> {
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
  const trackedDestinationOptions: SevenZipConversionOptions = {
    file,
    writable,
    jobId,
    metrics,
    startedAt,
    isCancelled,
    emitProgress,
    post,
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
      if (trackTarDestinationMetrics) {
        await writeTrackedDestination(
          trackedDestinationOptions,
          offset,
          source,
          phase,
        );
      } else {
        await writable.write({ type: "write", position: offset, data: source });
      }
      return source.byteLength;
    },
    cancelled: isCancelled,
    message: recordError,
    progress(inputPosition, outputPosition) {
      metrics.inputBytes = Math.max(
        metrics.inputBytes,
        Math.min(file.size, inputPosition),
      );
      if (trackTarDestinationMetrics) {
        metrics.outputBytes = Math.max(metrics.outputBytes, outputPosition);
      }
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
    if (trackTarDestinationMetrics && metrics.outputBytes === 0) {
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

export async function runSevenZipToTar(
  options: SevenZipConversionOptions,
): Promise<void> {
  await runSevenZipReader({
    ...options,
    phase: "Converting 7Z to TAR",
    trackTarDestinationMetrics: true,
  });
}

export async function runSevenZipToTarGz(
  options: SevenZipConversionOptions,
): Promise<void> {
  const gzip = new CompressionStream("gzip");
  const writer = gzip.writable.getWriter();
  const reader = gzip.readable.getReader();
  let tarPosition = 0;
  let compressedPosition = 0;
  let pumpFailure: unknown = null;

  const gzipDestination: RandomAccessDestination = {
    requiresOwnedWriteBuffer: false,
    additionalWorkerCount: options.writable.additionalWorkerCount,
    sharedBufferBytes: options.writable.sharedBufferBytes,
    maximumWriteBytes: OUTPUT_BUFFER_BYTES,
    async write(operation) {
      const source =
        operation instanceof Uint8Array ? operation : operation.data;
      const position =
        operation instanceof Uint8Array
          ? tarPosition
          : (operation.position ?? tarPosition);
      if (position !== tarPosition) {
        throw new Error("The streaming GZIP adapter received a non-sequential TAR write.");
      }
      if (pumpFailure) throw pumpFailure;
      await writer.write(source);
      if (pumpFailure) throw pumpFailure;
      tarPosition += source.byteLength;
    },
    async truncate() {
      throw new Error("The streaming GZIP adapter cannot truncate TAR output.");
    },
    async flush() {},
    async close() {},
    async abort() {},
  };

  const pump = (async () => {
    try {
      for (;;) {
        if (options.isCancelled()) {
          throw new DOMException("Conversion cancelled", "AbortError");
        }
        const { done, value } = await reader.read();
        if (done) return;
        for (let offset = 0; offset < value.byteLength; offset += OUTPUT_BUFFER_BYTES) {
          const part = value.subarray(
            offset,
            Math.min(offset + OUTPUT_BUFFER_BYTES, value.byteLength),
          );
          await writeTrackedDestination(
            options,
            compressedPosition,
            part,
            "Writing TAR.GZ",
          );
          compressedPosition += part.byteLength;
        }
      }
    } catch (error) {
      pumpFailure = error;
      await reader.cancel(error).catch(() => {});
    }
  })();

  try {
    await runSevenZipReader({
      ...options,
      writable: gzipDestination,
      phase: "Converting 7Z to TAR.GZ",
      trackTarDestinationMetrics: false,
    });
    await writer.close();
    await pump;
    if (pumpFailure) throw pumpFailure;
    if (options.metrics.outputBytes === 0) {
      throw new Error("The 7Z engine completed without producing a TAR.GZ archive.");
    }
    await options.writable.flush?.();
    options.emitProgress(
      options.jobId,
      "Converting 7Z to TAR.GZ",
      options.metrics,
      options.startedAt,
      true,
    );
  } catch (error) {
    await writer.abort(error).catch(() => {});
    await reader.cancel(error).catch(() => {});
    await pump;
    throw pumpFailure ?? error;
  }
}

export async function runSevenZipToZip(
  options: SevenZipConversionOptions,
): Promise<void> {
  const tarStream = new TransformStream<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
  >();
  const writer = tarStream.writable.getWriter();
  let tarPosition = 0;
  let consumerFailure: unknown = null;

  const tarDestination: RandomAccessDestination = {
    requiresOwnedWriteBuffer: true,
    additionalWorkerCount: options.writable.additionalWorkerCount,
    sharedBufferBytes: options.writable.sharedBufferBytes,
    maximumWriteBytes: OUTPUT_BUFFER_BYTES,
    async write(operation) {
      const source =
        operation instanceof Uint8Array ? operation : operation.data;
      const position =
        operation instanceof Uint8Array
          ? tarPosition
          : (operation.position ?? tarPosition);
      if (position !== tarPosition) {
        throw new Error("The streaming ZIP adapter received a non-sequential TAR write.");
      }
      if (consumerFailure) throw consumerFailure;
      const owned = source.slice();
      await writer.write(owned);
      if (consumerFailure) throw consumerFailure;
      tarPosition += owned.byteLength;
    },
    async truncate() {
      throw new Error("The streaming ZIP adapter cannot truncate TAR output.");
    },
    async flush() {},
    async close() {},
    async abort() {},
  };

  const consumer = (async () => {
    try {
      await convertSequentialTarToZip(
        {
          file: options.file,
          metrics: options.metrics,
          assertActive() {
            if (options.isCancelled()) {
              throw new DOMException("Conversion cancelled", "AbortError");
            }
          },
          progress(phase) {
            options.emitProgress(
              options.jobId,
              phase,
              options.metrics,
              options.startedAt,
            );
          },
          async write(chunk, phase) {
            for (
              let offset = 0;
              offset < chunk.byteLength;
              offset += OUTPUT_BUFFER_BYTES
            ) {
              const part = chunk.subarray(
                offset,
                Math.min(offset + OUTPUT_BUFFER_BYTES, chunk.byteLength),
              );
              await writeTrackedDestination(
                options,
                options.metrics.outputBytes,
                part,
                phase,
              );
            }
          },
        },
        tarStream.readable,
        "7Z-derived TAR",
      );
    } catch (error) {
      consumerFailure = error;
    }
  })();

  try {
    await runSevenZipReader({
      ...options,
      writable: tarDestination,
      phase: "Converting 7Z to ZIP",
      trackTarDestinationMetrics: false,
    });
    await writer.close();
    await consumer;
    if (consumerFailure) throw consumerFailure;
    if (options.metrics.outputBytes === 0) {
      throw new Error("The 7Z engine completed without producing a ZIP archive.");
    }
    await options.writable.flush?.();
    options.emitProgress(
      options.jobId,
      "Converting 7Z to ZIP",
      options.metrics,
      options.startedAt,
      true,
    );
  } catch (error) {
    await writer.abort(error).catch(() => {});
    await consumer;
    throw error;
  }
}
