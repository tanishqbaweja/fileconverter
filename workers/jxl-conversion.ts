import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import type { RandomAccessDestination } from "./random-access-destination";
import { recordWasmMemory } from "./wasm-metrics";

const MODULE_URL = "/engines/jxl/within-jxl.mjs";
const WASM_URL = "/engines/jxl/within-jxl.wasm";
const INPUT_BUFFER_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 96 * 1024 * 1024;
const WASM_MEMORY_BYTES = 112 * 1024 * 1024;
const DECODER_ALLOCATION_LIMIT_BYTES = 102 * 1024 * 1024;

interface JxlBridge {
  read(offset: number, destination: Uint8Array): Promise<number> | number;
  write(offset: number, source: Uint8Array<ArrayBuffer>): Promise<number> | number;
  message(text: string): void;
}

interface JxlModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  ccall(
    name: "within_jxl_to_png",
    returnType: "number",
    argumentTypes: readonly "number"[],
    arguments_: readonly number[],
    options: { async: true },
  ): Promise<number>;
  _within_jxl_error(): number;
  _within_jxl_width(): number;
  _within_jxl_height(): number;
  _within_jxl_bits(): number;
  _within_jxl_channels(): number;
  _within_jxl_has_animation(): number;
  _within_jxl_peak_decoder_allocation(): number;
  UTF8ToString(pointer: number, maximumBytesToRead?: number): string;
}

