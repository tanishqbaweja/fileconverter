import type { ConversionMetrics } from "../lib/conversion-protocol";

interface BmpDecodeOptions {
  file: File;
  header: Uint8Array<ArrayBufferLike>;
  width: number;
  height: number;
  metrics: ConversionMetrics;
  createInput(): ReadableStream<Uint8Array<ArrayBuffer>>;
  assertActive(): void;
  progress(): void;
}

interface BmpLayout {
  pixelOffset: number;
  rowStride: number;
  bytesPerPixel: 3 | 4;
  topDown: boolean;
}

function parseBmpLayout(options: BmpDecodeOptions): BmpLayout {
  const { header, file, width, height } = options;
  if (header.byteLength < 54 || header[0] !== 0x42 || header[1] !== 0x4d) {
    throw new Error("The BMP header is truncated or invalid.");
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const dibBytes = view.getUint32(14, true);
  const signedWidth = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  const planes = view.getUint16(26, true);
  const bitsPerPixel = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (
    dibBytes < 40 ||
    signedWidth !== width ||
    Math.abs(signedHeight) !== height ||
    signedHeight === 0 ||
    planes !== 1 ||
    (bitsPerPixel !== 24 && bitsPerPixel !== 32) ||
    compression !== 0
  ) {
    throw new Error(
      "This route accepts uncompressed 24-bit or 32-bit Windows BMP pixels only.",
    );
  }
  const rowStride = Math.ceil((width * bitsPerPixel) / 32) * 4;
  const pixelEnd = pixelOffset + rowStride * height;
  if (
    pixelOffset < 14 + dibBytes ||
    !Number.isSafeInteger(pixelEnd) ||
    pixelEnd > file.size ||
    rowStride > 8_192 * 4
  ) {
    throw new Error("The BMP pixel layout exceeds the bounded source file.");
  }
  return {
    pixelOffset,
    rowStride,
    bytesPerPixel: (bitsPerPixel / 8) as 3 | 4,
    topDown: signedHeight < 0,
  };
}

export async function decodeBmpRgba(
  options: BmpDecodeOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height, metrics, assertActive, progress } = options;
  const layout = parseBmpLayout(options);
  const output = new Uint8Array(width * height * 4);
  const row = new Uint8Array(layout.rowStride);
  const reader = options.createInput().getReader();
  let chunk: Uint8Array<ArrayBuffer> | null = null;
  let chunkOffset = 0;
  let completed = false;

  async function consume(destination: Uint8Array<ArrayBuffer> | null, bytes: number): Promise<void> {
    let remaining = bytes;
    let destinationOffset = 0;
    while (remaining > 0) {
      assertActive();
      if (!chunk || chunkOffset === chunk.byteLength) {
        const result = await reader.read();
        if (result.done || !result.value) {
          throw new Error("The BMP pixel array ends before its declared size.");
        }
        chunk = result.value;
        chunkOffset = 0;
      }
      const length = Math.min(remaining, chunk.byteLength - chunkOffset);
      if (destination) {
        destination.set(chunk.subarray(chunkOffset, chunkOffset + length), destinationOffset);
        destinationOffset += length;
      }
      chunkOffset += length;
      remaining -= length;
    }
  }

  try {
    await consume(null, layout.pixelOffset);
    metrics.imageWorkingBytes = output.byteLength + row.byteLength;
    metrics.peakImageWorkingBytes = Math.max(
      metrics.peakImageWorkingBytes ?? 0,
      metrics.imageWorkingBytes,
    );
    for (let sourceRow = 0; sourceRow < height; sourceRow += 1) {
      await consume(row, row.byteLength);
      const destinationRow = layout.topDown ? sourceRow : height - sourceRow - 1;
      let sourceOffset = 0;
      let destinationOffset = destinationRow * width * 4;
      for (let column = 0; column < width; column += 1) {
        output[destinationOffset] = row[sourceOffset + 2];
        output[destinationOffset + 1] = row[sourceOffset + 1];
        output[destinationOffset + 2] = row[sourceOffset];
        // BI_RGB's fourth byte is not a reliable transparency channel.
        output[destinationOffset + 3] = 255;
        sourceOffset += layout.bytesPerPixel;
        destinationOffset += 4;
      }
      if ((sourceRow & 63) === 63) progress();
    }
    completed = true;
    return output;
  } finally {
    chunk = null;
    if (!completed) metrics.imageWorkingBytes = 0;
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
