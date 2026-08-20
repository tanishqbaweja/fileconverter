import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import {
  createZipDataDescriptor,
  createZipLocalHeader,
  ensureZip32,
  finishZip,
  unixToDos,
  updateCrc32,
  type WrittenZipEntry,
} from "./archive-conversion";
import type { RandomAccessDestination } from "./random-access-destination";
import { recordWasmMemory } from "./wasm-metrics";

const MODULE_URL = "/engines/jxl/within-jxl.mjs";
const WASM_URL = "/engines/jxl/within-jxl.wasm";
const INPUT_BUFFER_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_FRAME_OUTPUT_BYTES = 96 * 1024 * 1024;
const WASM_MEMORY_BYTES = 112 * 1024 * 1024;
const DECODER_ALLOCATION_LIMIT_BYTES = 102 * 1024 * 1024;
const MAX_FRAMES = 1_000;
const MAX_AGGREGATE_DECODED_BYTES = 64 * 1024 ** 3;
const MAX_EXPANSION_RATIO = 1_000;

interface JxlBridge {
  read(offset: number, destination: Uint8Array): Promise<number> | number;
  write(offset: number, source: Uint8Array<ArrayBuffer>): Promise<number> | number;
  frameStart(
    index: number,
    duration: number,
    timecode: number,
    isLast: number,
    width: number,
    height: number,
    bits: number,
    channels: number,
    ticksPerSecondNumerator: number,
    ticksPerSecondDenominator: number,
    numLoops: number,
    haveTimecodes: number,
  ): Promise<number> | number;
  frameEnd(index: number): Promise<number> | number;
  message(text: string): void;
}

interface JxlModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  ccall(
    name: "within_jxl_to_png" | "within_jxl_to_png_frames",
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
  _within_jxl_frame_count(): number;
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

interface JxlFrameRecord {
  file: string;
  index: number;
  width: number;
  height: number;
  bitsPerSample: number;
  channels: number;
  decodedBytes: number;
  timestampMicros: number;
  durationMicros: number;
  durationTicks: number;
  timecode: number | null;
  isLast: boolean;
}

interface ActiveZipFrame {
  nameBytes: Uint8Array<ArrayBuffer>;
  localHeaderOffset: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc: number;
  size: number;
  record: JxlFrameRecord;
}

interface JxlAnimationMetadata {
  width: number;
  height: number;
  bitsPerSample: number;
  channels: number;
  ticksPerSecondNumerator: number;
  ticksPerSecondDenominator: number;
  numLoops: number;
  haveTimecodes: boolean;
}

export async function runJxlToPng(options: JxlConversionOptions): Promise<void> {
  await runJxlConversion(options, false);
}

export async function runJxlToZip(options: JxlConversionOptions): Promise<void> {
  await runJxlConversion(options, true);
}

function ticksToMicros(
  ticks: number,
  ticksPerSecondNumerator: number,
  ticksPerSecondDenominator: number,
): number {
  const numerator = BigInt(ticksPerSecondNumerator);
  const scaled =
    BigInt(ticks) * BigInt(ticksPerSecondDenominator) * BigInt(1_000_000);
  const rounded = (scaled + numerator / BigInt(2)) / numerator;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("JPEG XL frame duration exceeds the safe timing range.");
  }
  return Number(rounded);
}

