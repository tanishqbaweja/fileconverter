import type { ConversionMetrics } from "../lib/conversion-protocol";

const MODULE_URL = "/engines/xz/within-xz.mjs";
const WASM_URL = "/engines/xz/within-xz.wasm";
const INPUT_BUFFER_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_EXPANSION_RATIO = 100;
const LZMA_OK = 0;
const LZMA_STREAM_END = 1;

interface XzModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
  _within_xz_create(decompress: number): number;
  _within_xz_process(
    handle: number,
    input: number,
    inputLength: number,
    finish: number,
    output: number,
    outputCapacity: number,
  ): number;
  _within_xz_last_consumed(handle: number): number;
  _within_xz_last_produced(handle: number): number;
  _within_xz_finished(handle: number): number;
  _within_xz_destroy(handle: number): void;
}

type XzModuleFactory = (options: {
  locateFile(path: string): string;
  print?(text: string): void;
  printErr?(text: string): void;
}) => Promise<XzModule>;

export interface XzConversionOptions {
  file: File;
  decompress: boolean;
  metrics: ConversionMetrics;
  assertActive(): void;
  progress(phase: string): void;
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  validateInput?(chunk: Uint8Array): void;
  validateOutput?(chunk: Uint8Array): void;
}

export async function runXzConversion({
  file,
  decompress,
  metrics,
  assertActive,
  progress,
  write,
  validateInput,
  validateOutput,
}: XzConversionOptions): Promise<void> {
  const imported = (await import(
    /* @vite-ignore */ MODULE_URL
  )) as { default: XzModuleFactory };
  const codecModule = await imported.default({
    locateFile: (name) => (name.endsWith(".wasm") ? WASM_URL : name),
    print: () => {},
    printErr: () => {},
  });
  assertActive();

  metrics.wasmMemoryBytes = codecModule.HEAPU8.buffer.byteLength;
  metrics.peakWasmMemoryBytes = Math.max(
    metrics.peakWasmMemoryBytes ?? 0,
    metrics.wasmMemoryBytes,
  );
  const handle = codecModule._within_xz_create(decompress ? 1 : 0);
  if (!handle) {
    throw new Error("The XZ engine could not allocate its fixed memory.");
  }
  const inputPointer = codecModule._malloc(INPUT_BUFFER_BYTES);
  const outputPointer = codecModule._malloc(OUTPUT_BUFFER_BYTES);
  if (!inputPointer || !outputPointer) {
    if (inputPointer) codecModule._free(inputPointer);
    if (outputPointer) codecModule._free(outputPointer);
    codecModule._within_xz_destroy(handle);
    throw new Error("The XZ engine could not allocate its bounded I/O buffers.");
  }

  const phase = decompress ? "Decompressing XZ" : "Compressing XZ";
  const reader = file.stream().getReader({ mode: "byob" });
  let readBuffer = new Uint8Array(INPUT_BUFFER_BYTES);
  let streamFinished = false;
  let expandedBytes = 0;

  const drainOutput = async (produced: number): Promise<void> => {
    if (!produced) return;
    const chunk = new Uint8Array(produced);
    chunk.set(
      codecModule.HEAPU8.subarray(outputPointer, outputPointer + produced),
    );
    if (decompress) {
      const projected = expandedBytes + produced;
      const ratio = projected / Math.max(1, metrics.inputBytes);
      if (
        projected > MAX_EXPANDED_BYTES ||
        (projected > 1024 * 1024 && ratio > MAX_EXPANSION_RATIO)
      ) {
        throw new Error(
          `XZ decompression stopped: output exceeded the ${MAX_EXPANSION_RATIO}:1 or 64 GiB expansion safety limit.`,
        );
      }
      expandedBytes = projected;
      validateOutput?.(chunk);
    }
    await write(chunk, phase);
  };

  const process = async (
    pointer: number,
    length: number,
    finish: boolean,
  ): Promise<{ consumed: number; produced: number; status: number }> => {
    assertActive();
    const status = codecModule._within_xz_process(
      handle,
      pointer,
      length,
      finish ? 1 : 0,
      outputPointer,
      OUTPUT_BUFFER_BYTES,
    );
    const consumed = codecModule._within_xz_last_consumed(handle);
    const produced = codecModule._within_xz_last_produced(handle);
    if (
      consumed < 0 ||
      consumed > length ||
      produced < 0 ||
      produced > OUTPUT_BUFFER_BYTES
    ) {
      throw new Error("The XZ engine returned invalid bounded-I/O counters.");
    }
    if (status !== LZMA_OK && status !== LZMA_STREAM_END) {
      throw xzError(status);
    }
    await drainOutput(produced);
    return { consumed, produced, status };
  };

  try {
    for (;;) {
      assertActive();
      const { done, value } = await reader.read(readBuffer);
      if (done) break;
      if (streamFinished) {
        throw new Error("XZ input contains trailing data after the stream end.");
      }
      metrics.inputBytes += value.byteLength;
      metrics.maxReadChunkBytes = Math.max(
        metrics.maxReadChunkBytes,
        value.byteLength,
      );
      validateInput?.(value);
      codecModule.HEAPU8.set(value, inputPointer);
      progress(phase);

      let offset = 0;
      while (offset < value.byteLength) {
        const remaining = value.byteLength - offset;
        const result = await process(
          inputPointer + offset,
          remaining,
          false,
        );
        offset += result.consumed;
        if (result.status === LZMA_STREAM_END) {
          streamFinished = true;
          if (offset !== value.byteLength) {
            throw new Error("XZ input contains trailing data after the stream end.");
          }
          break;
        }
        if (result.consumed === 0 && result.produced === 0) {
          throw new Error("The XZ engine stopped making progress.");
        }
      }
      readBuffer = nextByobBuffer(value);
    }

    if (decompress) {
      if (!streamFinished) {
        const result = await process(0, 0, true);
        streamFinished = result.status === LZMA_STREAM_END;
      }
      if (!streamFinished && !codecModule._within_xz_finished(handle)) {
        throw new Error(
          "XZ input is truncated: the compressed stream ended before completion.",
        );
      }
    } else {
      while (!streamFinished) {
        const result = await process(0, 0, true);
        streamFinished = result.status === LZMA_STREAM_END;
        if (!streamFinished && result.produced === 0) {
          throw new Error("The XZ encoder stopped before finishing its stream.");
        }
      }
    }
    metrics.inputBytes = file.size;
    progress(phase);
  } finally {
    await reader.cancel().catch(() => {});
    codecModule._free(outputPointer);
    codecModule._free(inputPointer);
    codecModule._within_xz_destroy(handle);
  }
}

function nextByobBuffer(
  value: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  return value.buffer.byteLength >= INPUT_BUFFER_BYTES
    ? new Uint8Array(value.buffer, 0, INPUT_BUFFER_BYTES)
    : new Uint8Array(INPUT_BUFFER_BYTES);
}

function xzError(code: number): Error {
  const messages: Record<number, string> = {
    2: "XZ input has no integrity check and is rejected.",
    3: "XZ input uses an unsupported integrity check.",
    4: "XZ returned an unexpected integrity-check notification.",
    5: "XZ exhausted its fixed 48 MiB Wasm memory.",
    6: "XZ input requires more than the 32 MiB decoder memory limit.",
    7: "XZ input has an invalid stream header.",
    8: "XZ input uses unsupported compression options or filters.",
    9: "XZ input is corrupt or failed its integrity check.",
    10: "XZ input is truncated before the stream end.",
    11: "XZ called the codec in an invalid sequence.",
    12: "XZ unexpectedly requested a seek operation.",
  };
  return new Error(messages[code] ?? `XZ conversion failed with code ${code}.`);
}
