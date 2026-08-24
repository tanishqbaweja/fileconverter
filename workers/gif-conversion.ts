import type { ConversionMetrics } from "../lib/conversion-protocol";

const GIF_MAX_FRAMES = 1_000;
const GIF_MAX_PIXELS = 8_388_608;
const GIF_MAX_DIMENSION = 8_192;
const GIF_MAX_TOTAL_DECODED_BYTES = 64 * 1024 * 1024 * 1024;
const GIF_MAX_EXPANSION_RATIO = 1_000;
const PIXEL_STRIP_BYTES = 256 * 1024;
const LZW_STAGING_BYTES = 128 * 1024;
const GIF_MINIMUM_CODE_SIZE = 8;
const GIF_CLEAR_CODE = 1 << GIF_MINIMUM_CODE_SIZE;
const GIF_END_CODE = GIF_CLEAR_CODE + 1;
const GIF_FIRST_DICTIONARY_CODE = GIF_END_CODE + 1;
const GIF_MAX_DICTIONARY_CODE = 4_095;
const GIF_DICTIONARY_KEYS = 4_096 * 256;

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

export interface BrowserAnimationToGifOptions {
  file: File;
  inputMime: string;
  width: number;
  height: number;
  preferAnimation: boolean;
  metrics: ConversionMetrics;
  createInput: () => ReadableStream<Uint8Array<ArrayBuffer>>;
  assertActive: () => void;
  progress: (phase: string, force?: boolean) => void;
  write: (chunk: Uint8Array<ArrayBuffer>, phase: string) => Promise<void>;
}

function writeUint16LittleEndian(
  bytes: Uint8Array<ArrayBuffer>,
  offset: number,
  value: number,
): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(
    offset,
    value,
    true,
  );
}

function createGlobalPalette(): Uint8Array<ArrayBuffer> {
  const palette = new Uint8Array(256 * 3);
  for (let index = 2; index < 256; index += 1) {
    const red = (index >>> 5) & 0x07;
    const green = (index >>> 2) & 0x07;
    const blue = index & 0x03;
    palette[index * 3] = Math.round((red * 255) / 7);
    palette[index * 3 + 1] = Math.round((green * 255) / 7);
    palette[index * 3 + 2] = Math.round((blue * 255) / 3);
  }
  // Index zero is transparent. Index one is the opaque-black replacement for
  // the otherwise colliding RGB332 black index.
  return palette;
}

function createGifHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const palette = createGlobalPalette();
  const output = new Uint8Array(13 + palette.byteLength);
  output.set(new TextEncoder().encode("GIF89a"), 0);
  writeUint16LittleEndian(output, 6, width);
  writeUint16LittleEndian(output, 8, height);
  output[10] = 0xf7;
  output[11] = 0;
  output[12] = 0;
  output.set(palette, 13);
  return output;
}

function gifLoopCount(repetitionCount: number | undefined): number {
  if (repetitionCount === Number.POSITIVE_INFINITY) return 0;
  if (
    repetitionCount == null ||
    !Number.isInteger(repetitionCount) ||
    repetitionCount < 0 ||
    repetitionCount > 65_535
  ) {
    throw new Error("The source animation has an invalid or unrepresentable GIF loop count.");
  }
  return repetitionCount;
}

function createLoopExtension(loopCount: number): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(19);
  output.set([0x21, 0xff, 0x0b], 0);
  output.set(new TextEncoder().encode("NETSCAPE2.0"), 3);
  output.set([0x03, 0x01], 14);
  writeUint16LittleEndian(output, 16, loopCount);
  output[18] = 0;
  return output;
}

function encodeGifDelay(durationMicros: number): number {
  if (!Number.isSafeInteger(durationMicros) || durationMicros < 1) {
    throw new Error("An animation frame duration is unavailable or invalid.");
  }
  const centiseconds = Math.round(durationMicros / 10_000);
  if (centiseconds < 1 || centiseconds > 65_535) {
    throw new Error("An animation frame duration exceeds GIF's centisecond timing range.");
  }
  return centiseconds;
}

function createGraphicControl(delay: number): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array([0x21, 0xf9, 0x04, 0x09, 0, 0, 0, 0]);
  writeUint16LittleEndian(output, 4, delay);
  return output;
}

function createImageDescriptor(width: number, height: number): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(11);
  output[0] = 0x2c;
  writeUint16LittleEndian(output, 5, width);
  writeUint16LittleEndian(output, 7, height);
  output[9] = 0;
  output[10] = GIF_MINIMUM_CODE_SIZE;
  return output;
}

function quantizeRgb332(red: number, green: number, blue: number, alpha: number): number {
  if (alpha < 128) return 0;
  const index = (red & 0xe0) | ((green & 0xe0) >>> 3) | (blue >>> 6);
  return index === 0 ? 1 : index;
}

