import type { ConversionMetrics } from "../lib/conversion-protocol";
import { updateCrc32 } from "./archive-conversion";

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_ANIMATION_FRAMES = 1_000;
const MAX_IMAGE_PIXELS = 8_388_608;
const MAX_IMAGE_DIMENSION = 8_192;
const MAX_ANIMATION_TOTAL_DECODED_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_IMAGE_EXPANSION_RATIO = 1_000;
const PNG_PAYLOAD_BYTES = 64 * 1024 - 16;
const PIXEL_STRIP_BYTES = 256 * 1024;

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

export interface BrowserAnimationToApngOptions {
  file: File;
  inputFormat: "gif" | "webp";
  inputMime: string;
  width: number;
  height: number;
  metrics: ConversionMetrics;
  createInput: () => ReadableStream<Uint8Array<ArrayBuffer>>;
  assertActive: () => void;
  progress: (phase: string, force?: boolean) => void;
  write: (chunk: Uint8Array<ArrayBuffer>, phase: string) => Promise<void>;
}

function writeUint32(bytes: Uint8Array<ArrayBuffer>, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    offset,
    value >>> 0,
    false,
  );
}

function writeUint16(bytes: Uint8Array<ArrayBuffer>, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(
    offset,
    value,
    false,
  );
}

function typeBytes(type: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("Invalid PNG chunk type.");
  return new TextEncoder().encode(type);
}

function createPngChunk(
  type: string,
  payload: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const kind = typeBytes(type);
  const output = new Uint8Array(payload.byteLength + 12);
  writeUint32(output, 0, payload.byteLength);
  output.set(kind, 4);
  output.set(payload, 8);
  let crc = updateCrc32(0xffff_ffff, kind);
  crc = updateCrc32(crc, payload);
  writeUint32(output, output.byteLength - 4, (crc ^ 0xffff_ffff) >>> 0);
  return output;
}

function createImageHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(13);
  writeUint32(data, 0, width);
  writeUint32(data, 4, height);
  data[8] = 8;
  data[9] = 6;
  return createPngChunk("IHDR", data);
}

function createFdatChunk(
  sequence: number,
  payload: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(payload.byteLength + 4);
  writeUint32(data, 0, sequence);
  data.set(payload, 4);
  return createPngChunk("fdAT", data);
}

function createAnimationControl(frameCount: number, plays: number): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(8);
  writeUint32(data, 0, frameCount);
  writeUint32(data, 4, plays);
  return createPngChunk("acTL", data);
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function encodeDelay(durationMicros: number): { numerator: number; denominator: number } {
  if (
    !Number.isSafeInteger(durationMicros) ||
    durationMicros < 1 ||
    durationMicros > 65_535_000_000
  ) {
    throw new Error(
      "An animation frame duration is unavailable or exceeds APNG's bounded timing range.",
    );
  }
  const divisor = greatestCommonDivisor(durationMicros, 1_000_000);
  const exactNumerator = durationMicros / divisor;
  const exactDenominator = 1_000_000 / divisor;
  if (exactNumerator <= 65_535 && exactDenominator <= 65_535) {
    return { numerator: exactNumerator, denominator: exactDenominator };
  }
  const denominator = Math.min(
    65_535,
    Math.floor((65_535 * 1_000_000) / durationMicros),
  );
  if (denominator < 1) {
    throw new Error("An animation frame duration cannot be represented safely in APNG.");
  }
  return {
    numerator: Math.max(
      1,
      Math.min(65_535, Math.round((durationMicros * denominator) / 1_000_000)),
    ),
    denominator,
  };
}

function createFrameControl(
  sequence: number,
  width: number,
  height: number,
  durationMicros: number,
): Uint8Array<ArrayBuffer> {
  const delay = encodeDelay(durationMicros);
  const data = new Uint8Array(26);
  writeUint32(data, 0, sequence);
  writeUint32(data, 4, width);
  writeUint32(data, 8, height);
  writeUint16(data, 20, delay.numerator);
  writeUint16(data, 22, delay.denominator);
  data[24] = 0;
  data[25] = 0;
  return createPngChunk("fcTL", data);
}

function apngPlayCount(repetitionCount: number | undefined): number {
  if (repetitionCount === Number.POSITIVE_INFINITY) return 0;
  if (
    repetitionCount == null ||
    !Number.isInteger(repetitionCount) ||
    repetitionCount < 0 ||
    repetitionCount >= 0xffff_ffff
  ) {
    throw new Error("The source animation has an invalid or unrepresentable loop count.");
  }
  return repetitionCount + 1;
}

