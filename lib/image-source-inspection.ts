export const MAX_IMAGE_INSPECTION_BYTES = 1024 * 1024;

export interface ImageSourceInspection {
  format: string;
  width: number;
  height: number;
  bitDepth: number | null;
  colorModel: string;
  animation: string;
  metadataSignals: readonly string[];
  notes: readonly string[];
  inspectedBytes: number;
  maximumInspectionBytes: number;
  completeFile: boolean;
}

const supportedFormats = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "png",
  "webp",
]);

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.byteLength) return "";
  return new TextDecoder("ascii").decode(bytes.subarray(offset, offset + length));
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function containsAscii(
  bytes: Uint8Array,
  pattern: string,
  start = 0,
  end = bytes.byteLength,
): boolean {
  const limit = Math.min(end, bytes.byteLength) - pattern.length;
  for (let offset = Math.max(0, start); offset <= limit; offset += 1) {
    let matches = true;
    for (let index = 0; index < pattern.length; index += 1) {
      if (bytes[offset + index] !== pattern.charCodeAt(index)) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function noteForWindow(completeFile: boolean): string {
  return completeFile
    ? "The complete source fit inside the fixed image-header inspection ceiling."
    : "Only the fixed-size header prefix was inspected; later metadata or animation frames may exist and complete validation remains in the conversion worker.";
}

function parsePng(bytes: Uint8Array): Omit<ImageSourceInspection, "format" | "notes" | "inspectedBytes" | "maximumInspectionBytes" | "completeFile"> {
  if (
    bytes.byteLength < 33 ||
    bytes[0] !== 0x89 ||
    ascii(bytes, 1, 3) !== "PNG" ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a ||
    ascii(bytes, 12, 4) !== "IHDR"
  ) {
    throw new Error("PNG input is missing a valid signature and IHDR header.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const colorModel =
    ({ 0: "Grayscale", 2: "RGB", 3: "Indexed color", 4: "Grayscale with alpha", 6: "RGBA" } as Record<number, string>)[colorType] ??
    `Unknown color type ${colorType}`;
  let frames: number | null = null;
  const metadata = new Set<string>();
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset, false);
    const end = offset + 12 + length;
    if (end > bytes.byteLength) break;
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL" && length >= 8) frames = view.getUint32(offset + 8, false);
    if (type === "iCCP") metadata.add("ICC profile");
    if (type === "eXIf") metadata.add("EXIF");
    if (type === "pHYs") metadata.add("pixel density");
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") metadata.add("text metadata");
    offset = end;
    if (type === "IDAT" && frames === null) break;
  }
  return {
    width,
    height,
    bitDepth,
    colorModel,
    animation: frames === null ? "Static" : `Animated (${frames.toLocaleString("en-US")} declared frames)`,
    metadataSignals: [...metadata],
  };
}

function parseGif(bytes: Uint8Array, completeFile: boolean): Omit<ImageSourceInspection, "format" | "notes" | "inspectedBytes" | "maximumInspectionBytes" | "completeFile"> {
  const signature = ascii(bytes, 0, 6);
  if (bytes.byteLength < 13 || (signature !== "GIF87a" && signature !== "GIF89a")) {
    throw new Error("GIF input has an invalid logical-screen header.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const packed = bytes[10];
  const colorDepth = (packed & 0x07) + 1;
  let offset = 13;
  if ((packed & 0x80) !== 0) offset += 3 * (2 ** colorDepth);
  let frames = 0;
  let comments = false;
  while (offset < bytes.byteLength) {
    const introducer = bytes[offset++];
    if (introducer === 0x3b) break;
    if (introducer === 0x2c) {
      if (offset + 9 > bytes.byteLength) break;
      const imagePacked = bytes[offset + 8];
      offset += 9;
      if ((imagePacked & 0x80) !== 0) offset += 3 * (2 ** ((imagePacked & 0x07) + 1));
      if (offset >= bytes.byteLength) break;
      offset += 1;
      frames += 1;
    } else if (introducer === 0x21) {
      if (offset >= bytes.byteLength) break;
      comments ||= bytes[offset] === 0xfe;
      offset += 1;
    } else {
      break;
    }
    while (offset < bytes.byteLength) {
      const length = bytes[offset++];
      if (length === 0) break;
      if (offset + length > bytes.byteLength) {
        offset = bytes.byteLength;
        break;
      }
      offset += length;
    }
  }
  const frameDescription = frames <= 1
    ? "Static or one frame found"
    : `${completeFile ? "Animated" : "Animated prefix"} (${frames.toLocaleString("en-US")} frames found)`;
  return {
    width,
    height,
    bitDepth: colorDepth,
    colorModel: "Indexed color",
    animation: frameDescription,
    metadataSignals: comments ? ["comment extension"] : [],
  };
}

function parseBmp(bytes: Uint8Array): Omit<ImageSourceInspection, "format" | "notes" | "inspectedBytes" | "maximumInspectionBytes" | "completeFile"> {
  if (bytes.byteLength < 30 || ascii(bytes, 0, 2) !== "BM") {
    throw new Error("BMP input has an invalid bitmap header.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dibSize = view.getUint32(14, true);
  const core = dibSize === 12;
  const width = core ? view.getUint16(18, true) : Math.abs(view.getInt32(18, true));
  const height = core ? view.getUint16(20, true) : Math.abs(view.getInt32(22, true));
  const bitDepth = view.getUint16(core ? 24 : 28, true);
  const compression = !core && bytes.byteLength >= 34 ? view.getUint32(30, true) : 0;
  return {
    width,
    height,
    bitDepth,
    colorModel: bitDepth <= 8 ? "Indexed color" : bitDepth === 32 ? "BGRA" : "BGR",
    animation: "Static",
    metadataSignals: compression === 0 ? [] : [`BMP compression mode ${compression}`],
  };
}

function parseJpeg(bytes: Uint8Array): Omit<ImageSourceInspection, "format" | "notes" | "inspectedBytes" | "maximumInspectionBytes" | "completeFile"> {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("JPEG input is missing its start marker.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  const metadata = new Set<string>();
  let width = 0;
  let height = 0;
  let bitDepth: number | null = null;
  let components = 0;
  let progressive = false;
  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    while (offset < bytes.byteLength && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) break;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.byteLength) break;
    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > bytes.byteLength) break;
    if (marker === 0xe1 && ascii(bytes, offset + 2, 6).startsWith("Exif")) metadata.add("EXIF");
    if (marker === 0xe2 && ascii(bytes, offset + 2, 11).startsWith("ICC_PROFILE")) metadata.add("ICC profile");
    if (marker === 0xfe) metadata.add("comment");
    if (frameMarkers.has(marker) && length >= 8) {
      bitDepth = bytes[offset + 2];
      height = view.getUint16(offset + 3, false);
      width = view.getUint16(offset + 5, false);
      components = bytes[offset + 7];
      progressive = marker === 0xc2 || marker === 0xca;
      break;
    }
    offset += length;
  }
  if (width < 1 || height < 1) throw new Error("JPEG dimensions were not found inside the bounded header window.");
  return {
    width,
    height,
    bitDepth,
    colorModel: components === 1 ? "Grayscale" : components === 4 ? "CMYK/YCCK" : "YCbCr/RGB",
    animation: progressive ? "Static progressive JPEG" : "Static baseline/extended JPEG",
    metadataSignals: [...metadata],
  };
}

function parseWebp(bytes: Uint8Array, completeFile: boolean): Omit<ImageSourceInspection, "format" | "notes" | "inspectedBytes" | "maximumInspectionBytes" | "completeFile"> {
  if (bytes.byteLength < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    throw new Error("WebP input has an invalid RIFF header.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = ascii(bytes, 12, 4);
  let width = 0;
  let height = 0;
  let colorModel = "YUV";
  let animated = false;
  let alpha = false;
  if (type === "VP8X") {
    const flags = bytes[20];
    animated = (flags & 0x02) !== 0;
    alpha = (flags & 0x10) !== 0;
    width = 1 + u24le(bytes, 24);
    height = 1 + u24le(bytes, 27);
  } else if (type === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    width = view.getUint16(26, true) & 0x3fff;
    height = view.getUint16(28, true) & 0x3fff;
  } else if (type === "VP8L" && bytes[20] === 0x2f) {
    const packed = view.getUint32(21, true);
    width = 1 + (packed & 0x3fff);
    height = 1 + ((packed >>> 14) & 0x3fff);
    alpha = true;
  }
  if (width < 1 || height < 1) throw new Error("WebP dimensions were not found inside the bounded header window.");
  colorModel += alpha ? " with alpha" : "";
  let frames = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const length = view.getUint32(offset + 4, true);
    if (ascii(bytes, offset, 4) === "ANMF") frames += 1;
    const next = offset + 8 + length + (length & 1);
    if (next <= offset || next > bytes.byteLength) break;
    offset = next;
  }
  return {
    width,
    height,
    bitDepth: 8,
    colorModel,
    animation: animated
      ? `${completeFile ? "Animated" : "Animated prefix"} (${frames.toLocaleString("en-US")} frame chunks found)`
      : "Static",
    metadataSignals: [(bytes[20] & 0x08) !== 0 ? "EXIF" : null, (bytes[20] & 0x20) !== 0 ? "ICC profile" : null].filter((value): value is string => value !== null),
  };
}

function parseAvif(bytes: Uint8Array): Omit<ImageSourceInspection, "format" | "notes" | "inspectedBytes" | "maximumInspectionBytes" | "completeFile"> {
  if (bytes.byteLength < 16 || ascii(bytes, 4, 4) !== "ftyp") {
    throw new Error("AVIF input is missing a valid file-type box.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ftypSize = view.getUint32(0, false);
  const brandWindow = Math.min(bytes.byteLength, Math.max(16, ftypSize));
  const animated = ascii(bytes, 8, 4) === "avis" || containsAscii(bytes, "avis", 8, brandWindow);
  let width = 0;
  let height = 0;
  for (let offset = 4; offset + 16 <= bytes.byteLength; offset += 1) {
    if (ascii(bytes, offset, 4) !== "ispe") continue;
    const start = offset - 4;
    const size = view.getUint32(start, false);
    if (size >= 20 && start + size <= bytes.byteLength) {
      width = view.getUint32(offset + 8, false);
      height = view.getUint32(offset + 12, false);
      if (width > 0 && height > 0) break;
    }
  }
  if (width < 1 || height < 1) throw new Error("AVIF dimensions were not found inside the bounded header window.");
  return {
    width,
    height,
    bitDepth: null,
    colorModel: "AV1 image data (exact pixel format validated during conversion)",
    animation: animated ? "Animated AVIF brand" : "Static AVIF brand",
    metadataSignals: [containsAscii(bytes, "Exif") ? "EXIF" : null, containsAscii(bytes, "colr") ? "color properties" : null].filter((value): value is string => value !== null),
  };
}

function parseIco(bytes: Uint8Array): Omit<ImageSourceInspection, "format" | "notes" | "inspectedBytes" | "maximumInspectionBytes" | "completeFile"> {
  if (bytes.byteLength < 22) throw new Error("ICO input is missing its directory header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const reserved = view.getUint16(0, true);
  const type = view.getUint16(2, true);
  const count = view.getUint16(4, true);
  if (reserved !== 0 || type !== 1 || count < 1 || bytes.byteLength < 6 + 16 * count) {
    throw new Error("ICO input has an invalid icon directory.");
  }
  const width = bytes[6] || 256;
  const height = bytes[7] || 256;
  const bitDepth = view.getUint16(12, true) || null;
  return {
    width,
    height,
    bitDepth,
    colorModel: "Icon directory image",
    animation: `Static (${count.toLocaleString("en-US")} icon entries)`,
    metadataSignals: [],
  };
}

export async function inspectImageSource(file: File, format: string): Promise<ImageSourceInspection | null> {
  if (!supportedFormats.has(format)) return null;
  const inspectedBytes = Math.min(file.size, MAX_IMAGE_INSPECTION_BYTES);
  const bytes = new Uint8Array(await file.slice(0, inspectedBytes).arrayBuffer());
  const completeFile = inspectedBytes === file.size;
  const parsed =
    format === "png" || format === "apng"
      ? parsePng(bytes)
      : format === "gif"
        ? parseGif(bytes, completeFile)
        : format === "bmp"
          ? parseBmp(bytes)
          : format === "jpeg"
            ? parseJpeg(bytes)
            : format === "webp"
              ? parseWebp(bytes, completeFile)
              : format === "avif"
                ? parseAvif(bytes)
                : parseIco(bytes);
  if (parsed.width < 1 || parsed.height < 1) throw new Error(`${format.toUpperCase()} dimensions are invalid.`);
  return {
    format: format === "apng" ? "PNG/APNG" : format.toUpperCase(),
    ...parsed,
    notes: [noteForWindow(completeFile)],
    inspectedBytes,
    maximumInspectionBytes: MAX_IMAGE_INSPECTION_BYTES,
    completeFile,
  };
}
