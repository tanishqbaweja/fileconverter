import type { ConversionMetrics } from "../lib/conversion-protocol";

const MODULE_URL = "/engines/bzip2/within-bzip2.mjs";
const WASM_URL = "/engines/bzip2/within-bzip2.wasm";
const INPUT_BUFFER_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_EXPANSION_RATIO = 100;
const BZ_OK = 0;
const BZ_RUN_OK = 1;
const BZ_FINISH_OK = 3;
const BZ_STREAM_END = 4;

interface Bzip2Module {
  HEAPU8: Uint8Array<ArrayBuffer>;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
  _within_bzip2_create(decompress: number): number;
  _within_bzip2_process(
    handle: number,
    input: number,
    inputLength: number,
    finish: number,
    output: number,
    outputCapacity: number,
  ): number;
  _within_bzip2_last_consumed(handle: number): number;
  _within_bzip2_last_produced(handle: number): number;
  _within_bzip2_finished(handle: number): number;
  _within_bzip2_destroy(handle: number): void;
}

type Bzip2ModuleFactory = (options: {
  locateFile(path: string): string;
  print?(text: string): void;
  printErr?(text: string): void;
}) => Promise<Bzip2Module>;

export interface Bzip2ConversionOptions {
  file: File;
  decompress: boolean;
  metrics: ConversionMetrics;
  assertActive(): void;
  progress(phase: string): void;
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  validateInput?(chunk: Uint8Array): void;
  validateOutput?(chunk: Uint8Array): void;
}

export async function runBzip2Conversion({
  file,
  decompress,
  metrics,
  assertActive,
  progress,
  write,
  validateInput,
  validateOutput,
}: Bzip2ConversionOptions): Promise<void> {
  const imported = (await import(
    /* @vite-ignore */ MODULE_URL
  )) as { default: Bzip2ModuleFactory };
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
  const handle = codecModule._within_bzip2_create(decompress ? 1 : 0);
  if (!handle) {
    throw new Error("The BZIP2 engine could not allocate its fixed memory.");
  }
  const inputPointer = codecModule._malloc(INPUT_BUFFER_BYTES);
  const outputPointer = codecModule._malloc(OUTPUT_BUFFER_BYTES);
  if (!inputPointer || !outputPointer) {
    if (inputPointer) codecModule._free(inputPointer);
    if (outputPointer) codecModule._free(outputPointer);
    codecModule._within_bzip2_destroy(handle);
    throw new Error("The BZIP2 engine could not allocate its bounded I/O buffers.");
  }

  const phase = decompress ? "Decompressing BZIP2" : "Compressing BZIP2";
  const reader = file.stream().getReader({ mode: "byob" });
  let readBuffer = new Uint8Array(INPUT_BUFFER_BYTES);
  let streamFinished = false;

  const drainOutput = async (produced: number): Promise<void> => {
    if (!produced) return;
    const chunk = new Uint8Array(produced);
    chunk.set(
      codecModule.HEAPU8.subarray(outputPointer, outputPointer + produced),
    );
    if (decompress) {
      const projected = metrics.outputBytes + produced;
      const ratio = projected / Math.max(1, metrics.inputBytes);
      if (
        projected > MAX_EXPANDED_BYTES ||
        (projected > 1024 * 1024 && ratio > MAX_EXPANSION_RATIO)
      ) {
        throw new Error(
          `BZIP2 decompression stopped: output exceeded the ${MAX_EXPANSION_RATIO}:1 or 64 GiB expansion safety limit.`,
        );
      }
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
    const status = codecModule._within_bzip2_process(
      handle,
      pointer,
      length,
      finish ? 1 : 0,
      outputPointer,
      OUTPUT_BUFFER_BYTES,
    );
    const consumed = codecModule._within_bzip2_last_consumed(handle);
    const produced = codecModule._within_bzip2_last_produced(handle);
    if (
      consumed < 0 ||
      consumed > length ||
      produced < 0 ||
      produced > OUTPUT_BUFFER_BYTES
    ) {
      throw new Error("The BZIP2 engine returned invalid bounded-I/O counters.");
    }
    if (status < 0) throw bzip2Error(status);
    if (
      status !== BZ_OK &&
      status !== BZ_RUN_OK &&
      status !== BZ_FINISH_OK &&
      status !== BZ_STREAM_END
    ) {
      throw new Error(`The BZIP2 engine returned unexpected status ${status}.`);
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
        throw new Error("BZIP2 input contains trailing data after the stream end.");
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
        if (result.status === BZ_STREAM_END) {
          streamFinished = true;
          if (offset !== value.byteLength) {
            throw new Error(
              "BZIP2 input contains trailing data after the stream end.",
            );
          }
          break;
        }
        if (result.consumed === 0 && result.produced === 0) {
          throw new Error("The BZIP2 engine stopped making progress.");
        }
      }
      readBuffer = nextByobBuffer(value);
    }

    if (decompress) {
      if (!streamFinished) {
        const result = await process(0, 0, true);
        streamFinished = result.status === BZ_STREAM_END;
      }
      if (!streamFinished && !codecModule._within_bzip2_finished(handle)) {
        throw new Error("BZIP2 input ended before the compressed stream was complete.");
      }
    } else {
      while (!streamFinished) {
        const result = await process(0, 0, true);
        streamFinished = result.status === BZ_STREAM_END;
        if (!streamFinished && result.produced === 0) {
          throw new Error("The BZIP2 encoder stopped before finishing its stream.");
        }
      }
    }
    metrics.inputBytes = file.size;
    progress(phase);
  } finally {
    await reader.cancel().catch(() => {});
    codecModule._free(outputPointer);
    codecModule._free(inputPointer);
    codecModule._within_bzip2_destroy(handle);
  }
}

function nextByobBuffer(
  value: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  return value.buffer.byteLength >= INPUT_BUFFER_BYTES
    ? new Uint8Array(value.buffer, 0, INPUT_BUFFER_BYTES)
    : new Uint8Array(INPUT_BUFFER_BYTES);
}

function bzip2Error(code: number): Error {
  const messages: Record<number, string> = {
    [-1]: "BZIP2 called the codec in an invalid sequence.",
    [-2]: "BZIP2 rejected an invalid codec parameter.",
    [-3]: "BZIP2 exhausted its fixed 8 MiB Wasm memory.",
    [-4]: "BZIP2 input is corrupt or failed its data checksum.",
    [-5]: "BZIP2 input has an invalid stream header.",
    [-6]: "BZIP2 reported an unexpected I/O error.",
    [-7]: "BZIP2 input is truncated before the stream end.",
    [-8]: "BZIP2 output buffer was too small.",
    [-9]: "The BZIP2 library configuration is unsupported.",
  };
  return new Error(messages[code] ?? `BZIP2 conversion failed with code ${code}.`);
}