function subFilterStrip(
  rgba: Uint8Array<ArrayBuffer>,
  width: number,
  rows: number,
): Uint8Array<ArrayBuffer> {
  const rowBytes = width * 4;
  const filtered = new Uint8Array((rowBytes + 1) * rows);
  for (let row = 0; row < rows; row += 1) {
    const inputOffset = row * rowBytes;
    const outputOffset = row * (rowBytes + 1);
    filtered[outputOffset] = 1;
    for (let column = 0; column < rowBytes; column += 1) {
      const left = column >= 4 ? rgba[inputOffset + column - 4] : 0;
      filtered[outputOffset + 1 + column] = rgba[inputOffset + column] - left;
    }
  }
  return filtered;
}

async function writeCompressedFrame(
  frame: VideoFrame,
  frameIndex: number,
  width: number,
  height: number,
  metrics: ConversionMetrics,
  write: BrowserAnimationToApngOptions["write"],
  assertActive: () => void,
  nextSequence: () => number,
): Promise<void> {
  const compressor = new CompressionStream("deflate");
  const input = compressor.writable.getWriter();
  const output = compressor.readable.getReader();
  let compressedChunks = 0;
  const pump = (async () => {
    for (;;) {
      assertActive();
      const { done, value } = await output.read();
      if (done) break;
      for (let offset = 0; offset < value.byteLength; offset += PNG_PAYLOAD_BYTES) {
        assertActive();
        const part = value.slice(
          offset,
          Math.min(offset + PNG_PAYLOAD_BYTES, value.byteLength),
        );
        compressedChunks += 1;
        if (frameIndex === 0) {
          await write(createPngChunk("IDAT", part), "Writing APNG frame data");
        } else {
          await write(createFdatChunk(nextSequence(), part), "Writing APNG frame data");
        }
      }
    }
  })();
  const writeInput = async (chunk: Uint8Array<ArrayBuffer>): Promise<void> => {
    await Promise.race([
      input.write(chunk),
      pump.then(() => {
        throw new Error("The APNG compressor ended before receiving the complete frame.");
      }),
    ]);
  };
  try {
    const rowBytes = width * 4;
    const visibleX = frame.visibleRect?.x ?? 0;
    const visibleY = frame.visibleRect?.y ?? 0;
    const rowsPerStrip = Math.max(
      1,
      Math.floor(PIXEL_STRIP_BYTES / (rowBytes + 1)),
    );
    for (let y = 0; y < height; y += rowsPerStrip) {
      assertActive();
      const rows = Math.min(rowsPerStrip, height - y);
      const rgba = new Uint8Array(rowBytes * rows);
      metrics.imageWorkingBytes = rgba.byteLength;
      metrics.peakImageWorkingBytes = Math.max(
        metrics.peakImageWorkingBytes ?? 0,
        metrics.imageWorkingBytes,
      );
      metrics.maxImagePixelStripBytes = Math.max(
        metrics.maxImagePixelStripBytes ?? 0,
        rgba.byteLength,
      );
      await frame.copyTo(rgba, {
        format: "RGBA",
        rect: {
          x: visibleX,
          y: visibleY + y,
          width,
          height: rows,
        },
        layout: [{ offset: 0, stride: rowBytes }],
      });
      const filtered = subFilterStrip(rgba, width, rows);
      metrics.imageWorkingBytes = rgba.byteLength + filtered.byteLength;
      metrics.peakImageWorkingBytes = Math.max(
        metrics.peakImageWorkingBytes ?? 0,
        metrics.imageWorkingBytes,
      );
      metrics.maxImagePixelStripBytes = Math.max(
        metrics.maxImagePixelStripBytes ?? 0,
        filtered.byteLength,
      );
      await writeInput(filtered);
      metrics.imageWorkingBytes = 0;
    }
    const close = input.close();
    await Promise.race([close, pump]);
    await close;
    await pump;
    if (compressedChunks === 0) {
      throw new Error("The APNG compressor returned an empty frame datastream.");
    }
  } catch (error) {
    await Promise.allSettled([input.abort(error), output.cancel(error)]);
    await pump.catch(() => {});
    throw error;
  } finally {
    metrics.imageWorkingBytes = 0;
  }
}