class GifLzwEncoder {
  private readonly dictionaryCodes = new Uint16Array(GIF_DICTIONARY_KEYS);
  private readonly dictionaryGenerations = new Uint16Array(GIF_DICTIONARY_KEYS);
  private readonly subblock = new Uint8Array(255);
  private readonly staging = new Uint8Array(LZW_STAGING_BYTES);
  private generation = 0;
  private nextCode = GIF_FIRST_DICTIONARY_CODE;
  private codeSize = GIF_MINIMUM_CODE_SIZE + 1;
  private prefix = -1;
  private bitBuffer = 0;
  private bitCount = 0;
  private subblockLength = 0;
  private stagingLength = 0;

  constructor(
    private readonly write: BrowserAnimationToGifOptions["write"],
    private readonly assertActive: () => void,
  ) {}

  get fixedWorkingBytes(): number {
    return (
      this.dictionaryCodes.byteLength +
      this.dictionaryGenerations.byteLength +
      this.subblock.byteLength +
      this.staging.byteLength
    );
  }

  beginFrame(): void {
    this.prefix = -1;
    this.bitBuffer = 0;
    this.bitCount = 0;
    this.subblockLength = 0;
    this.stagingLength = 0;
    this.resetDictionary();
    this.emitCode(GIF_CLEAR_CODE);
  }

  consumeRgba(rgba: Uint8Array<ArrayBuffer>): void {
    for (let offset = 0; offset < rgba.byteLength; offset += 4) {
      const symbol = quantizeRgb332(
        rgba[offset],
        rgba[offset + 1],
        rgba[offset + 2],
        rgba[offset + 3],
      );
      if (this.prefix < 0) {
        this.prefix = symbol;
        continue;
      }
      const key = (this.prefix << 8) | symbol;
      if (this.dictionaryGenerations[key] === this.generation) {
        this.prefix = this.dictionaryCodes[key];
        continue;
      }
      this.emitCode(this.prefix);
      if (this.nextCode <= GIF_MAX_DICTIONARY_CODE) {
        this.dictionaryCodes[key] = this.nextCode;
        this.dictionaryGenerations[key] = this.generation;
        this.nextCode += 1;
        // GIF's decoder dictionary trails the encoder by one entry. Increase
        // the emitted code width only after crossing the current boundary.
        if (this.nextCode > 1 << this.codeSize && this.codeSize < 12) {
          this.codeSize += 1;
        }
      } else {
        // Restarting a saturated dictionary was faster overall in the measured
        // APNG/WebP pair and reduced output by roughly one third versus freezing it.
        this.emitCode(GIF_CLEAR_CODE);
        this.resetDictionary();
      }
      this.prefix = symbol;
    }
  }

  async flushStrip(): Promise<void> {
    this.assertActive();
    if (this.stagingLength === 0) return;
    await this.write(
      this.staging.subarray(0, this.stagingLength),
      "Writing GIF frame data",
    );
    this.stagingLength = 0;
  }

  async finishFrame(): Promise<void> {
    if (this.prefix < 0) throw new Error("GIF frame contains no pixels.");
    this.emitCode(this.prefix);
    this.emitCode(GIF_END_CODE);
    while (this.bitCount > 0) {
      this.emitByte(this.bitBuffer & 0xff);
      this.bitBuffer = Math.floor(this.bitBuffer / 256);
      this.bitCount -= 8;
    }
    this.frameSubblock();
    this.appendStagingByte(0);
    await this.flushStrip();
  }

  private resetDictionary(): void {
    if (this.generation >= 65_535) {
      this.dictionaryGenerations.fill(0);
      this.generation = 1;
    } else {
      this.generation += 1;
    }
    this.nextCode = GIF_FIRST_DICTIONARY_CODE;
    this.codeSize = GIF_MINIMUM_CODE_SIZE + 1;
  }

  private emitCode(code: number): void {
    this.bitBuffer += code * 2 ** this.bitCount;
    this.bitCount += this.codeSize;
    while (this.bitCount >= 8) {
      this.emitByte(this.bitBuffer & 0xff);
      this.bitBuffer = Math.floor(this.bitBuffer / 256);
      this.bitCount -= 8;
    }
  }

  private emitByte(value: number): void {
    this.subblock[this.subblockLength] = value;
    this.subblockLength += 1;
    if (this.subblockLength === this.subblock.byteLength) this.frameSubblock();
  }

  private frameSubblock(): void {
    if (this.subblockLength === 0) return;
    if (this.stagingLength + this.subblockLength + 1 > this.staging.byteLength) {
      throw new Error("GIF's fixed LZW staging buffer was exceeded.");
    }
    this.staging[this.stagingLength] = this.subblockLength;
    this.stagingLength += 1;
    this.staging.set(this.subblock.subarray(0, this.subblockLength), this.stagingLength);
    this.stagingLength += this.subblockLength;
    this.subblockLength = 0;
  }

