import type { ConversionMetrics } from "../lib/conversion-protocol";
import type { RandomAccessDestination } from "./random-access-destination";
import { recordWasmMemory } from "./wasm-metrics";

const MODULE_URL = "/engines/avif-encoder/within-avif-encoder.mjs";
const WASM_URL = "/engines/avif-encoder/within-avif-encoder.wasm";
const WASM_MEMORY_BYTES = 80 * 1024 * 1024;
const ANIMATION_MODULE_URL =
  "/engines/avif-encoder/within-avif-animation-encoder.mjs";
const ANIMATION_WASM_URL =
  "/engines/avif-encoder/within-avif-animation-encoder.wasm";
const ANIMATION_WASM_MEMORY_BYTES = 88 * 1024 * 1024;
const PIXEL_STRIP_LIMIT_BYTES = 256 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
const MAX_FRAMES = 1_000;
const MAX_IMAGE_PIXELS = 786_432;
const MAX_IMAGE_DIMENSION = 8_192;
const MAX_AGGREGATE_DECODED_BYTES = 64 * 1024 ** 3;
const MAX_EXPANSION_RATIO = 1_000;

interface WithinImageTrack {
  frameCount: number;
  repetitionCount?: number;
}

interface WithinImageDecoder {
  tracks: {
    ready: Promise<void>;
    selectedTrack: WithinImageTrack | null;
  };
  decode(options?: {
    frameIndex?: number;
    completeFramesOnly?: boolean;
  }): Promise<{ image: VideoFrame; complete: boolean }>;
  close(): void;
}

interface WithinImageDecoderConstructor {
  new (options: {
    type: string;
    data: ReadableStream<Uint8Array<ArrayBuffer>>;
    colorSpaceConversion?: "default" | "none";
    desiredWidth?: number;
    desiredHeight?: number;
    preferAnimation?: boolean;
  }): WithinImageDecoder;
  isTypeSupported?(type: string): Promise<boolean>;
}

interface AvifEncoderBridge {
  rows(destination: number, y: number, rows: number, width: number): number;
  write(offset: number, source: Uint8Array<ArrayBuffer>): Promise<number> | number;
  truncate(size: number): Promise<void> | void;
  flush(): Promise<void> | void;
  message(text: string): void;
}

interface AvifEncoderModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  ccall(
    name:
      | "within_avif_encoder_start"
      | "within_avif_encoder_add_frame"
      | "within_avif_encoder_finish",
    returnType: "number",
    argumentTypes: readonly "number"[],
    arguments_: readonly number[],
    options: { async: true },
  ): Promise<number>;
  _within_avif_encoder_destroy(): void;
  _within_avif_encoder_error(): number;
  _within_avif_encoder_output_bytes(): number;
  _within_avif_encoder_strip_bytes(): number;
  _within_avif_encoder_frame_bytes(): number;
  UTF8ToString(pointer: number, maximumBytesToRead?: number): string;
}