export async function runBrowserAnimationToApng(
  options: BrowserAnimationToApngOptions,
): Promise<void> {
  const {
    file,
    inputMime,
    width,
    height,
    metrics,
    createInput,
    assertActive,
    progress,
    write,
  } = options;
  const Decoder = (
    globalThis as unknown as { ImageDecoder?: WithinImageDecoderConstructor }
  ).ImageDecoder;
  if (!Decoder || typeof CompressionStream !== "function") {
    throw new Error(
      "This browser does not provide the ImageDecoder and CompressionStream APIs required by APNG output.",
    );
  }
  if (Decoder.isTypeSupported && !(await Decoder.isTypeSupported(inputMime))) {
    throw new Error(`This browser does not provide an ImageDecoder for ${inputMime}.`);
  }
  const decoder = new Decoder({
    type: inputMime,
    data: createInput(),
    colorSpaceConversion: "none",
    desiredWidth: width,
    desiredHeight: height,
    preferAnimation: true,
  });
  let frame: VideoFrame | null = null;
  let sequence = 0;
  let expectedTimestamp: number | null = null;
  const nextSequence = (): number => {
    if (sequence > 0xffff_ffff) {
      throw new Error("APNG animation sequence exceeds the 32-bit format limit.");
    }
    const current = sequence;
    sequence += 1;
    return current;
  };
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track) throw new Error("The browser could not identify a decodable animation track.");
    if (
      !Number.isSafeInteger(track.frameCount) ||
      track.frameCount < 1 ||
      track.frameCount > MAX_ANIMATION_FRAMES
    ) {
      throw new Error(
        `Animation frame count must be between 1 and ${MAX_ANIMATION_FRAMES.toLocaleString("en-US")}.`,
      );
    }
    const decodedBytes = width * height * 4 * track.frameCount;
    if (
      width < 1 ||
      height < 1 ||
      width > MAX_IMAGE_DIMENSION ||
      height > MAX_IMAGE_DIMENSION ||
      width * height > MAX_IMAGE_PIXELS ||
      decodedBytes > MAX_ANIMATION_TOTAL_DECODED_BYTES ||
      decodedBytes / Math.max(1, file.size) > MAX_IMAGE_EXPANSION_RATIO
    ) {
      throw new Error(
        "Animation dimensions or aggregate decoded size exceed the bounded APNG safety limits.",
      );
    }
    const plays = apngPlayCount(track.repetitionCount);
    await write(PNG_SIGNATURE.slice(), "Writing APNG signature");
    await write(createImageHeader(width, height), "Writing APNG header");
    await write(
      createAnimationControl(track.frameCount, plays),
      "Writing APNG animation control",
    );
    for (let index = 0; index < track.frameCount; index += 1) {
      assertActive();
      progress(`Decoding APNG frame ${index + 1} of ${track.frameCount}`, true);
      const decoded = await decoder.decode({
        frameIndex: index,
        completeFramesOnly: true,
      });
      if (!decoded.complete) {
        decoded.image.close();
        throw new Error(`The browser returned an incomplete animation frame at index ${index}.`);
      }
      frame = decoded.image;
      if (frame.displayWidth !== width || frame.displayHeight !== height) {
        throw new Error(
          `Animation frame ${index + 1} does not match the declared canvas dimensions.`,
        );
      }
      const duration = frame.duration;
      if (duration == null) {
        throw new Error(`Animation frame ${index + 1} has no representable duration.`);
      }
      if (expectedTimestamp != null && Math.abs(frame.timestamp - expectedTimestamp) > 1) {
        throw new Error(
          "The source animation contains timestamp gaps that APNG cannot represent without changing timing.",
        );
      }
      expectedTimestamp = frame.timestamp + duration;
      metrics.imageFrameFormat = frame.format;
      metrics.imageColorSpace = {
        primaries: frame.colorSpace.primaries,
        transfer: frame.colorSpace.transfer,
        matrix: frame.colorSpace.matrix,
        fullRange: frame.colorSpace.fullRange,
      };
      await write(
        createFrameControl(nextSequence(), width, height, duration),
        "Writing APNG frame control",
      );
      progress(`Encoding APNG frame ${index + 1} of ${track.frameCount}`, true);
      await writeCompressedFrame(
        frame,
        index,
        width,
        height,
        metrics,
        write,
        assertActive,
        nextSequence,
      );
      frame.close();
      frame = null;
    }
    await write(createPngChunk("IEND", new Uint8Array()), "Finalizing APNG");
    metrics.inputBytes = file.size;
    progress("Encoded every APNG frame", true);
  } finally {
    frame?.close();
    decoder.close();
  }
}
