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

const MODULE_URL = "/engines/avif/within-avif.mjs";
const WASM_URL = "/engines/avif/within-avif.wasm";
const INPUT_BUFFER_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_FRAME_OUTPUT_BYTES = 96 * 1024 * 1024;
const WASM_MEMORY_BYTES = 40 * 1024 * 1024;
const MAX_FRAMES = 1_000;
const MAX_AGGREGATE_DECODED_BYTES = 64 * 1024 ** 3;
const MAX_EXPANSION_RATIO = 1_000;

interface AvifBridge {
  read(offset: number, destination: Uint8Array): Promise<number> | number;
  write(offset: number, source: Uint8Array<ArrayBuffer>): Promise<number> | number;
  frameStart(
    index: number,
    width: number,
    height: number,
    depth: number,
    channels: number,
    frameCount: number,
    repetitionCount: number,
    timescale: number,
    pts: number,
    duration: number,
  ): Promise<number> | number;
  frameEnd(index: number, outputSize: number): Promise<number> | number;
  message(text: string): void;
}

interface AvifModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  ccall(
    name: "within_avif_to_png_frames",
    returnType: "number",
    argumentTypes: readonly "number"[],
    arguments_: readonly number[],
    options: { async: true },
  ): Promise<number>;
  _within_avif_error(): number;
  _within_avif_width(): number;
  _within_avif_height(): number;
  _within_avif_depth(): number;
  _within_avif_channels(): number;
  _within_avif_frame_count(): number;
  UTF8ToString(pointer: number, maximumBytesToRead?: number): string;
}