type AvifEncoderModuleFactory = (options: {
  withinBridge: AvifEncoderBridge;
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<AvifEncoderModule>;

export interface ImageToAvifOptions {
  file: File;
  inputMime: string;
  inputFormat: string;
  inputHeader: Uint8Array<ArrayBufferLike>;
  width: number;
  height: number;
  preferAnimation: boolean;
  writable: RandomAccessDestination;
  jobId: string;
  metrics: ConversionMetrics;
  startedAt: number;
  createInput(): ReadableStream<Uint8Array<ArrayBuffer>>;
  isCancelled(): boolean;
  emitProgress(
    jobId: string,
    phase: string,
    metrics: ConversionMetrics,
    startedAt: number,
    force?: boolean,
  ): void;
}

interface BmpLayout {
  pixelOffset: number;
  rowStride: number;
  sourceBytesPerPixel: 3 | 4;
  topDown: boolean;
}

function parseBmpLayout(
  header: Uint8Array<ArrayBufferLike>,
  fileSize: number,
  expectedWidth: number,
  expectedHeight: number,
): BmpLayout {
  if (header.byteLength < 54 || header[0] !== 0x42 || header[1] !== 0x4d) {
    throw new Error("The BMP header is truncated or invalid.");
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const dibBytes = view.getUint32(14, true);
  const width = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  const planes = view.getUint16(26, true);
  const bitsPerPixel = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  const height = Math.abs(signedHeight);
  if (
    dibBytes < 40 ||
    width !== expectedWidth ||
    height !== expectedHeight ||
    signedHeight === 0 ||
    planes !== 1 ||
    (bitsPerPixel !== 24 && bitsPerPixel !== 32) ||
    compression !== 0
  ) {
    throw new Error(
      "AVIF output supports uncompressed 24-bit and 32-bit Windows BMP sources.",
    );
  }
  const sourceBytesPerPixel = (bitsPerPixel / 8) as 3 | 4;
  const rowStride = Math.ceil((width * bitsPerPixel) / 32) * 4;
  const pixelEnd = pixelOffset + rowStride * height;
  if (
    pixelOffset < 14 + dibBytes ||
    !Number.isSafeInteger(pixelEnd) ||
    pixelEnd > fileSize ||
    rowStride > MAX_IMAGE_DIMENSION * 4
  ) {
    throw new Error("The BMP pixel layout exceeds the bounded source file.");
  }
  return { pixelOffset, rowStride, sourceBytesPerPixel, topDown: signedHeight < 0 };
}

async function decodeBmpRgb(
  options: ImageToAvifOptions,
  assertActive: () => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height, metrics, jobId, startedAt, emitProgress } = options;
  const layout = parseBmpLayout(
    options.inputHeader,
    options.file.size,
    width,
    height,
  );
  const output = new Uint8Array(width * height * 3);
  const row = new Uint8Array(layout.rowStride);
  const reader = options.createInput().getReader();
  let chunk: Uint8Array<ArrayBuffer> | null = null;
  let chunkOffset = 0;

  const readInto = async (destination: Uint8Array<ArrayBuffer>): Promise<void> => {
    let destinationOffset = 0;
    while (destinationOffset < destination.byteLength) {
      assertActive();
      if (!chunk || chunkOffset === chunk.byteLength) {
        const result = await reader.read();
        if (result.done || !result.value) {
          throw new Error("The BMP pixel rows end before the declared image size.");
        }
        chunk = result.value;
        chunkOffset = 0;
      }
      const length = Math.min(
        destination.byteLength - destinationOffset,
        chunk.byteLength - chunkOffset,
      );
      destination.set(chunk.subarray(chunkOffset, chunkOffset + length), destinationOffset);
      chunkOffset += length;
      destinationOffset += length;
    }
  };
  const skip = async (bytes: number): Promise<void> => {
    let remaining = bytes;
    while (remaining > 0) {
      assertActive();
      if (!chunk || chunkOffset === chunk.byteLength) {
        const result = await reader.read();
        if (result.done || !result.value) {
          throw new Error("The BMP pixel offset exceeds the bounded source file.");
        }
        chunk = result.value;
        chunkOffset = 0;
      }
      const length = Math.min(remaining, chunk.byteLength - chunkOffset);
      chunkOffset += length;
      remaining -= length;
    }
  };

  try {
    await skip(layout.pixelOffset);
    metrics.imageWorkingBytes = output.byteLength + row.byteLength;
    metrics.peakImageWorkingBytes = Math.max(
      metrics.peakImageWorkingBytes ?? 0,
      metrics.imageWorkingBytes,
    );
    for (let sourceRow = 0; sourceRow < height; sourceRow += 1) {
      await readInto(row);
      const destinationRow = layout.topDown ? sourceRow : height - 1 - sourceRow;
      let sourceOffset = 0;
      let destinationOffset = destinationRow * width * 3;
      for (let column = 0; column < width; column += 1) {
        output[destinationOffset] = row[sourceOffset + 2];
        output[destinationOffset + 1] = row[sourceOffset + 1];
        output[destinationOffset + 2] = row[sourceOffset];
        sourceOffset += layout.sourceBytesPerPixel;
        destinationOffset += 3;
      }
      if ((sourceRow & 63) === 63) {
        emitProgress(jobId, "Reading bounded BMP rows", metrics, startedAt);
      }
    }
    return output;
  } finally {
    chunk = null;
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function avifLoopCount(repetitionCount: number | undefined): number {
  if (repetitionCount === Number.POSITIVE_INFINITY) return 0;
  if (
    repetitionCount == null ||
    !Number.isInteger(repetitionCount) ||
    repetitionCount < 0 ||
    repetitionCount >= 0xffff_ffff
  ) {
    throw new Error("The source animation has an invalid AVIF loop count.");
  }
  return repetitionCount + 1;
}

function sourceMayHaveAlpha(
  inputFormat: string,
  header: Uint8Array<ArrayBufferLike>,
): boolean {
  if (inputFormat === "jpeg" || inputFormat === "bmp") return false;
  if (inputFormat === "png") {
    const colorType = header.byteLength > 25 ? header[25] : -1;
    if (colorType === 4 || colorType === 6) return true;
    if (colorType !== 3) return false;
    for (let offset = 8; offset + 12 <= header.byteLength;) {
      const view = new DataView(header.buffer, header.byteOffset + offset, 4);
      const length = view.getUint32(0, false);
      if (offset + length + 12 > header.byteLength) return true;
      const type = String.fromCharCode(
        header[offset + 4],
        header[offset + 5],
        header[offset + 6],
        header[offset + 7],
      );
      if (type === "tRNS") return true;
      if (type === "IDAT") return false;
      offset += length + 12;
    }
    return true;
  }
  if (inputFormat === "gif") {
    for (let offset = 13; offset + 7 < header.byteLength; offset += 1) {
      if (
        header[offset] === 0x21 &&
        header[offset + 1] === 0xf9 &&
        header[offset + 2] === 4 &&
        (header[offset + 3] & 1) !== 0
      ) return true;
    }
    return false;
  }
  if (inputFormat === "webp") {
    for (let offset = 12; offset + 8 <= header.byteLength;) {
      const type = String.fromCharCode(
        header[offset],
        header[offset + 1],
        header[offset + 2],
        header[offset + 3],
      );
      const view = new DataView(header.buffer, header.byteOffset + offset + 4, 4);
      const length = view.getUint32(0, true);
      if (type === "ALPH") return true;
      if (type === "VP8X" && length >= 1 && (header[offset + 8] & 0x10) !== 0) {
        return true;
      }
      if (type === "VP8L" && length >= 5 && (header[offset + 12] & 0x10) !== 0) {
        return true;
      }
      const next = offset + 8 + length + (length & 1);
      if (!Number.isSafeInteger(next) || next <= offset || next > header.byteLength) break;
      offset = next;
    }
    return false;
  }
  return true;
}

export async function runImageToAvif(options: ImageToAvifOptions): Promise<void> {
  const {
    file,
    inputMime,
    inputFormat,
    width,
    height,
    writable,
    jobId,
    metrics,
    startedAt,
    emitProgress,
  } = options;
  const Decoder = (
    globalThis as unknown as { ImageDecoder?: WithinImageDecoderConstructor }
  ).ImageDecoder;
  if (inputFormat !== "bmp" && !Decoder) {
    throw new Error("This browser does not provide the ImageDecoder API required by AVIF output.");
  }
  if (
    inputFormat !== "bmp" &&
    Decoder?.isTypeSupported &&
    !(await Decoder.isTypeSupported(inputMime))
  ) {
    throw new Error(`This browser does not provide an ImageDecoder for ${inputMime}.`);
  }
  const assertActive = (): void => {
    if (options.isCancelled()) {
      throw new DOMException("Conversion cancelled", "AbortError");
    }
  };
  const errors: string[] = [];
  const message = (text: string): void => {
    const bounded = text.trim().slice(0, 512);
    if (!bounded) return;
    if (errors.length === 8) errors.shift();
    errors.push(bounded);
  };
  let decoder = inputFormat === "bmp"
    ? null
    : new Decoder!({
        type: inputMime,
        data: options.createInput(),
        // The same encoded image can be surfaced by Chromium as planar YUV or
        // packed RGB. Normalize both through its managed sRGB conversion before
        // copying RGBA; otherwise decoder-selected format/color metadata can
        // change the AV1 bitstream between identical runs.
        colorSpaceConversion: "default",
        desiredWidth: width,
        desiredHeight: height,
        preferAnimation: options.preferAnimation,
      });
  let frame: VideoFrame | null = null;
  let pixels: Uint8Array<ArrayBuffer> | null = null;
  let pixelStride = 4;
  let encoderModule: AvifEncoderModule | null = null;
  let firstDestinationWrite = true;
  let hasAlpha = sourceMayHaveAlpha(inputFormat, options.inputHeader);
  let firstFramePredecoded = false;

  const bridge: AvifEncoderBridge = {
    rows(destination, y, rowCount, requestedWidth) {
      assertActive();
      const destinationBytes = requestedWidth * rowCount * 4;
      if (
        !encoderModule ||
        !pixels ||
        requestedWidth !== width ||
        !Number.isSafeInteger(destination) ||
        !Number.isSafeInteger(y) ||
        !Number.isSafeInteger(rowCount) ||
        y < 0 ||
        rowCount < 1 ||
        y + rowCount > height ||
        destinationBytes > PIXEL_STRIP_LIMIT_BYTES ||
        destination < 0 ||
        destination + destinationBytes > encoderModule.HEAPU8.byteLength
      ) {
        throw new Error("AVIF requested an invalid bounded pixel strip.");
      }
      let outputOffset = destination;
      if (pixelStride === 4) {
        const sourceOffset = y * width * 4;
        encoderModule.HEAPU8.set(
          pixels.subarray(sourceOffset, sourceOffset + destinationBytes),
          outputOffset,
        );
      } else {
        let sourceOffset = y * width * 3;
        const pixelCount = requestedWidth * rowCount;
        for (let index = 0; index < pixelCount; index += 1) {
          encoderModule.HEAPU8[outputOffset] = pixels[sourceOffset];
          encoderModule.HEAPU8[outputOffset + 1] = pixels[sourceOffset + 1];
          encoderModule.HEAPU8[outputOffset + 2] = pixels[sourceOffset + 2];
          encoderModule.HEAPU8[outputOffset + 3] = 255;
          sourceOffset += 3;
          outputOffset += 4;
        }
      }
      metrics.imageWorkingBytes = pixels.byteLength + destinationBytes;
      metrics.peakImageWorkingBytes = Math.max(
        metrics.peakImageWorkingBytes ?? 0,
        metrics.imageWorkingBytes,
      );
      return destinationBytes;
    },
    write(offset, source) {
      assertActive();
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        source.byteLength < 1 ||
        source.byteLength > OUTPUT_BUFFER_BYTES ||
        offset + source.byteLength > MAX_OUTPUT_BYTES
      ) {
        throw new Error("AVIF requested an invalid bounded seekable output write.");
      }
      const complete = (): number => {
        metrics.outputBytes = Math.max(metrics.outputBytes, offset + source.byteLength);
        metrics.maxWriteChunkBytes = Math.max(metrics.maxWriteChunkBytes, source.byteLength);
        metrics.queuedBytes = 0;
        metrics.pendingOperations = 0;
        emitProgress(jobId, "Writing AVIF", metrics, startedAt);
        return source.byteLength;
      };
      const execute = (): Promise<number> | number => {
        metrics.queuedBytes = source.byteLength;
        metrics.peakQueuedBytes = Math.max(metrics.peakQueuedBytes, source.byteLength);
        metrics.pendingOperations = 1;
        metrics.peakPendingOperations = Math.max(metrics.peakPendingOperations, 1);
        const fail = (error: unknown): never => {
          metrics.queuedBytes = 0;
          metrics.pendingOperations = 0;
          throw error;
        };
        const operation = { type: "write" as const, position: offset, data: source };
        try {
          if (writable.writeSync?.(operation)) return complete();
          return writable.write(operation).then(complete, fail);
        } catch (error) {
          return fail(error);
        }
      };
      if (firstDestinationWrite) {
        firstDestinationWrite = false;
        return new Promise<void>((resolve) => setTimeout(resolve, 0)).then(execute);
      }
      return execute();
    },
    truncate(size) {
      assertActive();
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_OUTPUT_BYTES) {
        throw new Error("AVIF requested an invalid final output size.");
      }
      if (writable.truncateSync) {
        writable.truncateSync(size);
        metrics.outputBytes = size;
        return;
      }
      return writable.truncate(size).then(() => {
        metrics.outputBytes = size;
      });
    },
    flush() {
      assertActive();
      if (writable.flushSync) {
        writable.flushSync();
        return;
      }
      return writable.flush?.();
    },
    message,
  };

  metrics.activeWorkerCount = 1 + (writable.additionalWorkerCount ?? 0);
  metrics.sharedArrayBufferBytes = writable.sharedBufferBytes ?? 0;
  try {
    await decoder?.tracks.ready;
    assertActive();
    const track = inputFormat === "bmp"
      ? { frameCount: 1, repetitionCount: 0 }
      : decoder?.tracks.selectedTrack;
    if (!track) throw new Error("The browser could not identify a decodable image track.");
    if (
      !Number.isSafeInteger(track.frameCount) ||
      track.frameCount < 1 ||
      track.frameCount > MAX_FRAMES ||
      width < 1 ||
      height < 1 ||
      width > MAX_IMAGE_DIMENSION ||
      height > MAX_IMAGE_DIMENSION ||
      width * height > MAX_IMAGE_PIXELS
    ) {
      throw new Error("AVIF source dimensions or frame count exceed the bounded limits.");
    }
    const aggregateDecodedBytes = width * height * 4 * track.frameCount;
    if (
      !Number.isSafeInteger(aggregateDecodedBytes) ||
      aggregateDecodedBytes > MAX_AGGREGATE_DECODED_BYTES ||
      aggregateDecodedBytes / Math.max(1, file.size) > MAX_EXPANSION_RATIO
    ) {
      throw new Error(
        "AVIF animation exceeds the 64 GiB or 1,000:1 aggregate decoded safety limit.",
      );
    }
    const animated = track.frameCount > 1;
    const loops = animated ? avifLoopCount(track.repetitionCount) : 0;
    if (!animated && inputFormat !== "bmp") {
      const decoded = await decoder!.decode({
        frameIndex: 0,
        completeFramesOnly: true,
      });
      if (!decoded.complete) {
        decoded.image.close();
        throw new Error("The browser returned an incomplete first AVIF source frame.");
      }
      frame = decoded.image;
      if (frame.displayWidth !== width || frame.displayHeight !== height) {
        throw new Error("The first AVIF source frame changed the declared dimensions.");
      }
      metrics.imageFrameFormat = frame.format;
      metrics.imageColorSpace = {
        primaries: frame.colorSpace.primaries,
        transfer: frame.colorSpace.transfer,
        matrix: frame.colorSpace.matrix,
        fullRange: frame.colorSpace.fullRange,
      };
      pixels = new Uint8Array(width * height * 4);
      await frame.copyTo(pixels, {
        format: "RGBA",
        layout: [{ offset: 0, stride: width * 4 }],
      });
      frame.close();
      frame = null;
      if (hasAlpha) {
        hasAlpha = false;
        for (let offset = 3; offset < pixels.byteLength; offset += 4) {
          if (pixels[offset] !== 255) {
            hasAlpha = true;
            break;
          }
        }
      }
      firstFramePredecoded = true;
      metrics.imageWorkingBytes = pixels.byteLength;
      metrics.peakImageWorkingBytes = Math.max(
        metrics.peakImageWorkingBytes ?? 0,
        pixels.byteLength,
      );
      decoder!.close();
      decoder = null;
    }
    const selectedModuleUrl = animated ? ANIMATION_MODULE_URL : MODULE_URL;
    const selectedWasmUrl = animated ? ANIMATION_WASM_URL : WASM_URL;
    const selectedWasmMemoryBytes = animated
      ? ANIMATION_WASM_MEMORY_BYTES
      : WASM_MEMORY_BYTES;
    const imported = (await import(/* @vite-ignore */ selectedModuleUrl)) as {
      default: AvifEncoderModuleFactory;
    };
    encoderModule = await imported.default({
      withinBridge: bridge,
      locateFile: (name) => (name.endsWith(".wasm") ? selectedWasmUrl : name),
      print: () => {},
      printErr: message,
    });
    if (encoderModule.HEAPU8.buffer.byteLength !== selectedWasmMemoryBytes) {
      throw new Error(
        `AVIF encoder loaded ${encoderModule.HEAPU8.buffer.byteLength} bytes of Wasm memory; expected ${selectedWasmMemoryBytes}.`,
      );
    }
    recordWasmMemory(metrics, "libaom-avif-encoder", selectedWasmMemoryBytes);
    emitProgress(jobId, "Starting bounded AVIF encoder", metrics, startedAt, true);
    const startResult = await encoderModule.ccall(
      "within_avif_encoder_start",
      "number",
      ["number", "number", "number", "number", "number"],
      [width, height, hasAlpha ? 1 : 0, animated ? 1 : 0, loops],
      { async: true },
    );
    assertActive();
    if (startResult !== 0) {
      throw new Error(encoderModule.UTF8ToString(encoderModule._within_avif_encoder_error(), 1024));
    }
    let expectedTimestamp: number | null = null;
    for (let index = 0; index < track.frameCount; index += 1) {
      assertActive();
      emitProgress(
        jobId,
        `Decoding AVIF frame ${index + 1} of ${track.frameCount}`,
        metrics,
        startedAt,
        true,
      );
      let duration = 0;
      if (inputFormat === "bmp") {
        pixels = await decodeBmpRgb(options, assertActive);
        pixelStride = 3;
        metrics.imageFrameFormat = "RGB";
        metrics.imageColorSpace = {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "rgb",
          fullRange: true,
        };
      } else if (!(index === 0 && firstFramePredecoded)) {
        const decoded = await decoder!.decode({ frameIndex: index, completeFramesOnly: true });
        if (!decoded.complete) {
          decoded.image.close();
          throw new Error(`The browser returned an incomplete frame at index ${index}.`);
        }
        frame = decoded.image;
        if (frame.displayWidth !== width || frame.displayHeight !== height) {
          throw new Error(`AVIF frame ${index + 1} changed the declared dimensions.`);
        }
      }
      if (animated && frame) {
        if (
          frame.duration == null ||
          !Number.isSafeInteger(frame.duration) ||
          frame.duration < 1 ||
          frame.duration > 0xffff_ffff
        ) {
          throw new Error(`AVIF frame ${index + 1} has an unrepresentable duration.`);
        }
        if (expectedTimestamp != null && Math.abs(frame.timestamp - expectedTimestamp) > 1) {
          throw new Error("The source animation contains a timestamp gap.");
        }
        duration = frame.duration;
        expectedTimestamp = frame.timestamp + duration;
      }
      if (frame) {
        metrics.imageFrameFormat = frame.format;
        metrics.imageColorSpace = {
          primaries: frame.colorSpace.primaries,
          transfer: frame.colorSpace.transfer,
          matrix: frame.colorSpace.matrix,
          fullRange: frame.colorSpace.fullRange,
        };
        if (!pixels || pixels.byteLength !== width * height * 4 || pixelStride !== 4) {
          pixels = new Uint8Array(width * height * 4);
          pixelStride = 4;
        }
        await frame.copyTo(pixels, {
          format: "RGBA",
          layout: [{ offset: 0, stride: width * 4 }],
        });
        frame.close();
        frame = null;
      }
      if (!pixels) throw new Error(`AVIF frame ${index + 1} did not produce bounded pixels.`);
      metrics.imageWorkingBytes = pixels.byteLength;
      metrics.peakImageWorkingBytes = Math.max(
        metrics.peakImageWorkingBytes ?? 0,
        pixels.byteLength,
      );
      emitProgress(
        jobId,
        `Encoding AVIF frame ${index + 1} of ${track.frameCount}`,
        metrics,
        startedAt,
        true,
      );
      const frameResult = await encoderModule.ccall(
        "within_avif_encoder_add_frame",
        "number",
        ["number"],
        [duration],
        { async: true },
      );
      assertActive();
      if (frameResult !== 0) {
        throw new Error(
          [
            encoderModule.UTF8ToString(encoderModule._within_avif_encoder_error(), 1024),
            ...errors,
          ].filter(Boolean).join(" | "),
        );
      }
      if (index === track.frameCount - 1) {
        pixels = null;
        metrics.imageWorkingBytes = 0;
      } else {
        metrics.imageWorkingBytes = pixels.byteLength;
      }
    }
    const finishResult = await encoderModule.ccall(
      "within_avif_encoder_finish",
      "number",
      [],
      [],
      { async: true },
    );
    assertActive();
    if (finishResult !== 0) {
      throw new Error(
        [
          encoderModule.UTF8ToString(encoderModule._within_avif_encoder_error(), 1024),
          ...errors,
        ].filter(Boolean).join(" | "),
      );
    }
    const nativeOutputBytes = encoderModule._within_avif_encoder_output_bytes();
    const frameBytes = encoderModule._within_avif_encoder_frame_bytes();
    const stripBytes = encoderModule._within_avif_encoder_strip_bytes();
    metrics.codecWorkingBytes = 0;
    metrics.peakCodecWorkingBytes = frameBytes;
    metrics.maxImagePixelStripBytes = stripBytes;
    if (
      nativeOutputBytes !== metrics.outputBytes ||
      stripBytes > PIXEL_STRIP_LIMIT_BYTES ||
      frameBytes > MAX_IMAGE_PIXELS * 2.5
    ) {
      throw new Error("AVIF encoder returned inconsistent bounded-memory metrics.");
    }
    metrics.inputBytes = file.size;
    metrics.imageWorkingBytes = 0;
    emitProgress(
      jobId,
      animated ? "Encoded every AVIF animation frame" : "Encoded bounded AVIF",
      metrics,
      startedAt,
      true,
    );
  } finally {
    pixels = null;
    metrics.imageWorkingBytes = 0;
    metrics.codecWorkingBytes = 0;
    frame?.close();
    decoder?.close();
    encoderModule?._within_avif_encoder_destroy();
  }
}