  private appendStagingByte(value: number): void {
    if (this.stagingLength >= this.staging.byteLength) {
      throw new Error("GIF's fixed LZW staging buffer was exceeded.");
    }
    this.staging[this.stagingLength] = value;
    this.stagingLength += 1;
  }
}

export async function runBrowserAnimationToGif(
  options: BrowserAnimationToGifOptions,
): Promise<void> {
  const {
    file,
    inputMime,
    width,
    height,
    preferAnimation,
    metrics,
    createInput,
    assertActive,
    progress,
    write,
  } = options;
  const Decoder = (
    globalThis as unknown as { ImageDecoder?: WithinImageDecoderConstructor }
  ).ImageDecoder;
  if (!Decoder) {
    throw new Error("This browser does not provide the ImageDecoder API required by GIF output.");
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
    preferAnimation,
  });
  const lzw = new GifLzwEncoder(write, assertActive);
  let frame: VideoFrame | null = null;
  let expectedTimestamp: number | null = null;
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track) throw new Error("The browser could not identify a decodable image track.");
    if (
      !Number.isSafeInteger(track.frameCount) ||
      track.frameCount < 1 ||
      track.frameCount > GIF_MAX_FRAMES
    ) {
      throw new Error(`GIF output accepts between 1 and ${GIF_MAX_FRAMES} frames.`);
    }
    const decodedBytes = width * height * 4 * track.frameCount;
    if (
      width < 1 ||
      height < 1 ||
      width > GIF_MAX_DIMENSION ||
      height > GIF_MAX_DIMENSION ||
      width * height > GIF_MAX_PIXELS ||
      decodedBytes > GIF_MAX_TOTAL_DECODED_BYTES ||
      decodedBytes / Math.max(1, file.size) > GIF_MAX_EXPANSION_RATIO
    ) {
      throw new Error("Animation dimensions or aggregate decoded size exceed GIF safety limits.");
    }
    await write(createGifHeader(width, height), "Writing GIF header");
    if (track.frameCount > 1) {
      await write(
        createLoopExtension(gifLoopCount(track.repetitionCount)),
        "Writing GIF loop control",
      );
    }
    metrics.imageWorkingBytes = lzw.fixedWorkingBytes;
    metrics.peakImageWorkingBytes = Math.max(
      metrics.peakImageWorkingBytes ?? 0,
      metrics.imageWorkingBytes,
    );
    for (let index = 0; index < track.frameCount; index += 1) {
      assertActive();
      progress(`Decoding GIF frame ${index + 1} of ${track.frameCount}`, true);
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
        throw new Error(`Animation frame ${index + 1} does not match the GIF canvas dimensions.`);
      }
      const duration = frame.duration;
      if (duration == null && track.frameCount > 1) {
        throw new Error(`Animation frame ${index + 1} has no representable duration.`);
      }
      if (
        duration != null &&
        expectedTimestamp != null &&
        Math.abs(frame.timestamp - expectedTimestamp) > 1
      ) {
        throw new Error(
          "The source animation contains timestamp gaps that GIF cannot preserve safely.",
        );
      }
      if (duration != null) expectedTimestamp = frame.timestamp + duration;
      metrics.imageFrameFormat = frame.format;
      metrics.imageColorSpace = {
        primaries: frame.colorSpace.primaries,
        transfer: frame.colorSpace.transfer,
        matrix: frame.colorSpace.matrix,
        fullRange: frame.colorSpace.fullRange,
      };
      await write(
        createGraphicControl(duration == null ? 0 : encodeGifDelay(duration)),
        "Writing GIF frame control",
      );
      await write(createImageDescriptor(width, height), "Writing GIF image descriptor");
      lzw.beginFrame();
      progress(`Encoding GIF frame ${index + 1} of ${track.frameCount}`, true);
      const rowBytes = width * 4;
      const rowsPerStrip = Math.max(1, Math.floor(PIXEL_STRIP_BYTES / rowBytes));
      const visibleX = frame.visibleRect?.x ?? 0;
      const visibleY = frame.visibleRect?.y ?? 0;
      for (let y = 0; y < height; y += rowsPerStrip) {
        assertActive();
        const rows = Math.min(rowsPerStrip, height - y);
        const rgba = new Uint8Array(rowBytes * rows);
        metrics.imageWorkingBytes = lzw.fixedWorkingBytes + rgba.byteLength;
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
        lzw.consumeRgba(rgba);
        await lzw.flushStrip();
        metrics.imageWorkingBytes = lzw.fixedWorkingBytes;
      }
      await lzw.finishFrame();
      frame.close();
      frame = null;
    }
    await write(new Uint8Array([0x3b]), "Finalizing GIF");
    metrics.inputBytes = file.size;
    progress("Encoded every GIF frame", true);
  } finally {
    metrics.imageWorkingBytes = 0;
    frame?.close();
    decoder.close();
  }
}
