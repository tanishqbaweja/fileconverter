import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import type { RandomAccessDestination } from "./random-access-destination";

const MODULE_URL = "/engines/tiff/within-tiff.mjs";
const WASM_URL = "/engines/tiff/within-tiff.wasm";
const INPUT_BUFFER_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const WASM_MEMORY_BYTES = 40 * 1024 * 1024;

interface TiffBridge {
  read(offset: number, destination: Uint8Array): Promise<number> | number;
  write(offset: number, source: Uint8Array<ArrayBuffer>): Promise<number> | number;
  message(text: string): void;
}

interface TiffModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  ccall(
    name: "within_tiff_to_png",
    returnType: "number",
    argumentTypes: readonly ["number"],
    arguments_: readonly [number],
    options: { async: true },
  ): Promise<number>;
  _within_tiff_error(): number;
  _within_tiff_has_more_pages(): number;
  UTF8ToString(pointer: number, maximumBytesToRead?: number): string;
}

type TiffModuleFactory = (options: {
  withinBridge: TiffBridge;
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<TiffModule>;

export interface TiffConversionOptions {
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

export async function runTiffToPng(options: TiffConversionOptions): Promise<void> {
  const { file, writable, jobId, metrics, startedAt, emitProgress } = options;
  if (file.size < 8 || file.size > MAX_INPUT_BYTES) {
    throw new Error("TIFF input must be between 8 bytes and 64 MiB.");
  }
  const errors: string[] = [];
  const synchronousReader = typeof FileReaderSync === "function" ? new FileReaderSync() : null;
  let reader: ReadableStreamBYOBReader | null = null;
  let readerPosition = -1;
  let readBuffer = new Uint8Array(INPUT_BUFFER_BYTES);

  const assertActive = (): void => {
    if (options.isCancelled()) throw new DOMException("Conversion cancelled", "AbortError");
  };
  const message = (text: string): void => {
    const bounded = text.trim().slice(0, 512);
    if (!bounded) return;
    if (errors.length === 8) errors.shift();
    errors.push(bounded);
  };
  const bridge: TiffBridge = {
    read(offset, destination) {
      assertActive();
      if (!Number.isSafeInteger(offset) || offset < 0 || destination.byteLength > INPUT_BUFFER_BYTES) {
        throw new Error("TIFF engine requested an invalid bounded input read.");
      }
      const end = Math.min(file.size, offset + destination.byteLength);
      if (end <= offset) return 0;
      const record = (bytes: number): number => {
        metrics.inputBytes = Math.max(metrics.inputBytes, Math.min(file.size, offset + bytes));
        metrics.maxReadChunkBytes = Math.max(metrics.maxReadChunkBytes, bytes);
        emitProgress(jobId, "Decoding TIFF scanlines", metrics, startedAt);
        return bytes;
      };
      if (synchronousReader) {
        const bytes = new Uint8Array(synchronousReader.readAsArrayBuffer(file.slice(offset, end)));
        destination.set(bytes);
        return record(bytes.byteLength);
      }
      return (async () => {
        if (!reader || readerPosition !== offset) {
          await reader?.cancel("TIFF input seek");
          reader = file.slice(offset).stream().getReader({ mode: "byob" });
          readerPosition = offset;
        }
        const request = end - offset;
        const result = await reader.read(readBuffer.subarray(0, request));
        assertActive();
        if (result.done || !result.value) return 0;
        destination.set(result.value);
        readerPosition += result.value.byteLength;
        readBuffer = result.value.buffer.byteLength >= INPUT_BUFFER_BYTES
          ? new Uint8Array(result.value.buffer)
          : new Uint8Array(INPUT_BUFFER_BYTES);
        return record(result.value.byteLength);
      })();
    },
    write(offset, source) {
      assertActive();
      if (!Number.isSafeInteger(offset) || offset < 0 || source.byteLength > OUTPUT_BUFFER_BYTES ||
          offset + source.byteLength > MAX_OUTPUT_BYTES) {
        throw new Error("TIFF engine requested an invalid bounded PNG write.");
      }
      const complete = (): number => {
        metrics.outputBytes = Math.max(metrics.outputBytes, offset + source.byteLength);
        metrics.maxWriteChunkBytes = Math.max(metrics.maxWriteChunkBytes, source.byteLength);
        metrics.queuedBytes = 0;
        metrics.pendingOperations = 0;
        emitProgress(jobId, "Writing PNG", metrics, startedAt);
        return source.byteLength;
      };
      metrics.queuedBytes = source.byteLength;
      metrics.peakQueuedBytes = Math.max(metrics.peakQueuedBytes, source.byteLength);
      metrics.pendingOperations = 1;
      metrics.peakPendingOperations = Math.max(metrics.peakPendingOperations, 1);
      if (writable.writeSync?.({ type: "write", position: offset, data: source })) return complete();
      return writable.write({ type: "write", position: offset, data: source }).then(complete);
    },
    message,
  };

  metrics.activeWorkerCount = 1 + (writable.additionalWorkerCount ?? 0);
  metrics.sharedArrayBufferBytes = writable.sharedBufferBytes ?? 0;
  try {
    const imported = (await import(/* @vite-ignore */ MODULE_URL)) as { default: TiffModuleFactory };
    const tiffModule = await imported.default({
      withinBridge: bridge,
      locateFile: (name) => name.endsWith(".wasm") ? WASM_URL : name,
      print: () => {},
      printErr: message,
    });
    assertActive();
    metrics.wasmMemoryBytes = tiffModule.HEAPU8.buffer.byteLength;
    if (metrics.wasmMemoryBytes !== WASM_MEMORY_BYTES) {
      throw new Error(`TIFF engine loaded ${metrics.wasmMemoryBytes} bytes of Wasm memory; expected ${WASM_MEMORY_BYTES}.`);
    }
    metrics.peakWasmMemoryBytes = Math.max(metrics.peakWasmMemoryBytes ?? 0, metrics.wasmMemoryBytes);
    const result = await tiffModule.ccall("within_tiff_to_png", "number", ["number"], [file.size], { async: true });
    assertActive();
    if (result !== 0) {
      const nativeError = tiffModule.UTF8ToString(tiffModule._within_tiff_error(), 1024);
      throw new Error([nativeError, ...errors].filter(Boolean).join(" | ") || `TIFF conversion failed with code ${result}.`);
    }
    if (metrics.outputBytes === 0) throw new Error("TIFF engine completed without producing PNG output.");
    if (tiffModule._within_tiff_has_more_pages() !== 0) {
      options.post({
        type: "warning",
        jobId,
        message: "This TIFF contains multiple pages; only the first page was converted.",
      });
    }
    metrics.inputBytes = file.size;
    await writable.flush?.();
    emitProgress(jobId, "Converted TIFF to PNG", metrics, startedAt, true);
  } finally {
    metrics.queuedBytes = 0;
    metrics.pendingOperations = 0;
    const activeReader = reader as ReadableStreamBYOBReader | null;
    await activeReader?.cancel("TIFF conversion finished").catch(() => {});
  }
}
