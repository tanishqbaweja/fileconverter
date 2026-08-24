import type { ConversionMetrics } from "../lib/conversion-protocol";

const MAX_ANIMATION_FRAMES = 1_000;
const MAX_IMAGE_PIXELS = 8_388_608;
const MAX_IMAGE_DIMENSION = 8_192;
const MAX_ANIMATION_TOTAL_DECODED_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_IMAGE_EXPANSION_RATIO = 1_000;
const MAX_WEBP_FILE_BYTES = 0xffff_ffff + 8;
const WEBP_ANIMATION_FLAG = 0x02;
const WEBP_ALPHA_FLAG = 0x10;

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

interface WebpImageChunk {
  type: "ALPH" | "VP8 " | "VP8L";
  offset: number;
  totalBytes: number;
}

interface EncodedWebpFrame {
  chunks: WebpImageChunk[];
  imageDataBytes: number;
  hasAlpha: boolean;
}

export interface BrowserAnimationToWebpOptions {
  file: File;
  inputMime: string;
  width: number;
  height: number;
  maxOutputBytes: number;
  metrics: ConversionMetrics;
  createInput: () => ReadableStream<Uint8Array<ArrayBuffer>>;
  assertActive: () => void;
  progress: (phase: string, force?: boolean) => void;
  write: (chunk: Uint8Array<ArrayBuffer>, phase: string) => Promise<void>;
  patch: (
    position: number,
    chunk: Uint8Array<ArrayBuffer>,
    phase: string,
  ) => Promise<void>;
}

function writeAscii(bytes: Uint8Array<ArrayBuffer>, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function writeUint24Le(
  bytes: Uint8Array<ArrayBuffer>,
  offset: number,
  value: number,
): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function createAnimatedWebpHeader(
  width: number,
  height: number,
  loopCount: number,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  writeAscii(bytes, 8, "WEBP");
  writeAscii(bytes, 12, "VP8X");
  view.setUint32(16, 10, true);
  bytes[20] = WEBP_ANIMATION_FLAG;
  writeUint24Le(bytes, 24, width - 1);
  writeUint24Le(bytes, 27, height - 1);
  writeAscii(bytes, 30, "ANIM");
  view.setUint32(34, 6, true);
  view.setUint16(42, loopCount, true);
  return bytes;
}

function createAnimatedWebpFinalPatch(
  fileBytes: number,
  hasAlpha: boolean,
): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(fileBytes) || fileBytes < 44 || fileBytes > MAX_WEBP_FILE_BYTES) {
    throw new Error("Animated WebP output exceeds the RIFF 32-bit size limit.");
  }
  const bytes = new Uint8Array(17);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, fileBytes - 8, true);
  writeAscii(bytes, 4, "WEBP");
  writeAscii(bytes, 8, "VP8X");
  view.setUint32(12, 10, true);
  bytes[16] = WEBP_ANIMATION_FLAG | (hasAlpha ? WEBP_ALPHA_FLAG : 0);
  return bytes;
}

function createAnimationFrameHeader(
  width: number,
  height: number,
  durationMs: number,
  imageDataBytes: number,
): Uint8Array<ArrayBuffer> {
  const payloadBytes = 16 + imageDataBytes;
  if (payloadBytes > 0xffff_ffff) {
    throw new Error("One encoded WebP frame exceeds the RIFF chunk-size limit.");
  }
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "ANMF");
  view.setUint32(4, payloadBytes, true);
  writeUint24Le(bytes, 14, width - 1);
  writeUint24Le(bytes, 17, height - 1);
  writeUint24Le(bytes, 20, durationMs);
  // Full-canvas composited frames replace the previous canvas without blending.
  bytes[23] = 1;
  return bytes;
}

function webpLoopCount(repetitionCount: number | undefined): number {
  if (repetitionCount === Number.POSITIVE_INFINITY) return 0;
  if (
    repetitionCount == null ||
    !Number.isInteger(repetitionCount) ||
    repetitionCount < 0 ||
    repetitionCount >= 65_535
  ) {
    throw new Error("The source animation has an invalid or unrepresentable loop count.");
  }
  return repetitionCount + 1;
}

