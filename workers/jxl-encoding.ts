import type { ConversionMetrics, WorkerResponse } from "../lib/conversion-protocol";
import type { RandomAccessDestination } from "./random-access-destination";
import { recordWasmMemory } from "./wasm-metrics";

const MODULE_URL = "/engines/jxl-encoder/within-jxl-encoder.mjs";
const WASM_URL = "/engines/jxl-encoder/within-jxl-encoder.wasm";
const WASM_MEMORY_BYTES = 56 * 1024 * 1024;
const ENCODER_ALLOCATION_LIMIT_BYTES = 44 * 1024 * 1024;
const PIXEL_CALLBACK_LIMIT_BYTES = 16 * 1024 * 1024;
const OUTPUT_BUFFER_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
const MAX_FRAMES = 1_000;
const MAX_IMAGE_PIXELS = 8_388_608;
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

interface JxlEncoderBridge {
  region(
    destination: number,
    x: number,
    y: number,
    width: number,
    height: number,
    channels: number,
  ): number;
  write(offset: number, source: Uint8Array<ArrayBuffer>): Promise<number> | number;
  message(text: string): void;
}

interface JxlEncoderModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  ccall(
    name:
      | "within_jxl_encoder_start"
      | "within_jxl_encoder_add_frame"
      | "within_jxl_encoder_finish",
    returnType: "number",
    argumentTypes: readonly "number"[],
    arguments_: readonly number[],
    options: { async: true },
  ): Promise<number>;
  _within_jxl_encoder_destroy(): void;
  _within_jxl_encoder_error(): number;
  _within_jxl_encoder_peak_allocation(): number;
  _within_jxl_encoder_peak_pixel_bytes(): number;
  _within_jxl_encoder_output_bytes(): number;
  UTF8ToString(pointer: number, maximumBytesToRead?: number): string;
}