type AvifModuleFactory = (options: {
  withinBridge: AvifBridge;
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<AvifModule>;

export interface AvifConversionOptions {
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

interface AvifFrameRecord {
  file: string;
  index: number;
  width: number;
  height: number;
  bitsPerSample: number;
  channels: number;
  decodedBytes: number;
  timestampMicros: number;
  durationMicros: number;
  ptsInTimescales: number;
  durationInTimescales: number;
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
  record: AvifFrameRecord;
}

interface AvifAnimationMetadata {
  width: number;
  height: number;
  depth: number;
  channels: number;
  frameCount: number;
  repetitionCount: number;
  timescale: number;
}

function scaledMicros(value: number, timescale: number): number {
  const scaled = (BigInt(value) * BigInt(1_000_000) + BigInt(timescale) / BigInt(2)) /
    BigInt(timescale);
  if (scaled < BigInt(0) || scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("AVIF frame timing exceeds the safe integer range.");
  }
  return Number(scaled);
}

export async function runAvifToZip(options: AvifConversionOptions): Promise<void> {
  const { file, writable, jobId, metrics, startedAt, emitProgress } = options;
  if (file.size < 2 || file.size > MAX_INPUT_BYTES) {
    throw new Error("AVIF input must be between 2 bytes and 64 MiB.");
  }
  const errors: string[] = [];
  const synchronousReader =
    typeof FileReaderSync === "function" ? new FileReaderSync() : null;
  let reader: ReadableStreamBYOBReader | null = null;
  let readerPosition = -1;
  let readBuffer = new Uint8Array(INPUT_BUFFER_BYTES);
  let firstDestinationWrite = true;
  let activeFrame: ActiveZipFrame | null = null;
  let metadata: AvifAnimationMetadata | null = null;
  let aggregateDecodedBytes = 0;
  const entries: WrittenZipEntry[] = [];
  const frames: AvifFrameRecord[] = [];

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
      throw new Error("AVIF route requested an invalid bounded destination write.");
    }
    const complete = (): number => {
      metrics.outputBytes = Math.max(metrics.outputBytes, position + source.byteLength);
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
      metrics.peakQueuedBytes = Math.max(metrics.peakQueuedBytes, source.byteLength);
      metrics.pendingOperations = 1;
      metrics.peakPendingOperations = Math.max(metrics.peakPendingOperations, 1);
      if (writable.writeSync?.({ type: "write", position, data: source })) {
        return complete();
      }
      return writable.write({ type: "write", position, data: source }).then(complete);
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
    ensureZip32(metrics.outputBytes + source.byteLength, "AVIF ZIP output size");
    await writeDestination(metrics.outputBytes, source, phase);
  };
  const writeManifest = async (source: Uint8Array<ArrayBuffer>): Promise<void> => {
    const nameBytes = new TextEncoder().encode("animation.json");
    const flags = 0x0808;
    const method = 0;
    const { dosTime, dosDate } = unixToDos(0);
    const localHeaderOffset = metrics.outputBytes;
    await appendDestination(
      createZipLocalHeader(nameBytes, flags, method, dosTime, dosDate),
      "Writing AVIF manifest header",
    );
    let crc = 0xffff_ffff;
    for (let offset = 0; offset < source.byteLength; offset += OUTPUT_BUFFER_BYTES) {
      const chunk = source.slice(
        offset,
        Math.min(offset + OUTPUT_BUFFER_BYTES, source.byteLength),
      );
      crc = updateCrc32(crc, chunk);
      await appendDestination(chunk, "Writing AVIF animation manifest");
    }
    const finalCrc = (crc ^ 0xffff_ffff) >>> 0;
    await appendDestination(
      createZipDataDescriptor(finalCrc, source.byteLength, source.byteLength),
      "Writing AVIF manifest descriptor",
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

  const bridge: AvifBridge = {
    read(offset, destination) {
      assertActive();
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        destination.byteLength > INPUT_BUFFER_BYTES
      ) {
        throw new Error("AVIF engine requested an invalid bounded input read.");
      }
      const end = Math.min(file.size, offset + destination.byteLength);
      if (end <= offset) return 0;
      const record = (bytes: number): number => {
        metrics.inputBytes = Math.max(
          metrics.inputBytes,
          Math.min(file.size, offset + bytes),
        );
        metrics.maxReadChunkBytes = Math.max(metrics.maxReadChunkBytes, bytes);
        emitProgress(jobId, "Decoding AVIF", metrics, startedAt);
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
          await reader?.cancel("AVIF input seek");
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
        !activeFrame ||
        !Number.isSafeInteger(offset) ||
        offset !== activeFrame.size ||
        source.byteLength > OUTPUT_BUFFER_BYTES ||
        offset + source.byteLength > MAX_FRAME_OUTPUT_BYTES
      ) {
        throw new Error("AVIF engine emitted an invalid bounded PNG write.");
      }
      activeFrame.crc = updateCrc32(activeFrame.crc, source);
      activeFrame.size += source.byteLength;
      ensureZip32(activeFrame.size, "AVIF frame size");
      return writeDestination(
        metrics.outputBytes,
        source,
        `Writing AVIF frame ${activeFrame.record.index + 1}`,
      );
    },
    async frameStart(
      index,
      width,
      height,
      depth,
      channels,
      frameCount,
      repetitionCount,
      timescale,
      pts,
      duration,
    ) {
      assertActive();
      if (
        activeFrame ||
        index !== frames.length ||
        index < 0 ||
        index >= MAX_FRAMES ||
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1 ||
        (depth !== 8 && depth !== 16) ||
        (channels !== 3 && channels !== 4) ||
        !Number.isSafeInteger(frameCount) ||
        frameCount < 1 ||
        frameCount > MAX_FRAMES ||
        !Number.isSafeInteger(repetitionCount) ||
        !Number.isSafeInteger(timescale) ||
        timescale < 1 ||
        !Number.isSafeInteger(pts) ||
        pts < 0 ||
        !Number.isSafeInteger(duration) ||
        duration < 1
      ) {
        throw new Error("AVIF engine returned invalid bounded frame metadata.");
      }
      const currentMetadata: AvifAnimationMetadata = {
        width,
        height,
        depth,
        channels,
        frameCount,
        repetitionCount,
        timescale,
      };
      if (metadata) {
        if (JSON.stringify(metadata) !== JSON.stringify(currentMetadata)) {
          throw new Error("AVIF frame metadata changed within one animation.");
        }
      } else {
        metadata = currentMetadata;
      }
      const decodedBytes = width * height * channels * (depth / 8);
      if (!Number.isSafeInteger(decodedBytes) || decodedBytes < 1) {
        throw new Error("AVIF frame decoded size is outside the safe range.");
      }
      aggregateDecodedBytes += decodedBytes;
      if (
        aggregateDecodedBytes > MAX_AGGREGATE_DECODED_BYTES ||
        aggregateDecodedBytes / Math.max(1, file.size) > MAX_EXPANSION_RATIO
      ) {
        throw new Error(
          "AVIF animation exceeds the 64 GiB or 1,000:1 decoded safety limit.",
        );
      }
      const frameName = `frame-${String(index + 1).padStart(4, "0")}.png`;
      const nameBytes = new TextEncoder().encode(frameName);
      const flags = 0x0808;
      const method = 0;
      const { dosTime, dosDate } = unixToDos(0);
      const localHeaderOffset = metrics.outputBytes;
      activeFrame = {
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
          bitsPerSample: depth,
          channels,
          decodedBytes,
          timestampMicros: scaledMicros(pts, timescale),
          durationMicros: scaledMicros(duration, timescale),
          ptsInTimescales: pts,
          durationInTimescales: duration,
        },
      };
      await appendDestination(
        createZipLocalHeader(nameBytes, flags, method, dosTime, dosDate),
        "Writing AVIF frame header",
      );
      emitProgress(
        jobId,
        `Decoding AVIF frame ${index + 1} of ${frameCount}`,
        metrics,
        startedAt,
        true,
      );
      return 0;
    },
    async frameEnd(index, outputSize) {
      assertActive();
      if (
        !activeFrame ||
        index !== activeFrame.record.index ||
        activeFrame.size < 1 ||
        outputSize !== activeFrame.size
      ) {
        throw new Error("AVIF engine finalized an invalid animation frame.");
      }
      const finalCrc = (activeFrame.crc ^ 0xffff_ffff) >>> 0;
      await appendDestination(
        createZipDataDescriptor(finalCrc, activeFrame.size, activeFrame.size),
        "Writing AVIF frame descriptor",
      );
      entries.push({
        nameBytes: activeFrame.nameBytes,
        directory: false,
        method: activeFrame.method,
        flags: activeFrame.flags,
        dosTime: activeFrame.dosTime,
        dosDate: activeFrame.dosDate,
        crc32: finalCrc,
        compressedSize: activeFrame.size,
        uncompressedSize: activeFrame.size,
        localHeaderOffset: activeFrame.localHeaderOffset,
      });
      frames.push(activeFrame.record);
      activeFrame = null;
      return 0;
    },
    message,
  };

  metrics.activeWorkerCount = 1 + (writable.additionalWorkerCount ?? 0);
  metrics.sharedArrayBufferBytes = writable.sharedBufferBytes ?? 0;
  try {
    const imported = (await import(/* @vite-ignore */ MODULE_URL)) as {
      default: AvifModuleFactory;
    };
    const avifModule = await imported.default({
      withinBridge: bridge,
      locateFile: (name) => (name.endsWith(".wasm") ? WASM_URL : name),
      print: () => {},
      printErr: message,
    });
    assertActive();
    const wasmMemoryBytes = avifModule.HEAPU8.buffer.byteLength;
    if (wasmMemoryBytes !== WASM_MEMORY_BYTES) {
      throw new Error(
        `AVIF engine loaded ${wasmMemoryBytes} bytes of Wasm memory; expected ${WASM_MEMORY_BYTES}.`,
      );
    }
    recordWasmMemory(metrics, "libavif", wasmMemoryBytes);
    emitProgress(jobId, "Starting AVIF decoder", metrics, startedAt, true);
    const result = await avifModule.ccall(
      "within_avif_to_png_frames",
      "number",
      ["number"],
      [file.size],
      { async: true },
    );
    assertActive();
    if (result !== 0) {
      const nativeError = avifModule.UTF8ToString(
        avifModule._within_avif_error(),
        1024,
      );
      throw new Error(
        [nativeError, ...errors].filter(Boolean).join(" | ") ||
          `AVIF conversion failed with code ${result}.`,
      );
    }
    const width = avifModule._within_avif_width();
    const height = avifModule._within_avif_height();
    const depth = avifModule._within_avif_depth();
    const channels = avifModule._within_avif_channels();
    const frameCount = avifModule._within_avif_frame_count();
    const finalMetadata = metadata as AvifAnimationMetadata | null;
    if (
      !finalMetadata ||
      activeFrame ||
      width !== finalMetadata.width ||
      height !== finalMetadata.height ||
      depth !== finalMetadata.depth ||
      channels !== finalMetadata.channels ||
      frameCount !== finalMetadata.frameCount ||
      frames.length !== frameCount ||
      entries.length !== frameCount
    ) {
      throw new Error("AVIF engine returned an incomplete animation frame set.");
    }
    const repetitionCount =
      finalMetadata.repetitionCount === -1
        ? "infinite"
        : finalMetadata.repetitionCount === -2
          ? "unknown"
          : finalMetadata.repetitionCount;
    const manifest = new TextEncoder().encode(
      `${JSON.stringify(
        {
          schema: "within-animation-frames-v1",
          sourceFormat: "avif",
          frameCount,
          repetitionCount,
          timescale: finalMetadata.timescale,
          aggregateDecodedBytes,
          frames,
        },
        null,
        2,
      )}\n`,
    );
    await writeManifest(manifest);
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
    if (metrics.outputBytes < 1) {
      throw new Error("AVIF engine completed without producing output.");
    }
    metrics.inputBytes = file.size;
    await writable.flush?.();
    emitProgress(
      jobId,
      "Archived every AVIF animation frame",
      metrics,
      startedAt,
      true,
    );
  } finally {
    metrics.queuedBytes = 0;
    metrics.pendingOperations = 0;
    const activeReader = reader as ReadableStreamBYOBReader | null;
    await activeReader?.cancel("AVIF conversion finished").catch(() => {});
  }
}