async function runJxlConversion(
  options: JxlConversionOptions,
  archiveFrames: boolean,
): Promise<void> {
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
  let firstDestinationWrite = true;
  let activeZipFrame: ActiveZipFrame | null = null;
  let animationMetadata: JxlAnimationMetadata | null = null;
  let aggregateDecodedBytes = 0;
  let nextTimestampMicros = 0;
  const entries: WrittenZipEntry[] = [];
  const frames: JxlFrameRecord[] = [];

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
  const writeDestination = (
    position: number,
    source: Uint8Array<ArrayBuffer>,
    phase: string,
  ): Promise<number> | number => {
    assertActive();
    if (
      !Number.isSafeInteger(position) ||
      position < 0 ||
      source.byteLength > OUTPUT_BUFFER_BYTES
    ) {
      throw new Error("JPEG XL route requested an invalid bounded destination write.");
    }
    const complete = (): number => {
      metrics.outputBytes = Math.max(
        metrics.outputBytes,
        position + source.byteLength,
      );
      metrics.maxWriteChunkBytes = Math.max(
        metrics.maxWriteChunkBytes,
        source.byteLength,
      );
      metrics.queuedBytes = 0;
      metrics.pendingOperations = 0;
      emitProgress(jobId, phase, metrics, startedAt);
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
          position,
          data: source,
        })
      ) {
        return complete();
      }
      return writable
        .write({ type: "write", position, data: source })
        .then(complete);
    };
    if (firstDestinationWrite) {
      firstDestinationWrite = false;
      return new Promise<void>((resolve) => setTimeout(resolve, 0)).then(execute);
    }
    return execute();
  };
  const appendDestination = async (
    source: Uint8Array<ArrayBuffer>,
    phase: string,
  ): Promise<void> => {
    ensureZip32(metrics.outputBytes + source.byteLength, "JPEG XL ZIP output size");
    await writeDestination(metrics.outputBytes, source, phase);
  };
  const writeStoredManifest = async (
    name: string,
    source: Uint8Array<ArrayBuffer>,
  ): Promise<void> => {
    const nameBytes = new TextEncoder().encode(name);
    const flags = 0x0808;
    const method = 0;
    const { dosTime, dosDate } = unixToDos(0);
    const localHeaderOffset = metrics.outputBytes;
    await appendDestination(
      createZipLocalHeader(nameBytes, flags, method, dosTime, dosDate),
      "Writing JPEG XL manifest header",
    );
    let crc = 0xffff_ffff;
    for (let offset = 0; offset < source.byteLength; offset += OUTPUT_BUFFER_BYTES) {
      const chunk = source.slice(
        offset,
        Math.min(offset + OUTPUT_BUFFER_BYTES, source.byteLength),
      );
      crc = updateCrc32(crc, chunk);
      await appendDestination(chunk, "Writing JPEG XL animation manifest");
    }
    const finalCrc = (crc ^ 0xffff_ffff) >>> 0;
    await appendDestination(
      createZipDataDescriptor(finalCrc, source.byteLength, source.byteLength),
      "Writing JPEG XL manifest descriptor",
    );
    entries.push({
      nameBytes,
      directory: false,
      method,
      flags,
      dosTime,
      dosDate,
      crc32: finalCrc,
      compressedSize: source.byteLength,
      uncompressedSize: source.byteLength,
      localHeaderOffset,
    });
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
        offset < 0 ||
        source.byteLength > OUTPUT_BUFFER_BYTES ||
        offset + source.byteLength > MAX_FRAME_OUTPUT_BYTES
      ) {
        throw new Error("JPEG XL engine requested an invalid bounded PNG write.");
      }
      if (!archiveFrames) {
        if (offset !== metrics.outputBytes) {
          throw new Error("JPEG XL engine emitted a non-sequential PNG write.");
        }
        return writeDestination(offset, source, "Writing PNG");
      }
      if (!activeZipFrame || offset !== activeZipFrame.size) {
        throw new Error(
          "JPEG XL engine emitted a non-sequential animation frame write.",
        );
      }
      activeZipFrame.crc = updateCrc32(activeZipFrame.crc, source);
      activeZipFrame.size += source.byteLength;
      ensureZip32(activeZipFrame.size, "JPEG XL frame size");
      return writeDestination(
        metrics.outputBytes,
        source,
        `Writing JPEG XL frame ${activeZipFrame.record.index + 1}`,
      );
    },
    async frameStart(
      index,
      duration,
      timecode,
      isLast,
      width,
      height,
      bits,
      channels,
      ticksPerSecondNumerator,
      ticksPerSecondDenominator,
      numLoops,
      haveTimecodes,
    ) {
      assertActive();
      if (!archiveFrames) return -1;
      if (
        activeZipFrame ||
        index !== frames.length ||
        index < 0 ||
        index >= MAX_FRAMES ||
        !Number.isSafeInteger(duration) ||
        duration < 0 ||
        !Number.isSafeInteger(timecode) ||
        timecode < 0 ||
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1 ||
        (bits !== 8 && bits !== 16) ||
        channels < 1 ||
        channels > 4 ||
        !Number.isSafeInteger(ticksPerSecondNumerator) ||
        !Number.isSafeInteger(ticksPerSecondDenominator) ||
        ticksPerSecondNumerator < 1 ||
        ticksPerSecondDenominator < 1 ||
        !Number.isSafeInteger(numLoops) ||
        numLoops < 0
      ) {
        throw new Error("JPEG XL engine returned invalid bounded frame metadata.");
      }
      const metadata: JxlAnimationMetadata = {
        width,
        height,
        bitsPerSample: bits,
        channels,
        ticksPerSecondNumerator,
        ticksPerSecondDenominator,
        numLoops,
        haveTimecodes: haveTimecodes !== 0,
      };
      if (animationMetadata) {
        if (JSON.stringify(animationMetadata) !== JSON.stringify(metadata)) {
          throw new Error("JPEG XL frame metadata changed within one animation.");
        }
      } else {
        animationMetadata = metadata;
      }
      const decodedBytes = width * height * channels * (bits / 8);
      if (!Number.isSafeInteger(decodedBytes) || decodedBytes < 1) {
        throw new Error("JPEG XL frame decoded size is outside the safe range.");
      }
      aggregateDecodedBytes += decodedBytes;
      if (
        aggregateDecodedBytes > MAX_AGGREGATE_DECODED_BYTES ||
        aggregateDecodedBytes / Math.max(1, file.size) > MAX_EXPANSION_RATIO
      ) {
        throw new Error(
          "JPEG XL animation exceeds the 64 GiB or 1,000:1 aggregate decoded safety limit.",
        );
      }
      const durationMicros = ticksToMicros(
        duration,
        ticksPerSecondNumerator,
        ticksPerSecondDenominator,
      );
      if (nextTimestampMicros > Number.MAX_SAFE_INTEGER - durationMicros) {
        throw new Error("JPEG XL animation duration exceeds the safe timing range.");
      }
      const frameName = `frame-${String(index + 1).padStart(4, "0")}.png`;
      const nameBytes = new TextEncoder().encode(frameName);
      const flags = 0x0808;
      const method = 0;
      const { dosTime, dosDate } = unixToDos(0);
      const localHeaderOffset = metrics.outputBytes;
      ensureZip32(localHeaderOffset, "JPEG XL ZIP local-header offset");
      activeZipFrame = {
        nameBytes,
        localHeaderOffset,
        flags,
        method,
        dosTime,
        dosDate,
        crc: 0xffff_ffff,
        size: 0,
        record: {
          file: frameName,
          index,
          width,
          height,
          bitsPerSample: bits,
          channels,
          decodedBytes,
          timestampMicros: nextTimestampMicros,
          durationMicros,
          durationTicks: duration,
          timecode: haveTimecodes !== 0 ? timecode : null,
          isLast: isLast !== 0,
        },
      };
      await appendDestination(
        createZipLocalHeader(nameBytes, flags, method, dosTime, dosDate),
        "Writing JPEG XL frame header",
      );
      emitProgress(
        jobId,
        `Decoding JPEG XL frame ${index + 1}`,
        metrics,
        startedAt,
        true,
      );
      return 0;
    },
    async frameEnd(index) {
      assertActive();
      if (
        !activeZipFrame ||
        index !== activeZipFrame.record.index ||
        activeZipFrame.size < 1
      ) {
        throw new Error("JPEG XL engine finalized an invalid animation frame.");
      }
      const finalCrc = (activeZipFrame.crc ^ 0xffff_ffff) >>> 0;
      await appendDestination(
        createZipDataDescriptor(
          finalCrc,
          activeZipFrame.size,
          activeZipFrame.size,
        ),
        "Writing JPEG XL frame descriptor",
      );
      entries.push({
        nameBytes: activeZipFrame.nameBytes,
        directory: false,
        method: activeZipFrame.method,
        flags: activeZipFrame.flags,
        dosTime: activeZipFrame.dosTime,
        dosDate: activeZipFrame.dosDate,
        crc32: finalCrc,
        compressedSize: activeZipFrame.size,
        uncompressedSize: activeZipFrame.size,
        localHeaderOffset: activeZipFrame.localHeaderOffset,
      });
      frames.push(activeZipFrame.record);
      nextTimestampMicros += activeZipFrame.record.durationMicros;
      activeZipFrame = null;
      return 0;
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
      archiveFrames ? "within_jxl_to_png_frames" : "within_jxl_to_png",
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
    const frameCount = jxlModule._within_jxl_frame_count();
    const decoderPeak = jxlModule._within_jxl_peak_decoder_allocation();
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      (bits !== 8 && bits !== 16) ||
      channels < 1 ||
      channels > 4 ||
      frameCount < 1 ||
      frameCount > MAX_FRAMES ||
      decoderPeak > DECODER_ALLOCATION_LIMIT_BYTES
    ) {
      throw new Error("JPEG XL engine returned invalid bounded-decoder metadata.");
    }
    if (archiveFrames) {
      const finalAnimationMetadata = animationMetadata as unknown as
        | JxlAnimationMetadata
        | null;
      if (
        activeZipFrame ||
        !finalAnimationMetadata ||
        frames.length !== frameCount ||
        entries.length !== frameCount
      ) {
        throw new Error("JPEG XL engine returned an incomplete animation frame set.");
      }
      const manifest = new TextEncoder().encode(
        `${JSON.stringify(
          {
            schema: "within-animation-frames-v1",
            sourceFormat: "jxl",
            frameCount,
            repetitionCount:
              finalAnimationMetadata.numLoops === 0
                ? "infinite"
                : Math.max(0, finalAnimationMetadata.numLoops - 1),
            jpegXlLoopCount:
              finalAnimationMetadata.numLoops === 0
                ? "infinite"
                : finalAnimationMetadata.numLoops,
            ticksPerSecond: {
              numerator: finalAnimationMetadata.ticksPerSecondNumerator,
              denominator: finalAnimationMetadata.ticksPerSecondDenominator,
            },
            haveTimecodes: finalAnimationMetadata.haveTimecodes,
            aggregateDecodedBytes,
            frames,
          },
          null,
          2,
        )}\n`,
      );
      await writeStoredManifest("animation.json", manifest);
      await finishZip(
        {
          file,
          metrics,
          assertActive,
          progress: (phase) => emitProgress(jobId, phase, metrics, startedAt),
          write: (chunk, phase) => appendDestination(chunk, phase),
        },
        entries,
      );
    } else if (jxlModule._within_jxl_has_animation() !== 0) {
      options.post({
        type: "warning",
        jobId,
        message:
          "This JPEG XL contains animation; only its first fully rendered frame was converted.",
      });
    }
    if (metrics.outputBytes < 1) {
      throw new Error("JPEG XL engine completed without producing output.");
    }
    metrics.inputBytes = file.size;
    await writable.flush?.();
    emitProgress(
      jobId,
      archiveFrames
        ? "Archived every JPEG XL animation frame"
        : "Converted JPEG XL to PNG",
      metrics,
      startedAt,
      true,
    );
  } finally {
    metrics.queuedBytes = 0;
    metrics.pendingOperations = 0;
    const activeReader = reader as ReadableStreamBYOBReader | null;
    await activeReader?.cancel("JPEG XL conversion finished").catch(() => {});
  }
}