function webpDurationMs(durationMicros: number | null, frameIndex: number): number {
  if (
    durationMicros == null ||
    !Number.isSafeInteger(durationMicros) ||
    durationMicros < 1
  ) {
    throw new Error(`Animation frame ${frameIndex + 1} has no representable duration.`);
  }
  const milliseconds = Math.max(1, Math.round(durationMicros / 1_000));
  if (milliseconds > 0xff_ffff) {
    throw new Error("An animation frame duration exceeds WebP's 24-bit millisecond field.");
  }
  return milliseconds;
}

async function readBlobBytes(
  blob: Blob,
  offset: number,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (offset < 0 || length < 0 || offset + length > blob.size) {
    throw new Error("Encoded WebP chunk inspection exceeded the frame boundary.");
  }
  return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
}

async function inspectEncodedWebp(blob: Blob): Promise<EncodedWebpFrame> {
  if (blob.size < 20 || blob.size > MAX_WEBP_FILE_BYTES) {
    throw new Error("The browser returned an invalid encoded WebP frame size.");
  }
  const header = await readBlobBytes(blob, 0, 12);
  const riffSize = new DataView(header.buffer).getUint32(4, true) + 8;
  const ascii = (bytes: Uint8Array<ArrayBuffer>, offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(header, 0, 4) !== "RIFF" || ascii(header, 8, 4) !== "WEBP") {
    throw new Error("The browser encoder returned a non-WebP frame payload.");
  }
  if (riffSize !== blob.size) {
    throw new Error("The browser encoder returned a WebP frame with an invalid RIFF size.");
  }
  const chunks: WebpImageChunk[] = [];
  let offset = 12;
  let sawAlpha = false;
  let sawImage = false;
  let chunkCount = 0;
  while (offset < blob.size) {
    if (offset + 8 > blob.size || chunkCount >= 64) {
      throw new Error("The encoded WebP frame has an invalid or excessive chunk table.");
    }
    const chunkHeader = await readBlobBytes(blob, offset, 8);
    const type = ascii(chunkHeader, 0, 4);
    const size = new DataView(chunkHeader.buffer).getUint32(4, true);
    const totalBytes = 8 + size + (size & 1);
    if (offset + totalBytes > blob.size) {
      throw new Error("An encoded WebP frame chunk exceeds its RIFF boundary.");
    }
    if (type === "ALPH") {
      if (sawAlpha || sawImage) {
        throw new Error("The browser returned an invalid WebP alpha chunk order.");
      }
      sawAlpha = true;
      chunks.push({ type, offset, totalBytes });
    } else if (type === "VP8 " || type === "VP8L") {
      if (sawImage || (type === "VP8L" && sawAlpha)) {
        throw new Error("The browser returned multiple or incompatible WebP image chunks.");
      }
      if (type === "VP8L") {
        const losslessHeader = await readBlobBytes(blob, offset + 8, Math.min(size, 5));
        if (losslessHeader.byteLength < 5 || losslessHeader[0] !== 0x2f) {
          throw new Error("The browser returned an invalid lossless WebP frame header.");
        }
        sawAlpha ||= (losslessHeader[4] & 0x10) !== 0;
      }
      sawImage = true;
      chunks.push({ type, offset, totalBytes });
    }
    offset += totalBytes;
    chunkCount += 1;
  }
  if (offset !== blob.size || !sawImage) {
    throw new Error("The browser returned an incomplete encoded WebP frame.");
  }
  return {
    chunks,
    imageDataBytes: chunks.reduce((total, chunk) => total + chunk.totalBytes, 0),
    hasAlpha: sawAlpha,
  };
}

async function copyBlobRange(
  blob: Blob,
  offset: number,
  length: number,
  options: BrowserAnimationToWebpOptions,
): Promise<void> {
  const reader = blob.slice(offset, offset + length).stream().getReader();
  try {
    for (;;) {
      options.assertActive();
      const { done, value } = await reader.read();
      if (done) break;
      options.metrics.imageWorkingBytes = value.byteLength;
      options.metrics.peakImageWorkingBytes = Math.max(
        options.metrics.peakImageWorkingBytes ?? 0,
        value.byteLength,
      );
      await options.write(value, "Writing animated WebP frame data");
      options.metrics.imageWorkingBytes = 0;
    }
  } finally {
    options.metrics.imageWorkingBytes = 0;
    await reader.cancel().catch(() => {});
  }
}