type JxlEncoderModuleFactory = (options: {
  withinBridge: JxlEncoderBridge;
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<JxlEncoderModule>;

export interface ImageToJxlOptions {
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
  post(message: WorkerResponse): void;
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
      "JPEG XL output supports uncompressed 24-bit and 32-bit Windows BMP sources.",
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
  return {
    pixelOffset,
    rowStride,
    sourceBytesPerPixel,
    topDown: signedHeight < 0,
  };
}

async function decodeBmpRgb(
  options: ImageToJxlOptions,
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

function jxlLoopCount(repetitionCount: number | undefined): number {
  if (repetitionCount === Number.POSITIVE_INFINITY) return 0;
  if (
    repetitionCount == null ||
    !Number.isInteger(repetitionCount) ||
    repetitionCount < 0 ||
    repetitionCount >= 0xffff_ffff
  ) {
    throw new Error("The source animation has an invalid JPEG XL loop count.");
  }
  return repetitionCount + 1;
}

export async function runImageToJxl(options: ImageToJxlOptions): Promise<void> {
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
    throw new Error("This browser does not provide the ImageDecoder API required by JPEG XL output.");
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
  const decoder = inputFormat === "bmp"
    ? null
    : new Decoder!({
        type: inputMime,
        data: options.createInput(),
        colorSpaceConversion: "none",
        desiredWidth: width,
        desiredHeight: height,
        preferAnimation: options.preferAnimation,
      });
  let frame: VideoFrame | null = null;
  let pixels: Uint8Array<ArrayBuffer> | null = null;
  let encoderModule: JxlEncoderModule | null = null;
  const channels = inputFormat === "jpeg" || inputFormat === "bmp" ? 3 : 4;
  let pixelStride = 4;
  let firstDestinationWrite = true;

  const bridge: JxlEncoderBridge = {
    region(destination, x, y, regionWidth, regionHeight, requestedChannels) {
      assertActive();
      if (
        !encoderModule ||
        !pixels ||
        requestedChannels !== channels ||
        !Number.isSafeInteger(destination) ||
        !Number.isSafeInteger(x) ||
        !Number.isSafeInteger(y) ||
        !Number.isSafeInteger(regionWidth) ||
        !Number.isSafeInteger(regionHeight) ||
        x < 0 ||
        y < 0 ||
        regionWidth < 1 ||
        regionHeight < 1 ||
        x + regionWidth > width ||
        y + regionHeight > height
      ) {
        throw new Error("JPEG XL requested an invalid bounded pixel rectangle.");
      }
      const destinationBytes = regionWidth * regionHeight * requestedChannels;
      if (
        destinationBytes > PIXEL_CALLBACK_LIMIT_BYTES ||
        destination < 0 ||
        destination + destinationBytes > encoderModule.HEAPU8.byteLength
      ) {
        throw new Error("JPEG XL pixel rectangle exceeds the fixed Wasm boundary.");
      }
      let outputOffset = destination;
      if (requestedChannels === 4) {
        const rowBytes = regionWidth * 4;
        for (let row = 0; row < regionHeight; row += 1) {
          const sourceOffset = ((y + row) * width + x) * 4;
          encoderModule.HEAPU8.set(
            pixels.subarray(sourceOffset, sourceOffset + rowBytes),
            outputOffset,
          );
          outputOffset += rowBytes;
        }
      } else {
        for (let row = 0; row < regionHeight; row += 1) {
          let sourceOffset = ((y + row) * width + x) * pixelStride;
          if (pixelStride === 3) {
            const rowBytes = regionWidth * 3;
            encoderModule.HEAPU8.set(
              pixels.subarray(sourceOffset, sourceOffset + rowBytes),
              outputOffset,
            );
            outputOffset += rowBytes;
          } else {
            for (let column = 0; column < regionWidth; column += 1) {
              encoderModule.HEAPU8[outputOffset] = pixels[sourceOffset];
              encoderModule.HEAPU8[outputOffset + 1] = pixels[sourceOffset + 1];
              encoderModule.HEAPU8[outputOffset + 2] = pixels[sourceOffset + 2];
              outputOffset += 3;
              sourceOffset += 4;
            }
          }
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
        offset !== metrics.outputBytes ||
        source.byteLength < 1 ||
        source.byteLength > OUTPUT_BUFFER_BYTES ||
        offset + source.byteLength > MAX_OUTPUT_BYTES
      ) {
        throw new Error("JPEG XL requested an invalid bounded sequential output write.");
      }
      const complete = (): number => {
        metrics.outputBytes += source.byteLength;
        metrics.maxWriteChunkBytes = Math.max(
          metrics.maxWriteChunkBytes,
          source.byteLength,
        );
        metrics.queuedBytes = 0;
        metrics.pendingOperations = 0;
        emitProgress(jobId, "Writing JPEG XL", metrics, startedAt);
        return source.byteLength;
      };
      const execute = (): Promise<number> | number => {
        metrics.queuedBytes = source.byteLength;
        metrics.peakQueuedBytes = Math.max(
          metrics.peakQueuedBytes,
          source.byteLength,
        );
        metrics.pendingOperations = 1;
        metrics.peakPendingOperations = Math.max(metrics.peakPendingOperations, 1);
        const fail = (error: unknown): never => {
          metrics.queuedBytes = 0;
          metrics.pendingOperations = 0;
          throw error;
        };
        try {
          if (writable.writeSync?.(source)) return complete();
          return writable.write(source).then(complete, fail);
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
      throw new Error("JPEG XL source dimensions or frame count exceed the bounded limits.");
    }
    const aggregateDecodedBytes = width * height * 4 * track.frameCount;
    if (
      !Number.isSafeInteger(aggregateDecodedBytes) ||
      aggregateDecodedBytes > MAX_AGGREGATE_DECODED_BYTES ||
      aggregateDecodedBytes / Math.max(1, file.size) > MAX_EXPANSION_RATIO
    ) {
      throw new Error(
        "JPEG XL animation exceeds the 64 GiB or 1,000:1 aggregate decoded safety limit.",
      );
    }
    const animated = track.frameCount > 1;
    const loops = animated ? jxlLoopCount(track.repetitionCount) : 0;
    const imported = (await import(/* @vite-ignore */ MODULE_URL)) as {
      default: JxlEncoderModuleFactory;
    };
    encoderModule = await imported.default({
      withinBridge: bridge,
      locateFile: (name) => (name.endsWith(".wasm") ? WASM_URL : name),
      print: () => {},
      printErr: message,
    });
    if (encoderModule.HEAPU8.buffer.byteLength !== WASM_MEMORY_BYTES) {
      throw new Error(
        `JPEG XL encoder loaded ${encoderModule.HEAPU8.buffer.byteLength} bytes of Wasm memory; expected ${WASM_MEMORY_BYTES}.`,
      );
    }
    recordWasmMemory(metrics, "libjxl-encoder", WASM_MEMORY_BYTES);
    emitProgress(jobId, "Starting bounded JPEG XL encoder", metrics, startedAt, true);
    const startResult = await encoderModule.ccall(
      "within_jxl_encoder_start",
      "number",
      ["number", "number", "number", "number", "number"],
      [width, height, channels === 4 ? 1 : 0, animated ? 1 : 0, loops],
      { async: true },
    );
    assertActive();
    if (startResult !== 0) {
      throw new Error(
        encoderModule.UTF8ToString(encoderModule._within_jxl_encoder_error(), 1024),
      );
    }
    let expectedTimestamp: number | null = null;
    for (let index = 0; index < track.frameCount; index += 1) {
      assertActive();
      emitProgress(
        jobId,
        `Decoding JPEG XL frame ${index + 1} of ${track.frameCount}`,
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
      } else {
        const decoded = await decoder!.decode({
          frameIndex: index,
          completeFramesOnly: true,
        });
        if (!decoded.complete) {
          decoded.image.close();
          throw new Error(`The browser returned an incomplete frame at index ${index}.`);
        }
        frame = decoded.image;
        if (frame.displayWidth !== width || frame.displayHeight !== height) {
          throw new Error(`JPEG XL frame ${index + 1} changed the declared dimensions.`);
        }
      }
      if (animated && frame) {
        if (
          frame.duration == null ||
          !Number.isSafeInteger(frame.duration) ||
          frame.duration < 1 ||
          frame.duration > 0xffff_ffff
        ) {
          throw new Error(`JPEG XL frame ${index + 1} has an unrepresentable duration.`);
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
      if (!pixels) {
        throw new Error(`JPEG XL frame ${index + 1} did not produce bounded pixels.`);
      }
      metrics.imageWorkingBytes = pixels.byteLength;
      metrics.peakImageWorkingBytes = Math.max(
        metrics.peakImageWorkingBytes ?? 0,
        pixels.byteLength,
      );
      emitProgress(
        jobId,
        `Encoding JPEG XL frame ${index + 1} of ${track.frameCount}`,
        metrics,
        startedAt,
        true,
      );
      const frameResult = await encoderModule.ccall(
        "within_jxl_encoder_add_frame",
        "number",
        ["number", "number"],
        [duration, index === track.frameCount - 1 ? 1 : 0],
        { async: true },
      );
      assertActive();
      if (frameResult !== 0) {
        throw new Error(
          [
            encoderModule.UTF8ToString(
              encoderModule._within_jxl_encoder_error(),
              1024,
            ),
            ...errors,
          ]
            .filter(Boolean)
            .join(" | "),
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
      "within_jxl_encoder_finish",
      "number",
      [],
      [],
      { async: true },
    );
    assertActive();
    if (finishResult !== 0) {
      throw new Error(
        [
          encoderModule.UTF8ToString(
            encoderModule._within_jxl_encoder_error(),
            1024,
          ),
          ...errors,
        ]
          .filter(Boolean)
          .join(" | "),
      );
    }
    const nativeOutputBytes = encoderModule._within_jxl_encoder_output_bytes();
    const encoderPeak = encoderModule._within_jxl_encoder_peak_allocation();
    const pixelPeak = encoderModule._within_jxl_encoder_peak_pixel_bytes();
    metrics.codecWorkingBytes = 0;
    metrics.peakCodecWorkingBytes = encoderPeak;
    metrics.maxImagePixelStripBytes = pixelPeak;
    if (
      nativeOutputBytes !== metrics.outputBytes ||
      encoderPeak > ENCODER_ALLOCATION_LIMIT_BYTES ||
      pixelPeak > PIXEL_CALLBACK_LIMIT_BYTES
    ) {
      throw new Error("JPEG XL encoder returned inconsistent bounded-memory metrics.");
    }
    metrics.inputBytes = file.size;
    metrics.imageWorkingBytes = 0;
    emitProgress(
      jobId,
      animated ? "Encoded every JPEG XL animation frame" : "Encoded lossless JPEG XL",
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
    encoderModule?._within_jxl_encoder_destroy();
  }
}