type JxlModuleFactory = (options: {
  withinBridge: JxlBridge;
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<JxlModule>;

export interface JxlConversionOptions {
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

export async function runJxlToPng(options: JxlConversionOptions): Promise<void> {
  const { file, writable, jobId, metrics, startedAt, emitProgress } = options;
  if (file.size < 2 || file.size > MAX_INPUT_BYTES) {
    throw new Error("JPEG XL input must be between 2 bytes and 64 MiB.");
  }

  const errors: string[] = [];
  const synchronousReader =
    typeof FileReaderSync === "function" ? new FileReaderSync() : null;
  let reader: ReadableStreamBYOBReader | null = null;
  let readerPosition = -1;
  let readBuffer = new Uint8Array(INPUT_BUFFER_BYTES);
  let firstWrite = true;

  const assertActive = (): void => {
    if (options.isCancelled()) {
      throw new DOMException("Conversion cancelled", "AbortError");
    }
  };
  const message = (text: string): void => {
    const bounded = text.trim().slice(0, 512);
    if (!bounded) return;
    if (errors.length === 8) errors.shift();
    errors.push(bounded);
  };
  const bridge: JxlBridge = {
    read(offset, destination) {
      assertActive();
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        destination.byteLength > INPUT_BUFFER_BYTES
      ) {
        throw new Error("JPEG XL engine requested an invalid bounded input read.");
      }
      const end = Math.min(file.size, offset + destination.byteLength);
      if (end <= offset) return 0;
      const record = (bytes: number): number => {
        metrics.inputBytes = Math.max(
          metrics.inputBytes,
          Math.min(file.size, offset + bytes),
        );
        metrics.maxReadChunkBytes = Math.max(metrics.maxReadChunkBytes, bytes);
        emitProgress(jobId, "Decoding JPEG XL", metrics, startedAt);
        return bytes;
      };
      if (synchronousReader) {
        const bytes = new Uint8Array(
          synchronousReader.readAsArrayBuffer(file.slice(offset, end)),
        );
        destination.set(bytes);
        return record(bytes.byteLength);
      }
      return (async () => {
        if (!reader || readerPosition !== offset) {
          await reader?.cancel("JPEG XL input seek");
          reader = file.slice(offset).stream().getReader({ mode: "byob" });
          readerPosition = offset;
        }
        const request = end - offset;
        const result = await reader.read(readBuffer.subarray(0, request));
        assertActive();
        if (result.done || !result.value) return 0;
        destination.set(result.value);
        readerPosition += result.value.byteLength;
        readBuffer =
          result.value.buffer.byteLength >= INPUT_BUFFER_BYTES
            ? new Uint8Array(result.value.buffer)
            : new Uint8Array(INPUT_BUFFER_BYTES);
        return record(result.value.byteLength);
      })();
    },
    write(offset, source) {
      assertActive();
      if (
        !Number.isSafeInteger(offset) ||
        offset !== metrics.outputBytes ||
        source.byteLength > OUTPUT_BUFFER_BYTES ||
        offset + source.byteLength > MAX_OUTPUT_BYTES
      ) {
        throw new Error("JPEG XL engine requested an invalid bounded PNG write.");
      }
      const complete = (): number => {
        metrics.outputBytes += source.byteLength;
        metrics.maxWriteChunkBytes = Math.max(
          metrics.maxWriteChunkBytes,
          source.byteLength,
        );
        metrics.queuedBytes = 0;
        metrics.pendingOperations = 0;
        emitProgress(jobId, "Writing PNG", metrics, startedAt);
        return source.byteLength;
      };
      const execute = (): Promise<number> | number => {
        assertActive();
        metrics.queuedBytes = source.byteLength;
        metrics.peakQueuedBytes = Math.max(
          metrics.peakQueuedBytes,
          source.byteLength,
        );
        metrics.pendingOperations = 1;
        metrics.peakPendingOperations = Math.max(metrics.peakPendingOperations, 1);
        if (
          writable.writeSync?.({
            type: "write",
            position: offset,
            data: source,
          })
        ) {
          return complete();
        }
        return writable
          .write({ type: "write", position: offset, data: source })
          .then(complete);
      };
      if (firstWrite) {
        firstWrite = false;
        return new Promise<void>((resolve) => setTimeout(resolve, 0)).then(execute);
      }
      return execute();
    },
    message,
  };

  metrics.activeWorkerCount = 1 + (writable.additionalWorkerCount ?? 0);
  metrics.sharedArrayBufferBytes = writable.sharedBufferBytes ?? 0;
  try {
    const imported = (await import(/* @vite-ignore */ MODULE_URL)) as {
      default: JxlModuleFactory;
    };
    const jxlModule = await imported.default({
      withinBridge: bridge,
      locateFile: (name) => (name.endsWith(".wasm") ? WASM_URL : name),
      print: () => {},
      printErr: message,
    });
    assertActive();
    const wasmMemoryBytes = jxlModule.HEAPU8.buffer.byteLength;
    if (wasmMemoryBytes !== WASM_MEMORY_BYTES) {
      throw new Error(
        `JPEG XL engine loaded ${wasmMemoryBytes} bytes of Wasm memory; expected ${WASM_MEMORY_BYTES}.`,
      );
    }
    recordWasmMemory(metrics, "libjxl", wasmMemoryBytes);
    emitProgress(jobId, "Starting JPEG XL decoder", metrics, startedAt, true);
    const result = await jxlModule.ccall(
      "within_jxl_to_png",
      "number",
      ["number"],
      [file.size],
      { async: true },
    );
    assertActive();
    if (result !== 0) {
      const nativeError = jxlModule.UTF8ToString(
        jxlModule._within_jxl_error(),
        1024,
      );
      throw new Error(
        [nativeError, ...errors].filter(Boolean).join(" | ") ||
          `JPEG XL conversion failed with code ${result}.`,
      );
    }

    const width = jxlModule._within_jxl_width();
    const height = jxlModule._within_jxl_height();
    const bits = jxlModule._within_jxl_bits();
    const channels = jxlModule._within_jxl_channels();
    const decoderPeak = jxlModule._within_jxl_peak_decoder_allocation();
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      (bits !== 8 && bits !== 16) ||
      channels < 1 ||
      channels > 4 ||
      decoderPeak > DECODER_ALLOCATION_LIMIT_BYTES
    ) {
      throw new Error("JPEG XL engine returned invalid bounded-decoder metadata.");
    }
    if (metrics.outputBytes < 1) {
      throw new Error("JPEG XL engine completed without producing PNG output.");
    }
    if (jxlModule._within_jxl_has_animation() !== 0) {
      options.post({
        type: "warning",
        jobId,
        message:
          "This JPEG XL contains animation; only its first fully rendered frame was converted.",
      });
    }
    metrics.inputBytes = file.size;
    await writable.flush?.();
    emitProgress(jobId, "Converted JPEG XL to PNG", metrics, startedAt, true);
  } finally {
    metrics.queuedBytes = 0;
    metrics.pendingOperations = 0;
    const activeReader = reader as ReadableStreamBYOBReader | null;
    await activeReader?.cancel("JPEG XL conversion finished").catch(() => {});
  }
}