async function encodeCanvas(canvas: OffscreenCanvas): Promise<Blob> {
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: 1 });
  if (blob.type !== "image/webp" || blob.size < 1) {
    throw new Error("The browser did not provide a WebP encoder for the animation frame.");
  }
  return blob;
}

export async function runBrowserAnimationToWebp(
  options: BrowserAnimationToWebpOptions,
): Promise<void> {
  const {
    file,
    inputMime,
    width,
    height,
    maxOutputBytes,
    metrics,
    createInput,
    assertActive,
    progress,
    write,
    patch,
  } = options;
  const Decoder = (
    globalThis as unknown as { ImageDecoder?: WithinImageDecoderConstructor }
  ).ImageDecoder;
  if (!Decoder || typeof OffscreenCanvas !== "function") {
    throw new Error(
      "This browser does not provide the ImageDecoder and OffscreenCanvas APIs required by animated WebP output.",
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
  let canvas: OffscreenCanvas | null = null;
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track) throw new Error("The browser could not identify a decodable image track.");
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
        "Animation dimensions or aggregate decoded size exceed the bounded WebP safety limits.",
      );
    }
    const loopCount = track.frameCount > 1 ? webpLoopCount(track.repetitionCount) : 0;
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("The browser could not create a bounded WebP canvas.");

    let expectedTimestamp: number | null = null;
    let hasAlpha = false;
    if (track.frameCount > 1) {
      await write(
        createAnimatedWebpHeader(width, height, loopCount),
        "Writing animated WebP header",
      );
    }
    for (let index = 0; index < track.frameCount; index += 1) {
      assertActive();
      progress(`Decoding WebP frame ${index + 1} of ${track.frameCount}`, true);
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
      if (track.frameCount > 1) {
        if (expectedTimestamp != null && Math.abs(frame.timestamp - expectedTimestamp) > 1) {
          throw new Error(
            "The source animation contains timestamp gaps that WebP cannot represent without changing timing.",
          );
        }
        if (duration == null) {
          throw new Error(`Animation frame ${index + 1} has no representable duration.`);
        }
        expectedTimestamp = frame.timestamp + duration;
      }
      metrics.imageFrameFormat = frame.format;
      metrics.imageColorSpace = {
        primaries: frame.colorSpace.primaries,
        transfer: frame.colorSpace.transfer,
        matrix: frame.colorSpace.matrix,
        fullRange: frame.colorSpace.fullRange,
      };
      context.clearRect(0, 0, width, height);
      context.drawImage(frame, 0, 0, width, height);
      progress(`Encoding WebP frame ${index + 1} of ${track.frameCount}`, true);
      const encoded = await encodeCanvas(canvas);
      frame.close();
      frame = null;

      if (track.frameCount === 1) {
        if (encoded.size > maxOutputBytes) {
          throw new Error("Encoded WebP image exceeds the bounded output limit.");
        }
        await copyBlobRange(encoded, 0, encoded.size, options);
        continue;
      }
      const inspected = await inspectEncodedWebp(encoded);
      const durationMs = webpDurationMs(duration, index);
      const frameBytes = 24 + inspected.imageDataBytes;
      if (metrics.outputBytes + frameBytes > maxOutputBytes) {
        throw new Error("Encoded animated WebP exceeds the bounded output limit.");
      }
      hasAlpha ||= inspected.hasAlpha;
      await write(
        createAnimationFrameHeader(
          width,
          height,
          durationMs,
          inspected.imageDataBytes,
        ),
        "Writing animated WebP frame header",
      );
      for (const chunk of inspected.chunks) {
        await copyBlobRange(encoded, chunk.offset, chunk.totalBytes, options);
      }
    }
    if (track.frameCount > 1) {
      await patch(
        4,
        createAnimatedWebpFinalPatch(metrics.outputBytes, hasAlpha),
        "Finalizing animated WebP",
      );
    }
    metrics.inputBytes = file.size;
    progress(
      track.frameCount > 1 ? "Encoded every animated WebP frame" : "Encoded WebP image",
      true,
    );
  } finally {
    metrics.imageWorkingBytes = 0;
    frame?.close();
    decoder.close();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
