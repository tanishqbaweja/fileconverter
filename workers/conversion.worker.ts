/// <reference lib="webworker" />

import { initWasm as initResvgWasm, Resvg } from "@resvg/resvg-wasm";

import type {
  ConversionMetrics,
  TestFault,
  WorkerRequest,
  WorkerResponse,
} from "../lib/conversion-protocol";
import { runZipArchiveConversion } from "./archive-conversion";
import { runArchiveToSevenZip } from "./archive-to-sevenzip-conversion";
import { runBzip2Conversion } from "./bzip2-compression";
import { runCompressedTarToZip } from "./compressed-tar-conversion";
import {
  runCompressionTranscode,
  type CompressionCodec,
} from "./compressed-tar-transcode";
import { runDocumentConversion } from "./document-conversion";
import { runDocxToText } from "./docx-conversion";
import { runEpubToText } from "./epub-conversion";
import { runOdfConversion } from "./odf-conversion";
import { runPptxToText } from "./pptx-conversion";
import { runXlsxToCsv } from "./xlsx-conversion";
import { runMediaRemux } from "./media-remux";
import {
  runTarToSevenZip,
  runSevenZipToTar,
  runSevenZipToTarBz2,
  runSevenZipToTarGz,
  runSevenZipToTarXz,
  runSevenZipToZip,
} from "./sevenzip-conversion";
import { runXmlToNdjson } from "./xml-conversion";
import { runXzConversion } from "./xz-compression";
import { runZipToCompressedTar } from "./zip-compressed-tar-conversion";
import { runTiffToPng } from "./tiff-conversion";
import {
  createTarValidationStream,
  TarStreamValidator,
} from "./tar-stream-validator";
import {
  asynchronousFileStreamDestination,
  sharedDirectFileDestination,
  syncOpfsDestination,
  type RandomAccessDestination,
} from "./random-access-destination";

const workerScope: DedicatedWorkerGlobalScope = self as never;
const MAX_WRITE_CHUNK = 256 * 1024;
const ARCHIVE_WASM_WRITE_CHUNK = 64 * 1024;
const DIRECT_REMUX_WRITE_CHUNK = 1024 * 1024;
const MAX_TEXT_RECORD = 1024 * 1024;
const MAX_TEXT_COLUMNS = 4_096;
const MAX_GZIP_EXPANSION_RATIO = 100;
const MAX_GZIP_OUTPUT = 64 * 1024 * 1024 * 1024;
const MAX_IMAGE_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 8_388_608;
const MAX_IMAGE_DIMENSION = 8_192;
const MAX_IMAGE_EXPANSION_RATIO = 1_000;
const MAX_IMAGE_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_HEADER_BYTES = 1024 * 1024;
const MAX_SVG_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_SVG_ELEMENTS = 10_000;
const CANCELLATION_YIELD_BYTES = 1024 * 1024;
const RESVG_WASM_URL = "/engines/svg/resvg.wasm";
const AIFF_OUTPUT_PROFILES = new Set([
  "3gp-to-aiff",
  "m4a-to-aiff",
  "aac-to-aiff",
  "amr-to-aiff",
  "mp3-to-aiff",
  "flac-to-aiff",
  "wav-to-aiff",
  "wma-to-aiff",
  "ogg-to-aiff",
  "opus-to-aiff",
]);
const AMR_OUTPUT_PROFILES = new Set([
  "m4a-to-amr",
  "aac-to-amr",
  "mp3-to-amr",
  "flac-to-amr",
  "wav-to-amr",
  "wma-to-amr",
  "aiff-to-amr",
  "ogg-to-amr",
  "opus-to-amr",
]);
const MP3_OUTPUT_PROFILES = new Set([
  "3gp-to-mp3",
  "m4a-to-mp3",
  "aac-to-mp3",
  "amr-to-mp3",
  "flac-to-mp3",
  "wav-to-mp3",
  "wma-to-mp3",
  "aiff-to-mp3",
  "ogg-to-mp3",
  "opus-to-mp3",
]);
const AAC_OUTPUT_PROFILES = new Set([
  "m4a-to-aac",
  "amr-to-aac",
  "mp3-to-aac",
  "flac-to-aac",
  "wav-to-aac",
  "wma-to-aac",
  "aiff-to-aac",
  "ogg-to-aac",
  "opus-to-aac",
]);
const OPUS_OUTPUT_PROFILES = new Set([
  "3gp-to-opus",
  "m4a-to-opus",
  "aac-to-opus",
  "amr-to-opus",
  "mp3-to-opus",
  "flac-to-opus",
  "wav-to-opus",
  "wma-to-opus",
  "aiff-to-opus",
  "ogg-to-opus",
]);
const VORBIS_OUTPUT_PROFILES = new Set([
  "3gp-to-ogg",
  "m4a-to-ogg",
  "aac-to-ogg",
  "amr-to-ogg",
  "mp3-to-ogg",
  "flac-to-ogg",
  "wav-to-ogg",
  "wma-to-ogg",
  "aiff-to-ogg",
  "opus-to-ogg",
]);
const WMA_OUTPUT_PROFILES = new Set([
  "m4a-to-wma",
  "aac-to-wma",
  "mp3-to-wma",
  "aiff-to-wma",
  "ogg-to-wma",
  "opus-to-wma",
  "wav-to-wma",
  "flac-to-wma",
]);
const COMPRESSION_TRANSCODES = {
  "gzip-to-bzip2": { source: "gzip", target: "bzip2", validateTar: false },
  "gzip-to-xz": { source: "gzip", target: "xz", validateTar: false },
  "bzip2-to-gzip": { source: "bzip2", target: "gzip", validateTar: false },
  "bzip2-to-xz": { source: "bzip2", target: "xz", validateTar: false },
  "xz-to-gzip": { source: "xz", target: "gzip", validateTar: false },
  "xz-to-bzip2": { source: "xz", target: "bzip2", validateTar: false },
  "tar-gz-to-tar-bz2": { source: "gzip", target: "bzip2", validateTar: true },
  "tar-gz-to-tar-xz": { source: "gzip", target: "xz", validateTar: true },
  "tar-bz2-to-tar-gz": { source: "bzip2", target: "gzip", validateTar: true },
  "tar-bz2-to-tar-xz": { source: "bzip2", target: "xz", validateTar: true },
  "tar-xz-to-tar-gz": { source: "xz", target: "gzip", validateTar: true },
  "tar-xz-to-tar-bz2": { source: "xz", target: "bzip2", validateTar: true },
} as const satisfies Record<
  string,
  { source: CompressionCodec; target: CompressionCodec; validateTar: boolean }
>;

let activeJobId: string | null = null;
let cancelled = false;
let lastProgressAt = 0;
let lastCancellationYieldBytes = 0;
let resvgInitialization: Promise<void> | null = null;

function post(message: WorkerResponse): void {
  workerScope.postMessage(message);
}

function newMetrics(): ConversionMetrics {
  return {
    inputBytes: 0,
    outputBytes: 0,
    queuedBytes: 0,
    peakQueuedBytes: 0,
    pendingOperations: 0,
    peakPendingOperations: 0,
    maxReadChunkBytes: 0,
    maxWriteChunkBytes: 0,
    elapsedMs: 0,
    wasmMemoryBytes: 0,
    peakWasmMemoryBytes: 0,
    wasmMemories: {},
    sharedArrayBufferBytes: 0,
    activeWorkerCount: 1,
  };
}

function assertActive(): void {
  if (cancelled) {
    throw new DOMException("Conversion cancelled", "AbortError");
  }
}

async function yieldForCancellation(outputBytes: number): Promise<void> {
  if (
    outputBytes - lastCancellationYieldBytes <
    CANCELLATION_YIELD_BYTES
  ) {
    return;
  }
  lastCancellationYieldBytes = outputBytes;
  await new Promise<void>((resolve) => workerScope.setTimeout(resolve, 0));
  assertActive();
}

interface Destination {
  writable: RandomAccessDestination;
  opfsName?: string;
  handlesTestFault?: boolean;
}

function faultMessage(fault: Exclude<TestFault, "worker-crash">): Error {
  if (fault === "quota") {
    return new DOMException(
      "The destination ran out of quota after a bounded write.",
      "QuotaExceededError",
    );
  }
  if (fault === "permission") {
    return new DOMException(
      "Destination permission was revoked after a bounded write.",
      "NotAllowedError",
    );
  }
  return new Error("The destination rejected a bounded write.");
}

function injectDestinationFault(
  writable: RandomAccessDestination,
  fault: Exclude<TestFault, "worker-crash">,
): RandomAccessDestination {
  let injected = false;
  const failOnce = () => {
    if (injected) return;
    injected = true;
    throw faultMessage(fault);
  };
  const wrapper: RandomAccessDestination = {
    requiresOwnedWriteBuffer: writable.requiresOwnedWriteBuffer,
    async write(operation) {
      await writable.write(operation);
      failOnce();
    },
    async truncate(size) {
      await writable.truncate(size);
    },
    async close() {
      await writable.close();
    },
    async abort(reason) {
      await writable.abort(reason);
    },
  };
  if (writable.writeSync) {
    wrapper.writeSync = (operation) => {
      const written = writable.writeSync!(operation);
      if (written) failOnce();
      return written;
    };
  }
  if (writable.rotate) wrapper.rotate = () => writable.rotate!();
  if (writable.truncateSync) {
    wrapper.truncateSync = (size) => writable.truncateSync!(size);
  }
  if (writable.flush) wrapper.flush = () => writable.flush!();
  return wrapper;
}

async function openDestination(
  destination:
    | { mode: "handle"; handle: FileSystemFileHandle }
    | { mode: "opfs-test"; name: string },
  preferSynchronousOpfs = false,
  testFault?: TestFault,
  directWriteBytes = MAX_WRITE_CHUNK,
): Promise<Destination> {
  if (destination.mode === "handle") {
    if (
      workerScope.crossOriginIsolated &&
      typeof SharedArrayBuffer === "function" &&
      typeof Atomics.wait === "function"
    ) {
      return {
        writable: await sharedDirectFileDestination(
          destination.handle,
          testFault === "worker-crash" ? undefined : testFault,
          directWriteBytes,
        ),
        handlesTestFault: testFault !== undefined && testFault !== "worker-crash",
      };
    }
    const writable = await destination.handle.createWritable({
      keepExistingData: false,
    });
    await writable.truncate(0);
    return { writable: asynchronousFileStreamDestination(writable) };
  }

  const root = await withTimeout(
    navigator.storage.getDirectory(),
    10_000,
    "Private browser storage did not open within 10 seconds.",
  );
  const handle = await root.getFileHandle(destination.name, { create: true });
  if (preferSynchronousOpfs && handle.createSyncAccessHandle) {
    const access = await handle.createSyncAccessHandle();
    access.truncate(0);
    return {
      writable: syncOpfsDestination(
        access,
        handle,
        root,
        destination.name,
      ),
      opfsName: destination.name,
    };
  }
  const writable = await handle.createWritable({ keepExistingData: false });
  await writable.truncate(0);
  return {
    writable: asynchronousFileStreamDestination(writable, async () => {
      await root.removeEntry(destination.name).catch(() => {});
    }),
    opfsName: destination.name,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = self.setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    self.clearTimeout(timer);
  }
}

function updateElapsed(metrics: ConversionMetrics, startedAt: number): void {
  metrics.elapsedMs = performance.now() - startedAt;
}

function emitProgress(
  jobId: string,
  phase: string,
  metrics: ConversionMetrics,
  startedAt: number,
  force = false,
): void {
  const now = performance.now();
  if (!force && now - lastProgressAt < 125) return;
  lastProgressAt = now;
  updateElapsed(metrics, startedAt);
  post({ type: "progress", jobId, phase, metrics: { ...metrics } });
}

async function writeBounded(
  destination: RandomAccessDestination,
  chunk: Uint8Array,
  jobId: string,
  phase: string,
  metrics: ConversionMetrics,
  startedAt: number,
  sourceIsOwned = false,
  maximumChunkBytes = MAX_WRITE_CHUNK,
): Promise<void> {
  for (let offset = 0; offset < chunk.byteLength; offset += maximumChunkBytes) {
    assertActive();
    const part = chunk.subarray(
      offset,
      Math.min(offset + maximumChunkBytes, chunk.byteLength),
    );
    metrics.queuedBytes = part.byteLength;
    metrics.peakQueuedBytes = Math.max(
      metrics.peakQueuedBytes,
      metrics.queuedBytes,
    );
    metrics.pendingOperations = 1;
    metrics.peakPendingOperations = Math.max(
      metrics.peakPendingOperations,
      metrics.pendingOperations,
    );
    metrics.maxWriteChunkBytes = Math.max(
      metrics.maxWriteChunkBytes,
      part.byteLength,
    );
    const writeChunk =
      sourceIsOwned && part.buffer instanceof ArrayBuffer
        ? new Uint8Array(part.buffer, part.byteOffset, part.byteLength)
        : part.slice();
    try {
      await destination.write(writeChunk);
      metrics.outputBytes += part.byteLength;
    } finally {
      metrics.queuedBytes = 0;
      metrics.pendingOperations = 0;
    }
    emitProgress(jobId, phase, metrics, startedAt);
    await yieldForCancellation(metrics.outputBytes);
  }
}

function createBoundedTextWriter(
  destination: RandomAccessDestination,
  jobId: string,
  phase: string,
  metrics: ConversionMetrics,
  startedAt: number,
) {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(MAX_WRITE_CHUNK);
  let used = 0;

  const flush = async (): Promise<void> => {
    if (!used) return;
    await writeBounded(
      destination,
      buffer.subarray(0, used),
      jobId,
      phase,
      metrics,
      startedAt,
    );
    used = 0;
  };

  return {
    async write(text: string): Promise<void> {
      let remaining = text;
      while (remaining.length) {
        assertActive();
        const { read, written } = encoder.encodeInto(
          remaining,
          buffer.subarray(used),
        );
        used += written;
        remaining = remaining.slice(read);
        if (used === buffer.byteLength || (read === 0 && remaining.length)) {
          await flush();
        }
      }
    },
    flush,
  };
}

async function runCompression(
  file: File,
  destination: RandomAccessDestination,
  profileId: string,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const decompress =
    profileId === "gzip-decompress" || profileId === "tar-gz-to-tar";
  const validateTar =
    profileId === "tar-to-tar-gz" || profileId === "tar-gz-to-tar";
  const codec = decompress
    ? new DecompressionStream("gzip")
    : new CompressionStream("gzip");
  const codecPair = codec as unknown as ReadableWritablePair<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
  >;
  const tarPair = createTarValidationStream(assertActive);
  const boundedInput = createBoundedFileInput(file, metrics);
  let converted: ReadableStream<Uint8Array<ArrayBuffer>>;
  if (decompress) {
    converted = boundedInput.pipeThrough(codecPair);
    if (validateTar) converted = converted.pipeThrough(tarPair);
  } else {
    const source = validateTar
      ? boundedInput.pipeThrough(tarPair)
      : boundedInput;
    converted = source.pipeThrough(codecPair);
  }
  const reader = converted.getReader();

  for (;;) {
    assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    if (decompress) {
      const projected = metrics.outputBytes + value.byteLength;
      const ratio = projected / Math.max(1, metrics.inputBytes);
      if (
        projected > MAX_GZIP_OUTPUT ||
        (metrics.inputBytes > 1024 * 1024 && ratio > MAX_GZIP_EXPANSION_RATIO)
      ) {
        await reader.cancel("GZIP expansion safety limit exceeded");
        throw new Error(
          `Decompression stopped: output exceeded the ${MAX_GZIP_EXPANSION_RATIO}:1 expansion safety limit.`,
        );
      }
    }
    await writeBounded(
      destination,
      value,
      jobId,
      decompress ? "Decompressing" : "Compressing",
      metrics,
      startedAt,
    );
  }
}

interface WithinImageTrack {
  frameCount: number;
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

const imageMimeTypes: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

interface ImageDimensions {
  width: number;
  height: number;
}

async function readBoundedUtf8(
  file: File,
  metrics: ConversionMetrics,
  jobId: string,
  startedAt: number,
): Promise<string> {
  const reader = createBoundedFileInput(file, metrics, () =>
    emitProgress(jobId, "Inspecting SVG", metrics, startedAt),
  ).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let source = "";
  try {
    for (;;) {
      assertActive();
      const { done, value } = await reader.read();
      if (done) break;
      source += decoder.decode(value, { stream: true });
    }
    source += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return source.replace(/^\uFEFF/, "");
}

function parseSvgLength(value: string | undefined, field: string): number | null {
  if (value == null) return null;
  const match = value.trim().match(
    /^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|in|cm|mm|q|pt|pc)?$/i,
  );
  if (!match) {
    throw new Error(
      `SVG ${field} must be a finite absolute length (px, in, cm, mm, Q, pt, or pc).`,
    );
  }
  const unitScale: Record<string, number> = {
    px: 1,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    q: 96 / 101.6,
    pt: 96 / 72,
    pc: 16,
  };
  const pixels = Number(match[1]) * unitScale[(match[2] ?? "px").toLowerCase()];
  if (!Number.isFinite(pixels) || pixels <= 0) {
    throw new Error(`SVG ${field} must resolve to a positive finite size.`);
  }
  return Math.round(pixels);
}

function parseSvgDimensions(source: string): ImageDimensions {
  if (/\0/.test(source)) {
    throw new Error("SVG input contains a NUL byte.");
  }
  const declaration = source.match(/^\s*<\?xml\b([\s\S]*?)\?>/i);
  if (declaration) {
    const encoding = declaration[1].match(/\bencoding\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (encoding && !/^utf-?8$/i.test(encoding)) {
      throw new Error("SVG input must use UTF-8 encoding.");
    }
  }
  const withoutDeclaration = declaration
    ? source.slice(declaration[0].length)
    : source;
  if (/<\?/.test(withoutDeclaration)) {
    throw new Error("SVG processing instructions are not accepted.");
  }
  const withoutComments = withoutDeclaration.replace(/<!--[\s\S]*?-->/g, "");
  if (/<!--|-->/.test(withoutComments)) {
    throw new Error("SVG input contains an unterminated comment.");
  }
  if (/<!\s*(?:doctype|entity)|<!\[cdata\[/i.test(withoutComments)) {
    throw new Error("SVG DTDs, entities, and CDATA sections are not accepted.");
  }
  const root = withoutComments.match(/^\s*<svg\b([^>]*)>/i);
  if (!root || !/<\/svg\s*>\s*$/i.test(withoutComments)) {
    throw new Error("SVG input must contain one complete, unprefixed svg root element.");
  }

  const disallowedElement = /<\s*\/?\s*(?:script|style|foreignObject|iframe|object|embed|image|use|a|audio|video|link|cursor|filter|mask|animate|animateMotion|animateTransform|set|mpath|text|tspan|textPath)\b/i;
  if (disallowedElement.test(withoutComments)) {
    throw new Error(
      "SVG scripts, CSS, external-resource, animation, filter, and masking elements are not accepted.",
    );
  }
  if (
    /\b(?:href|xlink:href|src|poster|style|xml:base)\s*=/i.test(withoutComments) ||
    /\bon[a-z0-9_.:-]*\s*=/i.test(withoutComments) ||
    /@import/i.test(withoutComments)
  ) {
    throw new Error("SVG external references, inline CSS, and event handlers are not accepted.");
  }
  for (const match of withoutComments.matchAll(/url\s*\(\s*([^)]+?)\s*\)/gi)) {
    const reference = match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (!/^#[A-Za-z_][\w.:-]*$/.test(reference)) {
      throw new Error("SVG paint URLs must be local fragment references.");
    }
  }
  const elements = [
    ...withoutComments.matchAll(/<\s*([A-Za-z_][\w:.-]*)\b/g),
  ];
  if (elements.some((match) => match[1].includes(":"))) {
    throw new Error("SVG namespace-prefixed elements are not accepted.");
  }
  if (elements.length > MAX_SVG_ELEMENTS) {
    throw new Error(`SVG input exceeds the ${MAX_SVG_ELEMENTS.toLocaleString()}-element safety limit.`);
  }

  const attribute = (name: string) =>
    root[1].match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2];
  const width = parseSvgLength(attribute("width"), "width");
  const height = parseSvgLength(attribute("height"), "height");
  if ((width == null) !== (height == null)) {
    throw new Error("SVG width and height must either both be present or both be omitted.");
  }
  const dimensions = { width: width ?? 300, height: height ?? 150 };
  const pixels = dimensions.width * dimensions.height;
  if (
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION ||
    pixels > MAX_IMAGE_PIXELS
  ) {
    throw new Error(
      "SVG dimensions exceed the 8,192-pixel edge or 8-megapixel decoded safety limit.",
    );
  }
  return dimensions;
}

async function readImageHeader(
  file: File,
  metrics: ConversionMetrics,
): Promise<Uint8Array> {
  const limit = Math.min(file.size, MAX_IMAGE_HEADER_BYTES);
  const bytes = new Uint8Array(limit);
  const reader = file
    .slice(0, limit)
    .stream()
    .getReader({ mode: "byob" });
  let readBuffer = new Uint8Array(MAX_WRITE_CHUNK);
  let offset = 0;
  try {
    while (offset < limit) {
      assertActive();
      const { done, value } = await reader.read(readBuffer);
      if (done) break;
      metrics.maxReadChunkBytes = Math.max(
        metrics.maxReadChunkBytes,
        value.byteLength,
      );
      const count = Math.min(value.byteLength, limit - offset);
      bytes.set(value.subarray(0, count), offset);
      offset += count;
      readBuffer = nextByobBuffer(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return offset === bytes.byteLength ? bytes : bytes.slice(0, offset);
}

function parseImageDimensions(
  format: string,
  bytes: Uint8Array,
): ImageDimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;

  if (format === "png") {
    if (
      bytes.byteLength < 24 ||
      bytes[0] !== 0x89 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x4e ||
      bytes[3] !== 0x47 ||
      bytes[12] !== 0x49 ||
      bytes[13] !== 0x48 ||
      bytes[14] !== 0x44 ||
      bytes[15] !== 0x52
    ) {
      throw new Error("PNG input is missing a valid IHDR header.");
    }
    width = view.getUint32(16, false);
    height = view.getUint32(20, false);
  } else if (format === "gif") {
    const signature = new TextDecoder("ascii").decode(bytes.subarray(0, 6));
    if (
      bytes.byteLength < 10 ||
      (signature !== "GIF87a" && signature !== "GIF89a")
    ) {
      throw new Error("GIF input has an invalid logical-screen header.");
    }
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
  } else if (format === "bmp") {
    if (
      bytes.byteLength < 26 ||
      bytes[0] !== 0x42 ||
      bytes[1] !== 0x4d
    ) {
      throw new Error("BMP input has an invalid bitmap header.");
    }
    width = Math.abs(view.getInt32(18, true));
    height = Math.abs(view.getInt32(22, true));
  } else if (format === "jpeg") {
    if (
      bytes.byteLength < 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8
    ) {
      throw new Error("JPEG input is missing its start marker.");
    }
    const frameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
      0xce, 0xcf,
    ]);
    let offset = 2;
    while (offset + 3 < bytes.byteLength) {
      while (offset < bytes.byteLength && bytes[offset] !== 0xff) offset += 1;
      while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.byteLength) break;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > bytes.byteLength) break;
      const length = view.getUint16(offset, false);
      if (length < 2 || offset + length > bytes.byteLength) break;
      if (frameMarkers.has(marker)) {
        if (length < 7) break;
        height = view.getUint16(offset + 3, false);
        width = view.getUint16(offset + 5, false);
        break;
      }
      offset += length;
    }
  } else if (format === "webp") {
    const ascii = (offset: number, length: number) =>
      new TextDecoder("ascii").decode(bytes.subarray(offset, offset + length));
    if (
      bytes.byteLength < 30 ||
      ascii(0, 4) !== "RIFF" ||
      ascii(8, 4) !== "WEBP"
    ) {
      throw new Error("WebP input has an invalid RIFF header.");
    }
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") {
      width =
        1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height =
        1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (
      chunk === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const packed = view.getUint32(21, true);
      width = 1 + (packed & 0x3fff);
      height = 1 + ((packed >>> 14) & 0x3fff);
    }
  } else if (format === "avif") {
    for (let offset = 4; offset + 16 <= bytes.byteLength; offset += 1) {
      if (
        bytes[offset] === 0x69 &&
        bytes[offset + 1] === 0x73 &&
        bytes[offset + 2] === 0x70 &&
        bytes[offset + 3] === 0x65
      ) {
        const boxStart = offset - 4;
        const boxSize = view.getUint32(boxStart, false);
        if (boxSize >= 20 && boxStart + boxSize <= bytes.byteLength) {
          width = view.getUint32(offset + 8, false);
          height = view.getUint32(offset + 12, false);
          if (width > 0 && height > 0) break;
        }
      }
    }
  }

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error(
      `${format.toUpperCase()} dimensions were not found inside the bounded 1 MiB header window.`,
    );
  }
  return { width, height };
}

function nextByobBuffer(value: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (value.buffer.byteLength >= MAX_WRITE_CHUNK) {
    return new Uint8Array(value.buffer, 0, MAX_WRITE_CHUNK);
  }
  return new Uint8Array(MAX_WRITE_CHUNK);
}

function createBoundedFileInput(
  file: Blob,
  metrics: ConversionMetrics,
  onChunk?: () => void,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const reader = file.stream().getReader({ mode: "byob" });
  let readBuffer = new Uint8Array(MAX_WRITE_CHUNK);
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        assertActive();
        const { done, value } = await reader.read(readBuffer);
        if (done) {
          controller.close();
          return;
        }
        const owned = new Uint8Array(value.byteLength);
        owned.set(value);
        metrics.inputBytes += owned.byteLength;
        metrics.maxReadChunkBytes = Math.max(
          metrics.maxReadChunkBytes,
          owned.byteLength,
        );
        onChunk?.();
        readBuffer = nextByobBuffer(value);
        controller.enqueue(owned);
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => {});
      },
    },
    { highWaterMark: 1 },
  );
}

function createBoundedImageInput(
  file: File,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  return createBoundedFileInput(file, metrics, () =>
    emitProgress(jobId, "Inspecting image", metrics, startedAt),
  );
}

async function writeBmpCanvas(
  context: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowStride * height;
  const fileBytes = 54 + pixelBytes;
  if (fileBytes > MAX_IMAGE_OUTPUT_BYTES) {
    throw new Error("Encoded BMP exceeds the 64 MiB output safety limit.");
  }
  const header = new Uint8Array(54);
  const view = new DataView(header.buffer);
  header[0] = 0x42;
  header[1] = 0x4d;
  view.setUint32(2, fileBytes, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2_835, true);
  view.setInt32(42, 2_835, true);
  await writeBounded(
    destination,
    header,
    jobId,
    "Writing BMP",
    metrics,
    startedAt,
  );

  const stripeRows = Math.max(
    1,
    Math.min(64, Math.floor(MAX_WRITE_CHUNK / (width * 4))),
  );
  const bgr = new Uint8Array(rowStride * stripeRows);
  for (let y = 0; y < height; y += stripeRows) {
    assertActive();
    const rows = Math.min(stripeRows, height - y);
    const rgba = context.getImageData(0, y, width, rows).data;
    bgr.fill(0, 0, rowStride * rows);
    for (let row = 0; row < rows; row += 1) {
      const rgbaRow = row * width * 4;
      const bgrRow = row * rowStride;
      for (let x = 0; x < width; x += 1) {
        const source = rgbaRow + x * 4;
        const target = bgrRow + x * 3;
        const alpha = rgba[source + 3];
        const inverse = 255 - alpha;
        bgr[target] = Math.round(
          (rgba[source + 2] * alpha + 255 * inverse) / 255,
        );
        bgr[target + 1] = Math.round(
          (rgba[source + 1] * alpha + 255 * inverse) / 255,
        );
        bgr[target + 2] = Math.round(
          (rgba[source] * alpha + 255 * inverse) / 255,
        );
      }
    }
    await writeBounded(
      destination,
      bgr.subarray(0, rowStride * rows),
      jobId,
      "Writing BMP",
      metrics,
      startedAt,
    );
  }
}

function createIcoHeader(
  width: number,
  height: number,
  payloadBytes: number,
): Uint8Array<ArrayBuffer> {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 256 ||
    height > 256 ||
    !Number.isSafeInteger(payloadBytes) ||
    payloadBytes < 1 ||
    payloadBytes > 0xffff_ffff - 22
  ) {
    throw new Error("ICO dimensions or PNG payload exceed the bounded ICO profile.");
  }
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  header[6] = width === 256 ? 0 : width;
  header[7] = height === 256 ? 0 : height;
  header[8] = 0;
  header[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, payloadBytes, true);
  view.setUint32(18, header.byteLength, true);
  return header;
}

async function runSvgToPng(
  file: File,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  if (file.size < 1 || file.size > MAX_SVG_INPUT_BYTES) {
    throw new Error("SVG input must be between 1 byte and the 4 MiB safety limit.");
  }
  const source = await readBoundedUtf8(file, metrics, jobId, startedAt);
  const expected = parseSvgDimensions(source);
  let renderer: InstanceType<typeof Resvg> | null = null;
  let rendered: ReturnType<InstanceType<typeof Resvg>["render"]> | null = null;
  try {
    resvgInitialization ??= initResvgWasm(fetch(RESVG_WASM_URL));
    await resvgInitialization;
    emitProgress(jobId, "Rasterizing SVG", metrics, startedAt, true);
    renderer = new Resvg(source, {
      fitTo: { mode: "original" },
      font: { loadSystemFonts: false },
      shapeRendering: 2,
      textRendering: 2,
      imageRendering: 0,
    });
    if (
      renderer.width !== expected.width ||
      renderer.height !== expected.height ||
      renderer.width * renderer.height > MAX_IMAGE_PIXELS
    ) {
      throw new Error(
        `SVG raster dimensions ${renderer.width}\u00d7${renderer.height} do not match the bounded ${expected.width}\u00d7${expected.height} inspection.`,
      );
    }
    emitProgress(jobId, "Encoding PNG", metrics, startedAt, true);
    rendered = renderer.render();
    if (rendered.width !== expected.width || rendered.height !== expected.height) {
      throw new Error("The SVG renderer returned unexpected output dimensions.");
    }
    const output = rendered.asPng();
    if (output.byteLength < 1 || output.byteLength > MAX_IMAGE_OUTPUT_BYTES) {
      throw new Error("Encoded SVG raster exceeds the 64 MiB output safety limit.");
    }
    for (let offset = 0; offset < output.byteLength; offset += MAX_WRITE_CHUNK) {
      assertActive();
      await writeBounded(
        destination,
        output.subarray(offset, Math.min(offset + MAX_WRITE_CHUNK, output.byteLength)),
        jobId,
        "Writing PNG",
        metrics,
        startedAt,
      );
    }
    metrics.inputBytes = file.size;
  } finally {
    rendered?.free();
    renderer?.free();
  }
}

async function runImageConversion(
  profileId: string,
  file: File,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error("Image input exceeds the 64 MiB compressed-data safety limit.");
  }
  const [inputFormat, outputFormat] = profileId.split("-to-");
  const inputMime = imageMimeTypes[inputFormat];
  const outputMime = imageMimeTypes[outputFormat];
  if (!inputMime || !outputMime) {
    throw new Error("This bounded image route is not installed.");
  }
  const Decoder = (
    globalThis as unknown as { ImageDecoder?: WithinImageDecoderConstructor }
  ).ImageDecoder;
  if (!Decoder || typeof OffscreenCanvas !== "function") {
    throw new Error(
      "This browser does not provide the ImageDecoder and OffscreenCanvas APIs required by this route.",
    );
  }
  if (
    Decoder.isTypeSupported &&
    !(await Decoder.isTypeSupported(inputMime))
  ) {
    throw new Error(
      `This browser does not provide an ImageDecoder for ${inputMime}.`,
    );
  }
  const header = await readImageHeader(file, metrics);
  const dimensions = parseImageDimensions(inputFormat, header);
  const codedPixels = dimensions.width * dimensions.height;
  const decodedBytes = codedPixels * 4;
  if (
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION ||
    codedPixels > MAX_IMAGE_PIXELS
  ) {
    throw new Error(
      "Image dimensions exceed the 8,192-pixel edge or 8-megapixel decoded safety limit.",
    );
  }
  if (decodedBytes / Math.max(1, file.size) > MAX_IMAGE_EXPANSION_RATIO) {
    throw new Error(
      "Image decompression ratio exceeds the 1,000:1 safety limit.",
    );
  }

  const countedInput = createBoundedImageInput(
    file,
    jobId,
    metrics,
    startedAt,
  );
  const decoder = new Decoder({
    type: inputMime,
    data: countedInput,
    colorSpaceConversion: "none",
    desiredWidth: dimensions.width,
    desiredHeight: dimensions.height,
    preferAnimation: false,
  });
  let frame: VideoFrame | null = null;
  let canvas: OffscreenCanvas | null = null;
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track) {
      throw new Error("The browser could not identify a decodable image track.");
    }
    if (track.frameCount > 1) {
      post({
        type: "warning",
        jobId,
        message:
          "This still-image route converts only the first animation frame.",
      });
    }
    if (outputFormat === "jpeg") {
      post({
        type: "warning",
        jobId,
        message:
          "JPEG cannot preserve transparency; transparent pixels are composited over white.",
      });
    }
    if (outputFormat === "bmp") {
      post({
        type: "warning",
        jobId,
        message:
          "BMP output uses 24-bit color; transparent pixels are composited over white.",
      });
    }

    const decoded = await decoder.decode({
      frameIndex: 0,
      completeFramesOnly: true,
    });
    if (!decoded.complete) {
      decoded.image.close();
      throw new Error("The browser returned an incomplete image frame.");
    }
    frame = decoded.image;
    const width = frame.displayWidth;
    const height = frame.displayHeight;
    metrics.imageFrameFormat = frame.format;
    metrics.imageColorSpace = {
      primaries: frame.colorSpace.primaries,
      transfer: frame.colorSpace.transfer,
      matrix: frame.colorSpace.matrix,
      fullRange: frame.colorSpace.fullRange,
    };
    if (
      width < 1 ||
      height < 1 ||
      width > MAX_IMAGE_DIMENSION ||
      height > MAX_IMAGE_DIMENSION ||
      width * height > MAX_IMAGE_PIXELS
    ) {
      throw new Error("Decoded image dimensions exceed the bounded image budget.");
    }
    const rgba = new Uint8Array(width * height * 4);
    await frame.copyTo(rgba, {
      format: "RGBA",
      layout: [{ offset: 0, stride: width * 4 }],
    });
    frame.close();
    frame = null;
    if (outputFormat === "jpeg" || outputFormat === "bmp") {
      for (let offset = 0; offset < rgba.byteLength; offset += 4) {
        const alpha = rgba[offset + 3];
        const inverseAlpha = 255 - alpha;
        rgba[offset] = Math.floor(
          (rgba[offset] * alpha + 255 * inverseAlpha + 127) / 255,
        );
        rgba[offset + 1] = Math.floor(
          (rgba[offset + 1] * alpha + 255 * inverseAlpha + 127) / 255,
        );
        rgba[offset + 2] = Math.floor(
          (rgba[offset + 2] * alpha + 255 * inverseAlpha + 127) / 255,
        );
        rgba[offset + 3] = 255;
      }
    }
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: true,
    });
    if (!context) {
      throw new Error("The browser could not create a bounded image surface.");
    }
    context.putImageData(
      new ImageData(new Uint8ClampedArray(rgba.buffer), width, height),
      0,
      0,
    );
    if (outputFormat === "bmp") {
      emitProgress(jobId, "Encoding tiled BMP", metrics, startedAt, true);
      await writeBmpCanvas(
        context,
        width,
        height,
        destination,
        jobId,
        metrics,
        startedAt,
      );
      metrics.inputBytes = file.size;
      return;
    }
    if (outputFormat === "ico" && (width > 256 || height > 256)) {
      const scale = Math.min(256 / width, 256 / height);
      const iconWidth = Math.max(1, Math.round(width * scale));
      const iconHeight = Math.max(1, Math.round(height * scale));
      const iconCanvas = new OffscreenCanvas(iconWidth, iconHeight);
      const iconContext = iconCanvas.getContext("2d", { alpha: true });
      if (!iconContext) {
        throw new Error("The browser could not create the bounded ICO surface.");
      }
      iconContext.imageSmoothingEnabled = true;
      iconContext.imageSmoothingQuality = "high";
      iconContext.drawImage(canvas, 0, 0, iconWidth, iconHeight);
      canvas.width = 1;
      canvas.height = 1;
      canvas = iconCanvas;
      post({
        type: "warning",
        jobId,
        message: `ICO output is limited to 256 pixels per edge; this image was scaled to ${iconWidth}\u00d7${iconHeight}.`,
      });
    }
    emitProgress(jobId, "Encoding image", metrics, startedAt, true);
    const output = await canvas.convertToBlob({
      type: outputFormat === "ico" ? "image/png" : outputMime,
      quality:
        outputFormat === "png" || outputFormat === "ico" ? undefined : 0.9,
    });
    const containerBytes = output.size + (outputFormat === "ico" ? 22 : 0);
    if (output.size < 1 || containerBytes > MAX_IMAGE_OUTPUT_BYTES) {
      throw new Error("Encoded image exceeds the 64 MiB output safety limit.");
    }
    if (outputFormat === "ico") {
      await writeBounded(
        destination,
        createIcoHeader(canvas.width, canvas.height, output.size),
        jobId,
        "Writing ICO header",
        metrics,
        startedAt,
      );
    }
    const reader = output.stream().getReader();
    for (;;) {
      assertActive();
      const { done, value } = await reader.read();
      if (done) break;
      await writeBounded(
        destination,
        value,
        jobId,
        outputFormat === "ico" ? "Writing ICO image" : "Writing image",
        metrics,
        startedAt,
      );
    }
    metrics.inputBytes = file.size;
  } finally {
    frame?.close();
    decoder.close();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

async function* readLines(
  file: File,
  metrics: ConversionMetrics,
): AsyncGenerator<string> {
  const reader = createBoundedFileInput(file, metrics).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let carry = "";
  let firstChunk = true;

  for (;;) {
    assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    let decoded = decoder.decode(value, { stream: true });
    if (firstChunk) {
      decoded = decoded.replace(/^\uFEFF/, "");
      firstChunk = false;
    }
    carry += decoded;
    let newline = carry.indexOf("\n");
    while (newline >= 0) {
      const line = carry.slice(0, newline).replace(/\r$/, "");
      carry = carry.slice(newline + 1);
      if (line.length > MAX_TEXT_RECORD) {
        throw new Error("A text line exceeds the 1 MiB safety limit.");
      }
      yield line;
      newline = carry.indexOf("\n");
    }
    if (carry.length > MAX_TEXT_RECORD) {
      throw new Error("A text line exceeds the 1 MiB safety limit.");
    }
  }

  carry += decoder.decode();
  if (carry.length) {
    const line = carry.replace(/\r$/, "");
    if (line.length > MAX_TEXT_RECORD) {
      throw new Error("A text line exceeds the 1 MiB safety limit.");
    }
    yield line;
  }
}

async function runSubtitles(
  file: File,
  destination: RandomAccessDestination,
  toVtt: boolean,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const writer = createBoundedTextWriter(
    destination,
    jobId,
    "Converting cues",
    metrics,
    startedAt,
  );
  let block: string[] = [];
  let cueNumber = 0;
  let inVttHeader = !toVtt;
  let vttHeaderSeen = toVtt;
  let warnedCueSettings = false;

  if (toVtt) {
    await writer.write("WEBVTT\r\n\r\n");
  }

  const flushBlock = async (): Promise<void> => {
    if (!block.length) return;
    const chars = block.reduce((sum, line) => sum + line.length, 0);
    if (chars > MAX_TEXT_RECORD) {
      throw new Error("A subtitle cue exceeds the 1 MiB safety limit.");
    }

    let output: string;
    if (toVtt) {
      const lines = [...block];
      if (/^\d+$/.test(lines[0] ?? "")) lines.shift();
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) {
        throw new Error("Invalid SRT cue: timing line is missing.");
      }
      lines[timingIndex] = normalizeCueTiming(lines[timingIndex], true).timing;
      cueNumber += 1;
      output = `${lines.join("\r\n")}\r\n\r\n`;
    } else {
      const lines = [...block];
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) {
        block = [];
        return;
      }
      const normalized = normalizeCueTiming(lines[timingIndex], false);
      const timing = normalized.timing;
      if (normalized.hadSettings && !warnedCueSettings) {
        warnedCueSettings = true;
        post({
          type: "warning",
          jobId,
          message:
            "WebVTT cue positioning and region settings are not representable in SRT and were removed.",
        });
      }
      const payload = lines.slice(timingIndex + 1);
      cueNumber += 1;
      output = `${cueNumber}\r\n${timing}\r\n${payload.join("\r\n")}\r\n\r\n`;
    }
    block = [];
    await writer.write(output);
  };

  for await (const line of readLines(file, metrics)) {
    assertActive();
    if (!vttHeaderSeen) {
      if (!/^WEBVTT(?:[ \t].*)?$/.test(line.trim())) {
        throw new Error("WebVTT input is missing its WEBVTT header.");
      }
      vttHeaderSeen = true;
      continue;
    }
    if (inVttHeader) {
      if (line.trim() === "") inVttHeader = false;
      continue;
    }
    if (line.trim() === "") {
      await flushBlock();
    } else {
      block.push(line);
    }
  }
  await flushBlock();
  if (cueNumber === 0) {
    throw new Error(`No valid ${toVtt ? "SRT" : "WebVTT"} cues were found.`);
  }
  await writer.flush();
}

function normalizeCueTiming(
  line: string,
  srtInput: boolean,
): {
  timing: string;
  hadSettings: boolean;
  startMilliseconds: number;
  endMilliseconds: number;
} {
  const match = line
    .trim()
    .match(/^(\S+)\s+-->\s+(\S+)(?:\s+(.+))?$/);
  if (!match) {
    throw new Error("Subtitle cue timing is malformed.");
  }
  const start = normalizeCueTimestamp(match[1], srtInput);
  const end = normalizeCueTimestamp(match[2], srtInput);
  if (end.milliseconds <= start.milliseconds) {
    throw new Error("Subtitle cue end time must be later than its start time.");
  }
  return {
    timing: `${start.formatted} --> ${end.formatted}`,
    hadSettings: Boolean(match[3]),
    startMilliseconds: start.milliseconds,
    endMilliseconds: end.milliseconds,
  };
}

async function runTextSubtitleToTtml(
  file: File,
  srtInput: boolean,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const writer = createBoundedTextWriter(
    destination,
    jobId,
    "Writing TTML cues",
    metrics,
    startedAt,
  );
  await writer.write(
    '<?xml version="1.0" encoding="UTF-8"?>\r\n' +
      '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling">\r\n' +
      "  <body><div>\r\n",
  );
  post({
    type: "warning",
    jobId,
    message:
      "Only cue timing, line breaks, basic italic/bold/underline markup, and voice labels are represented in this bounded TTML profile.",
  });

  let block: string[] = [];
  let cueCount = 0;
  let vttHeaderSeen = srtInput;
  let inVttHeader = !srtInput;
  let warnedCueSettings = false;
  const flushBlock = async (): Promise<void> => {
    if (!block.length) return;
    const chars = block.reduce((sum, line) => sum + line.length, 0);
    if (chars > MAX_TEXT_RECORD) {
      throw new Error("A subtitle cue exceeds the 1 MiB safety limit.");
    }
    const lines = [...block];
    block = [];
    if (srtInput && /^\d+$/.test(lines[0] ?? "")) lines.shift();
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) {
      if (!srtInput) return;
      throw new Error("Invalid SRT cue: timing line is missing.");
    }
    const timing = normalizeCueTiming(lines[timingIndex], srtInput);
    if (timing.hadSettings && !warnedCueSettings) {
      warnedCueSettings = true;
      post({
        type: "warning",
        jobId,
        message:
          "WebVTT cue positioning and region settings are not represented in this TTML profile.",
      });
    }
    const payload = lines.slice(timingIndex + 1).join("\n");
    cueCount += 1;
    await writer.write(
      `    <p begin="${formatTtmlTime(timing.startMilliseconds)}" end="${formatTtmlTime(timing.endMilliseconds)}">${subtitleMarkupToTtml(payload)}</p>\r\n`,
    );
  };

  for await (const line of readLines(file, metrics)) {
    assertActive();
    if (!vttHeaderSeen) {
      if (!/^WEBVTT(?:[ \t].*)?$/.test(line.trim())) {
        throw new Error("WebVTT input is missing its WEBVTT header.");
      }
      vttHeaderSeen = true;
      continue;
    }
    if (inVttHeader) {
      if (line.trim() === "") inVttHeader = false;
      continue;
    }
    if (line.trim() === "") {
      await flushBlock();
    } else {
      block.push(line);
    }
  }
  await flushBlock();
  if (!cueCount) {
    throw new Error(`No valid ${srtInput ? "SRT" : "WebVTT"} cues were found.`);
  }
  await writer.write("  </div></body>\r\n</tt>\r\n");
  await writer.flush();
}

const ASS_OUTPUT_HEADER =
  "[Script Info]\r\n" +
  "Title: Converted locally by Within\r\n" +
  "ScriptType: v4.00+\r\n" +
  "WrapStyle: 0\r\n" +
  "ScaledBorderAndShadow: yes\r\n\r\n" +
  "[V4+ Styles]\r\n" +
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\n" +
  "Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\r\n\r\n" +
  "[Events]\r\n" +
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\n";
const ASS_OUTPUT_BATCH_CHARS = 64 * 1024;

async function runTextSubtitleToAss(
  file: File,
  srtInput: boolean,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const writer = createBoundedTextWriter(
    destination,
    jobId,
    "Writing ASS cues",
    metrics,
    startedAt,
  );
  await writer.write(ASS_OUTPUT_HEADER);
  post({
    type: "warning",
    jobId,
    message: srtInput
      ? "ASS uses centisecond timing and a generated default style; cue timing, line breaks, and basic italic, bold, and underline markup are preserved."
      : "ASS uses centisecond timing and a generated default style; WebVTT header metadata, cue identifiers, positioning, regions, CSS classes, and unsupported markup are not represented, while voice labels and basic styling are preserved.",
  });

  let cueCount = 0;
  let vttHeaderSeen = srtInput;
  let warnedCueSettings = false;
  let outputBatch = "";
  const convertBlock = (rawBlock: string): string | null => {
    if (!rawBlock.trim()) return null;
    const lines = rawBlock
      .replace(/\r?\n$/, "")
      .split("\n")
      .map((line) => line.replace(/\r$/, ""));
    for (const line of lines) {
      if (line.length > MAX_TEXT_RECORD) {
        throw new Error("A text line exceeds the 1 MiB safety limit.");
      }
    }
    const chars = lines.reduce((sum, line) => sum + line.length, 0);
    if (chars > MAX_TEXT_RECORD) {
      throw new Error("A subtitle cue exceeds the 1 MiB safety limit.");
    }
    if (!vttHeaderSeen) {
      if (!/^WEBVTT(?:[ \t].*)?$/.test(lines[0]?.trim() ?? "")) {
        throw new Error("WebVTT input is missing its WEBVTT header.");
      }
      vttHeaderSeen = true;
      return null;
    }
    if (srtInput && /^\d+$/.test(lines[0] ?? "")) lines.shift();
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) {
      if (!srtInput) return null;
      throw new Error("Invalid SRT cue: timing line is missing.");
    }
    const timing = normalizeCueTiming(lines[timingIndex], srtInput);
    if (timing.hadSettings && !warnedCueSettings) {
      warnedCueSettings = true;
      post({
        type: "warning",
        jobId,
        message:
          "WebVTT cue positioning and region settings are not represented in this ASS profile.",
      });
    }
    const payload = subtitleMarkupToAss(
      lines.slice(timingIndex + 1).join("\n"),
    );
    const startCentiseconds = Math.round(timing.startMilliseconds / 10);
    const endCentiseconds = Math.max(
      startCentiseconds + 1,
      Math.round(timing.endMilliseconds / 10),
    );
    cueCount += 1;
    return `Dialogue: 0,${formatAssCentiseconds(startCentiseconds)},${formatAssCentiseconds(endCentiseconds)},Default,${payload.speaker},0,0,0,,${payload.text}\r\n`;
  };

  const reader = createBoundedFileInput(file, metrics).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const separator = /\r?\n[ \t]*\r?\n/g;
  let carry = "";
  let firstChunk = true;
  const queueDialogue = (dialogue: string): Promise<void> | null => {
    if (dialogue.length >= ASS_OUTPUT_BATCH_CHARS) {
      if (outputBatch) {
        const buffered = outputBatch;
        outputBatch = "";
        return writer.write(buffered).then(() => writer.write(dialogue));
      }
      return writer.write(dialogue);
    } else if (
      outputBatch.length + dialogue.length >
      ASS_OUTPUT_BATCH_CHARS
    ) {
      const buffered = outputBatch;
      outputBatch = dialogue;
      return writer.write(buffered);
    } else {
      outputBatch += dialogue;
      return null;
    }
  };
  const processBlocks = async (final: boolean): Promise<void> => {
    separator.lastIndex = 0;
    let blockStart = 0;
    for (;;) {
      const match = separator.exec(carry);
      if (!match) break;
      const dialogue = convertBlock(carry.slice(blockStart, match.index));
      const pending = dialogue ? queueDialogue(dialogue) : null;
      if (pending) await pending;
      blockStart = match.index + match[0].length;
    }
    carry = carry.slice(blockStart);
    if (carry.length > MAX_TEXT_RECORD + MAX_WRITE_CHUNK) {
      throw new Error("A subtitle cue exceeds the 1 MiB safety limit.");
    }
    if (final && carry.length) {
      const dialogue = convertBlock(carry);
      carry = "";
      const pending = dialogue ? queueDialogue(dialogue) : null;
      if (pending) await pending;
    }
  };

  for (;;) {
    assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    let decoded = decoder.decode(value, { stream: true });
    if (firstChunk) {
      decoded = decoded.replace(/^\uFEFF/, "");
      firstChunk = false;
    }
    carry += decoded;
    await processBlocks(false);
  }
  carry += decoder.decode();
  await processBlocks(true);
  if (!cueCount) {
    throw new Error(`No valid ${srtInput ? "SRT" : "WebVTT"} cues were found.`);
  }
  if (outputBatch) await writer.write(outputBatch);
  await writer.flush();
}

function formatAssCentiseconds(totalCentiseconds: number): string {
  const hours = Math.floor(totalCentiseconds / 360_000);
  const minutes = Math.floor(totalCentiseconds / 6_000) % 60;
  const seconds = Math.floor(totalCentiseconds / 100) % 60;
  const centiseconds = totalCentiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function subtitleMarkupToAss(value: string): {
  text: string;
  speaker: string;
} {
  let source = value;
  let speaker = "";
  if (!source.includes("<")) {
    return {
      text: escapeAssText(decodeSubtitleEntities(source)),
      speaker,
    };
  }
  const openingVoice = source.match(/^\s*<v\s+([^>]+)>/i);
  if (openingVoice) {
    speaker = sanitizeAssField(openingVoice[1]);
    source = source.slice(openingVoice[0].length).replace(/<\/v\s*>\s*$/i, "");
  }

  const tagPattern = /<[^>]*>/g;
  const closers: Array<{ source: string; output: string }> = [];
  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(tagPattern)) {
    const index = match.index ?? 0;
    output += escapeAssText(
      decodeSubtitleEntities(source.slice(cursor, index)),
    );
    const tag = match[0].trim();
    const simple = tag.toLowerCase();
    if (simple === "<i>" || simple === "<b>" || simple === "<u>") {
      const style = simple[1];
      output += `{\\${style}1}`;
      closers.push({ source: style, output: `{\\${style}0}` });
    } else if (/^<\/[ibu]\s*>$/i.test(tag)) {
      const style = tag[2].toLowerCase();
      if (closers.at(-1)?.source === style) {
        output += closers.pop()?.output ?? "";
      }
    } else if (/^<br\s*\/?>$/i.test(tag)) {
      output += "\\N";
    } else if (!speaker) {
      const voice = tag.match(/^<v\s+([^>]+)>$/i);
      if (voice) speaker = sanitizeAssField(voice[1]);
    }
    cursor = index + match[0].length;
  }
  output += escapeAssText(decodeSubtitleEntities(source.slice(cursor)));
  while (closers.length) output += closers.pop()?.output ?? "";
  return { text: output, speaker };
}

function escapeAssText(value: string): string {
  if (!/[\\{}\r\n]/.test(value)) return value;
  return value
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

function sanitizeAssField(value: string): string {
  return decodeSubtitleEntities(value)
    .replace(/<[^>]*>/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/,/g, " ")
    .trim()
    .slice(0, 256);
}

function subtitleMarkupToTtml(value: string): string {
  const tagPattern = /<[^>]*>/g;
  const closers: Array<{ source: string; output: string }> = [];
  let output = "";
  let cursor = 0;
  for (const match of value.matchAll(tagPattern)) {
    const index = match.index ?? 0;
    output += escapeSubtitleText(
      decodeSubtitleEntities(value.slice(cursor, index)),
    ).replace(/\n/g, "<br/>");
    const tag = match[0].trim();
    const simple = tag.toLowerCase();
    if (simple === "<i>" || simple === "<b>" || simple === "<u>") {
      const source = simple[1];
      const attribute =
        source === "i"
          ? 'tts:fontStyle="italic"'
          : source === "b"
            ? 'tts:fontWeight="bold"'
            : 'tts:textDecoration="underline"';
      output += `<span ${attribute}>`;
      closers.push({ source, output: "</span>" });
    } else if (/^<\/[ibu]\s*>$/i.test(tag)) {
      const source = tag[2].toLowerCase();
      if (closers.at(-1)?.source === source) {
        output += closers.pop()?.output ?? "";
      }
    } else if (/^<br\s*\/?>$/i.test(tag)) {
      output += "<br/>";
    } else {
      const voice = tag.match(/^<v\s+([^>]+)>$/i);
      if (voice) {
        output += `[${escapeSubtitleText(decodeSubtitleEntities(voice[1].trim()))}] `;
      }
    }
    cursor = index + match[0].length;
  }
  output += escapeSubtitleText(
    decodeSubtitleEntities(value.slice(cursor)),
  ).replace(/\n/g, "<br/>");
  while (closers.length) output += closers.pop()?.output ?? "";
  return output;
}

async function runTtmlToTextSubtitle(
  file: File,
  toVtt: boolean,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const writer = createBoundedTextWriter(
    destination,
    jobId,
    "Converting TTML cues",
    metrics,
    startedAt,
  );
  if (toVtt) await writer.write("WEBVTT\r\n\r\n");
  post({
    type: "warning",
    jobId,
    message:
      "TTML regions, animations, metadata, and advanced styles are not representable; basic italic, bold, underline, and line breaks are preserved.",
  });
  let rootSeen = false;
  let cueCount = 0;
  let cue:
    | {
        start: number;
        end: number;
        preserveSpace: boolean;
        parts: string[];
        styles: string[];
        bytes: number;
      }
    | null = null;

  for await (const token of readBoundedXmlTokens(file, metrics)) {
    assertActive();
    if (token.kind === "text") {
      if (!cue) continue;
      const decoded = decodeXmlEntities(token.value);
      const normalized = cue.preserveSpace
        ? decoded.replace(/\r\n?/g, "\n")
        : decoded.replace(/\s+/g, " ");
      cue.bytes += normalized.length;
      if (cue.bytes > MAX_TEXT_RECORD) {
        throw new Error("A TTML cue exceeds the 1 MiB safety limit.");
      }
      cue.parts.push(escapeSubtitleText(normalized));
      continue;
    }
    if (token.kind === "doctype") {
      throw new Error("TTML DTD and entity declarations are not accepted.");
    }
    if (token.kind === "comment" || token.kind === "processing") continue;
    if (token.kind === "cdata") {
      if (cue) {
        cue.bytes += token.value.length;
        if (cue.bytes > MAX_TEXT_RECORD) {
          throw new Error("A TTML cue exceeds the 1 MiB safety limit.");
        }
        cue.parts.push(escapeSubtitleText(token.value));
      }
      continue;
    }

    const parsed = parseXmlTag(token.value);
    const localName = parsed.name.split(":").at(-1)?.toLowerCase();
    if (!parsed.closing && localName === "tt") rootSeen = true;
    if (!parsed.closing && localName === "p") {
      if (!rootSeen) throw new Error("TTML cue appears before its tt root.");
      if (cue) throw new Error("Nested TTML p cues are not accepted.");
      if (parsed.selfClosing) throw new Error("An empty TTML p cue has no duration.");
      const begin = xmlAttributeByLocalName(parsed.attributes, "begin");
      const end = xmlAttributeByLocalName(parsed.attributes, "end");
      const duration = xmlAttributeByLocalName(parsed.attributes, "dur");
      if (!begin || (!end && !duration)) {
        throw new Error("TTML p cues require begin and end or dur timing.");
      }
      const startMilliseconds = parseTtmlTime(begin);
      const endMilliseconds = end
        ? parseTtmlTime(end)
        : startMilliseconds + parseTtmlTime(duration ?? "");
      if (endMilliseconds <= startMilliseconds) {
        throw new Error("TTML cue end time must be later than its start time.");
      }
      cue = {
        start: startMilliseconds,
        end: endMilliseconds,
        preserveSpace:
          xmlAttributeByLocalName(parsed.attributes, "space") === "preserve",
        parts: [],
        styles: [],
        bytes: 0,
      };
      continue;
    }
    if (!cue) continue;
    if (!parsed.closing && localName === "br") {
      cue.parts.push("\n");
      continue;
    }
    if (!parsed.closing && localName === "span") {
      const open: string[] = [];
      const close: string[] = [];
      if (
        xmlAttributeByLocalName(parsed.attributes, "fontStyle")?.toLowerCase() ===
        "italic"
      ) {
        open.push("<i>");
        close.unshift("</i>");
      }
      if (
        xmlAttributeByLocalName(parsed.attributes, "fontWeight")?.toLowerCase() ===
        "bold"
      ) {
        open.push("<b>");
        close.unshift("</b>");
      }
      if (
        xmlAttributeByLocalName(parsed.attributes, "textDecoration")
          ?.toLowerCase()
          .includes("underline")
      ) {
        open.push("<u>");
        close.unshift("</u>");
      }
      cue.parts.push(open.join(""));
      cue.styles.push(close.join(""));
      if (parsed.selfClosing) cue.parts.push(cue.styles.pop() ?? "");
      continue;
    }
    if (parsed.closing && localName === "span") {
      cue.parts.push(cue.styles.pop() ?? "");
      continue;
    }
    if (parsed.closing && localName === "p") {
      while (cue.styles.length) cue.parts.push(cue.styles.pop() ?? "");
      const payload = cue.parts
        .join("")
        .split("\n")
        .map((line) => line.trim())
        .join("\r\n")
        .trim();
      cueCount += 1;
      await writer.write(
        toVtt
          ? `${formatSubtitleTime(cue.start, ".")} --> ${formatSubtitleTime(cue.end, ".")}\r\n${payload}\r\n\r\n`
          : `${cueCount}\r\n${formatSubtitleTime(cue.start, ",")} --> ${formatSubtitleTime(cue.end, ",")}\r\n${payload}\r\n\r\n`,
      );
      cue = null;
    }
  }
  if (cue) throw new Error("TTML input ends inside a p cue.");
  if (!rootSeen) throw new Error("TTML input is missing its tt root.");
  if (!cueCount) throw new Error("No TTML p cues were found.");
  await writer.flush();
}

type XmlToken =
  | { kind: "text" | "tag" | "comment" | "processing" | "cdata"; value: string }
  | { kind: "doctype"; value: string };

async function* readBoundedXmlTokens(
  file: File,
  metrics: ConversionMetrics,
): AsyncGenerator<XmlToken> {
  const reader = createBoundedFileInput(file, metrics).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let first = true;

  const drain = function* (final: boolean): Generator<XmlToken> {
    for (;;) {
      const opening = buffer.indexOf("<");
      if (opening < 0) {
        if (final && buffer) {
          yield { kind: "text", value: buffer };
          buffer = "";
        } else if (buffer.length > MAX_TEXT_RECORD) {
          throw new Error("An XML text node exceeds the 1 MiB safety limit.");
        }
        return;
      }
      if (opening > 0) {
        yield { kind: "text", value: buffer.slice(0, opening) };
        buffer = buffer.slice(opening);
        continue;
      }
      let end = -1;
      let kind: XmlToken["kind"] = "tag";
      if (buffer.startsWith("<!--")) {
        end = buffer.indexOf("-->");
        if (end >= 0) end += 3;
        kind = "comment";
      } else if (buffer.startsWith("<![CDATA[")) {
        end = buffer.indexOf("]]>");
        if (end >= 0) end += 3;
        kind = "cdata";
      } else if (/^<!DOCTYPE\b/i.test(buffer) || /^<!ENTITY\b/i.test(buffer)) {
        end = findXmlTagEnd(buffer);
        kind = "doctype";
      } else if (buffer.startsWith("<?")) {
        end = buffer.indexOf("?>");
        if (end >= 0) end += 2;
        kind = "processing";
      } else {
        end = findXmlTagEnd(buffer);
      }
      if (end < 0) {
        if (buffer.length > MAX_TEXT_RECORD) {
          throw new Error("An XML tag or declaration exceeds the 1 MiB safety limit.");
        }
        if (final) throw new Error("TTML input ends inside XML markup.");
        return;
      }
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end);
      yield {
        kind,
        value:
          kind === "cdata" ? raw.slice("<![CDATA[".length, -3) : raw,
      };
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let text = decoder.decode(value, { stream: true });
    if (first) {
      text = text.replace(/^\uFEFF/, "");
      first = false;
    }
    buffer += text;
    yield* drain(false);
  }
  buffer += decoder.decode();
  yield* drain(true);
}

function findXmlTagEnd(value: string): number {
  let quote = "";
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }
  return -1;
}

function parseXmlTag(value: string): {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attributes: Map<string, string>;
} {
  const match = value.match(
    /^<\s*(\/)?\s*([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*?)(\/)?\s*>$/,
  );
  if (!match) throw new Error("TTML contains malformed XML markup.");
  const closing = Boolean(match[1]);
  const selfClosing = Boolean(match[4]);
  const attributes = new Map<string, string>();
  let remaining = match[3];
  if (closing && remaining.trim()) {
    throw new Error("TTML closing tags cannot contain attributes.");
  }
  while (remaining.trim()) {
    const attribute = remaining.match(
      /^\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/,
    );
    if (!attribute) throw new Error("TTML contains a malformed XML attribute.");
    if (attributes.has(attribute[1])) {
      throw new Error(`TTML repeats the ${attribute[1]} attribute.`);
    }
    attributes.set(
      attribute[1],
      decodeXmlEntities(attribute[3] ?? attribute[4] ?? ""),
    );
    remaining = remaining.slice(attribute[0].length);
  }
  return { name: match[2], closing, selfClosing, attributes };
}

function xmlAttributeByLocalName(
  attributes: Map<string, string>,
  localName: string,
): string | null {
  for (const [name, value] of attributes) {
    if (name.split(":").at(-1)?.toLowerCase() === localName.toLowerCase()) {
      return value;
    }
  }
  return null;
}

function decodeSubtitleEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,
    (entity) => decodeXmlEntities(entity),
  );
}

function decodeXmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  let output = "";
  let cursor = 0;
  for (const match of value.matchAll(/&([^;]+);/g)) {
    const index = match.index ?? 0;
    const prefix = value.slice(cursor, index);
    if (prefix.includes("&")) {
      throw new Error("TTML contains an unterminated XML entity.");
    }
    output += prefix;
    const body = match[1];
    if (Object.hasOwn(named, body)) {
      output += named[body];
    } else {
      const numeric = /^#x/i.test(body)
        ? Number.parseInt(body.slice(2), 16)
        : body.startsWith("#")
          ? Number.parseInt(body.slice(1), 10)
          : Number.NaN;
      if (
        !Number.isInteger(numeric) ||
        numeric < 0 ||
        numeric > 0x10ffff ||
        (numeric >= 0xd800 && numeric <= 0xdfff)
      ) {
        throw new Error(`Unsupported or invalid XML entity: &${body};`);
      }
      output += String.fromCodePoint(numeric);
    }
    cursor = index + match[0].length;
  }
  const suffix = value.slice(cursor);
  if (suffix.includes("&")) {
    throw new Error("TTML contains an unterminated XML entity.");
  }
  return output + suffix;
}

function parseTtmlTime(value: string): number {
  const clock = value.match(/^(\d{2,}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3]);
    if (minutes > 59 || seconds > 59) {
      throw new Error(`TTML clock time is out of range: ${value}.`);
    }
    const fraction = Number(`0.${clock[4] ?? "0"}`);
    const milliseconds = Math.round(
      ((hours * 60 + minutes) * 60 + seconds + fraction) * 1000,
    );
    if (Number.isSafeInteger(milliseconds)) return milliseconds;
  }
  const offset = value.match(/^(\d+(?:\.\d+)?)(ms|s)$/);
  if (offset) {
    const milliseconds =
      Number(offset[1]) * (offset[2] === "s" ? 1000 : 1);
    if (Number.isSafeInteger(Math.round(milliseconds))) {
      return Math.round(milliseconds);
    }
  }
  throw new Error(
    `Unsupported TTML time expression: ${value}. Use clock time, seconds, or milliseconds.`,
  );
}

function formatTtmlTime(milliseconds: number): string {
  return formatSubtitleTime(milliseconds, ".");
}

function formatSubtitleTime(
  milliseconds: number,
  separator: "." | ",",
): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const seconds = Math.floor(milliseconds / 1_000) % 60;
  const fraction = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(fraction).padStart(3, "0")}`;
}

function normalizeCueTimestamp(
  value: string,
  srtInput: boolean,
): { formatted: string; milliseconds: number } {
  const separator = srtInput ? "," : ".";
  const escapedSeparator = separator === "." ? "\\." : ",";
  const match = value.match(
    new RegExp(`^((?:\\d{2,}:)?\\d{2}):(\\d{2})${escapedSeparator}(\\d{3})$`),
  );
  if (!match) {
    throw new Error(`Invalid subtitle timestamp: ${value}.`);
  }
  const prefix = match[1].split(":").map(Number);
  if (srtInput && prefix.length !== 2) {
    throw new Error(`SRT timestamp must include hours: ${value}.`);
  }
  const hours = prefix.length === 2 ? prefix[0] : 0;
  const minutes = prefix.length === 2 ? prefix[1] : prefix[0];
  const seconds = Number(match[2]);
  const fraction = Number(match[3]);
  if (
    !Number.isSafeInteger(hours) ||
    minutes > 59 ||
    seconds > 59
  ) {
    throw new Error(`Subtitle timestamp is out of range: ${value}.`);
  }
  const milliseconds =
    ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error(`Subtitle timestamp exceeds the safe range: ${value}.`);
  }
  const outputSeparator = srtInput ? "." : ",";
  return {
    formatted: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${outputSeparator}${String(fraction).padStart(3, "0")}`,
    milliseconds,
  };
}

function assCueTime(
  value: string,
  separator: "," | ".",
): { formatted: string; milliseconds: number } {
  const match = value
    .trim()
    .match(/^(\d+):(\d{2}):(\d{2})[.](\d{1,2})$/);
  if (!match) {
    throw new Error(`Invalid ASS cue time: ${value.trim()}`);
  }
  if (Number(match[2]) > 59 || Number(match[3]) > 59) {
    throw new Error(`ASS cue time is out of range: ${value.trim()}`);
  }
  const hours = match[1].padStart(2, "0");
  const milliseconds = match[4].padEnd(2, "0").slice(0, 2) + "0";
  const totalMilliseconds =
    ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) *
      1000 +
    Number(milliseconds);
  if (!Number.isSafeInteger(totalMilliseconds)) {
    throw new Error(`ASS cue time exceeds the safe range: ${value.trim()}`);
  }
  return {
    formatted: `${hours}:${match[2]}:${match[3]}${separator}${milliseconds}`,
    milliseconds: totalMilliseconds,
  };
}

function escapeSubtitleText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function runAssSubtitles(
  file: File,
  destination: RandomAccessDestination,
  toVtt: boolean,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const writer = createBoundedTextWriter(
    destination,
    jobId,
    "Converting ASS dialogue",
    metrics,
    startedAt,
  );
  if (toVtt) await writer.write("WEBVTT\r\n\r\n");
  post({
    type: "warning",
    jobId,
    message:
      "ASS styles, positioning, karaoke, and effects are not representable in this bounded text profile and were removed.",
  });
  let inEvents = false;
  let fields: string[] | null = null;
  let cue = 0;
  for await (const line of readLines(file, metrics)) {
    assertActive();
    const trimmed = line.trim();
    if (/^\[events\]$/i.test(trimmed)) {
      inEvents = true;
      continue;
    }
    if (/^\[.+\]$/.test(trimmed)) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;
    if (/^format\s*:/i.test(trimmed)) {
      fields = trimmed
        .slice(trimmed.indexOf(":") + 1)
        .split(",")
        .map((field) => field.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue\s*:/i.test(trimmed)) continue;
    if (!fields) {
      throw new Error("ASS Events section is missing its Format declaration.");
    }
    let remainder = line.slice(line.indexOf(":") + 1);
    const values: string[] = [];
    for (let index = 0; index < fields.length - 1; index += 1) {
      const comma = remainder.indexOf(",");
      if (comma < 0) {
        throw new Error("ASS Dialogue row has fewer fields than its Format.");
      }
      values.push(remainder.slice(0, comma));
      remainder = remainder.slice(comma + 1);
    }
    values.push(remainder);
    const startIndex = fields.indexOf("start");
    const endIndex = fields.indexOf("end");
    const textIndex = fields.indexOf("text");
    const nameIndex = fields.indexOf("name");
    if (startIndex < 0 || endIndex < 0 || textIndex < 0) {
      throw new Error("ASS Format must include Start, End, and Text fields.");
    }
    const separator = toVtt ? "." : ",";
    const start = assCueTime(values[startIndex], separator);
    const end = assCueTime(values[endIndex], separator);
    if (end.milliseconds <= start.milliseconds) {
      throw new Error("ASS cue end time must be later than its start time.");
    }
    const speaker =
      nameIndex >= 0 ? escapeSubtitleText(values[nameIndex].trim()) : "";
    let text = values[textIndex]
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\[Nn]/g, "\n")
      .replace(/\\h/g, " ");
    text = escapeSubtitleText(text);
    if (speaker) {
      text = toVtt ? `<v ${speaker}>${text}` : `[${speaker}] ${text}`;
    }
    cue += 1;
    await writer.write(
      toVtt
        ? `${start.formatted} --> ${end.formatted}\r\n${text.replace(/\n/g, "\r\n")}\r\n\r\n`
        : `${cue}\r\n${start.formatted} --> ${end.formatted}\r\n${text.replace(/\n/g, "\r\n")}\r\n\r\n`,
    );
  }
  if (!cue) {
    throw new Error("No ASS Dialogue cues were found.");
  }
  await writer.flush();
}

async function* readDelimitedRecords(
  file: File,
  delimiter: string,
  metrics: ConversionMetrics,
): AsyncGenerator<string[]> {
  const reader = createBoundedFileInput(file, metrics).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let skipLf = false;
  let firstChunk = true;

  const recordSize = (): number =>
    field.length + fields.reduce((sum, value) => sum + value.length, 0);

  const consume = function* (text: string): Generator<string[]> {
    for (const char of text) {
      if (skipLf) {
        skipLf = false;
        if (char === "\n") continue;
      }
      if (inQuotes) {
        if (afterQuote) {
          if (char === '"') {
            field += '"';
            afterQuote = false;
            continue;
          }
          inQuotes = false;
          afterQuote = false;
          if (
            char !== delimiter &&
            char !== "\n" &&
            char !== "\r"
          ) {
            throw new Error(
              "Invalid delimited file: unexpected data follows a closing quote.",
            );
          }
        } else if (char === '"') {
          afterQuote = true;
          continue;
        } else {
          field += char;
          if (recordSize() > MAX_TEXT_RECORD) {
            throw new Error("A delimited record exceeds the 1 MiB safety limit.");
          }
          continue;
        }
      }

      if (char === '"') {
        if (field.length !== 0) {
          throw new Error(
            "Invalid delimited file: a quote begins inside an unquoted field.",
          );
        }
        inQuotes = true;
      } else if (char === delimiter) {
        if (fields.length >= MAX_TEXT_COLUMNS - 1) {
          throw new Error(
            `A delimited record exceeds the ${MAX_TEXT_COLUMNS.toLocaleString("en-US")}-column safety limit.`,
          );
        }
        fields.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (fields.length >= MAX_TEXT_COLUMNS) {
          throw new Error(
            `A delimited record exceeds the ${MAX_TEXT_COLUMNS.toLocaleString("en-US")}-column safety limit.`,
          );
        }
        fields.push(field);
        field = "";
        const record = fields;
        fields = [];
        if (char === "\r") skipLf = true;
        yield record;
      } else {
        field += char;
      }
      if (recordSize() > MAX_TEXT_RECORD) {
        throw new Error("A delimited record exceeds the 1 MiB safety limit.");
      }
    }
  };

  for (;;) {
    assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    let decoded = decoder.decode(value, { stream: true });
    if (firstChunk) {
      decoded = decoded.replace(/^\uFEFF/, "");
      firstChunk = false;
    }
    yield* consume(decoded);
  }
  yield* consume(decoder.decode());
  if (inQuotes && !afterQuote) {
    throw new Error("Invalid delimited file: a quoted field is not closed.");
  }
  if (field.length || fields.length) {
    fields.push(field);
    yield fields;
  }
}

function serializeDelimited(values: readonly unknown[], delimiter: string): string {
  return `${values
    .map((value) => {
      const text = value == null ? "" : String(value);
      return text.includes(delimiter) || /["\r\n]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
    })
    .join(delimiter)}\r\n`;
}

function normalizedHeaders(values: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return values.map((value, index) => {
    const base = value.trim() || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

async function runDelimitedInput(
  file: File,
  sourceDelimiter: string,
  output: "csv" | "tsv" | "ndjson" | "json",
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const writer = createBoundedTextWriter(
    destination,
    jobId,
    "Converting records",
    metrics,
    startedAt,
  );
  let headers: string[] | null = null;
  let warnedExtraFields = false;
  let firstJsonRecord = true;
  if (output === "json") await writer.write("[\r\n");
  for await (const record of readDelimitedRecords(
    file,
    sourceDelimiter,
    metrics,
  )) {
    assertActive();
    let text: string;
    if (output === "ndjson" || output === "json") {
      if (!headers) {
        headers = normalizedHeaders(record);
        continue;
      }
      if (!warnedExtraFields && record.length > headers.length) {
        warnedExtraFields = true;
        post({
          type: "warning",
          jobId,
          message:
            "A delimited record contains fields beyond the header width. Extra fields were ignored.",
        });
      }
      const object = Object.fromEntries(
        headers.map((header, index) => [header, record[index] ?? ""]),
      );
      const serialized = JSON.stringify(object);
      if (output === "json") {
        text = `${firstJsonRecord ? "" : ",\r\n"}${serialized}`;
        firstJsonRecord = false;
      } else {
        text = `${serialized}\n`;
      }
    } else {
      text = serializeDelimited(record, output === "csv" ? "," : "\t");
    }
    await writer.write(text);
  }
  if (output === "json") await writer.write("\r\n]\r\n");
  await writer.flush();
}

async function runNdjsonInput(
  file: File,
  outputDelimiter: string,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const writer = createBoundedTextWriter(
    destination,
    jobId,
    "Converting records",
    metrics,
    startedAt,
  );
  let headers: string[] | null = null;
  let warnedExtraKeys = false;

  for await (const line of readLines(file, metrics)) {
    assertActive();
    if (!line.trim()) continue;
    const parsed: unknown = JSON.parse(line);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Each NDJSON line must contain one JSON object.");
    }
    const object = parsed as Record<string, unknown>;
    const keys = Object.keys(object);
    if (keys.length > MAX_TEXT_COLUMNS) {
      throw new Error(
        `An NDJSON object exceeds the ${MAX_TEXT_COLUMNS.toLocaleString("en-US")}-field safety limit.`,
      );
    }
    if (!headers) {
      headers = keys;
      if (!headers.length) {
        throw new Error("The first NDJSON object has no fields.");
      }
      await writer.write(serializeDelimited(headers, outputDelimiter));
    } else if (
      !warnedExtraKeys &&
      keys.some((key) => !headers!.includes(key))
    ) {
      warnedExtraKeys = true;
      post({
        type: "warning",
        jobId,
        message:
          "Later NDJSON objects contain extra keys. They were ignored because output columns are fixed by the first object.",
      });
    }
    const row = headers.map((header) => {
      const value = object[header];
      return value != null && typeof value === "object"
        ? JSON.stringify(value)
        : value;
    });
    await writer.write(serializeDelimited(row, outputDelimiter));
  }
  await writer.flush();
}

async function runNdjsonToJson(
  file: File,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const writer = createBoundedTextWriter(
    destination,
    jobId,
    "Converting records",
    metrics,
    startedAt,
  );
  let first = true;
  await writer.write("[\r\n");
  for await (const line of readLines(file, metrics)) {
    assertActive();
    if (!line.trim()) continue;
    const parsed: unknown = JSON.parse(line);
    await writer.write(
      `${first ? "" : ",\r\n"}${JSON.stringify(parsed)}`,
    );
    first = false;
  }
  await writer.write("\r\n]\r\n");
  await writer.flush();
}

async function runJsonArrayInput(
  file: File,
  output: "ndjson" | "csv" | "tsv",
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const writer = createBoundedTextWriter(
    destination,
    jobId,
    "Converting records",
    metrics,
    startedAt,
  );
  const reader = createBoundedFileInput(file, metrics).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let started = false;
  let ended = false;
  let inValue = false;
  let inString = false;
  let escaped = false;
  let depth = 0;
  let value = "";
  let needsValue = false;
  let headers: string[] | null = null;
  let warnedExtraKeys = false;

  const finishValue = async (): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("JSON array contains an empty element.");
    }
    const parsed: unknown = JSON.parse(trimmed);
    if (output === "ndjson") {
      await writer.write(`${JSON.stringify(parsed)}\n`);
    } else {
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error(
          "Each JSON array element must be an object for delimited output.",
        );
      }
      const object = parsed as Record<string, unknown>;
      const keys = Object.keys(object);
      if (keys.length > MAX_TEXT_COLUMNS) {
        throw new Error(
          `A JSON object exceeds the ${MAX_TEXT_COLUMNS.toLocaleString("en-US")}-field safety limit.`,
        );
      }
      if (!headers) {
        headers = keys;
        if (!headers.length) {
          throw new Error("The first JSON object has no fields.");
        }
        await writer.write(
          serializeDelimited(headers, output === "csv" ? "," : "\t"),
        );
      } else if (
        !warnedExtraKeys &&
        keys.some((key) => !headers!.includes(key))
      ) {
        warnedExtraKeys = true;
        post({
          type: "warning",
          jobId,
          message:
            "Later JSON objects contain extra keys. They were ignored because output columns are fixed by the first object.",
        });
      }
      const row = headers.map((header) => {
        const field = object[header];
        return field != null && typeof field === "object"
          ? JSON.stringify(field)
          : field;
      });
      await writer.write(
        serializeDelimited(row, output === "csv" ? "," : "\t"),
      );
    }
    value = "";
    inValue = false;
    inString = false;
    escaped = false;
    depth = 0;
  };

  const consume = async (text: string): Promise<void> => {
    for (const char of text) {
      assertActive();
      if (!started) {
        if (/\s/.test(char) || char === "\uFEFF") continue;
        if (char !== "[") {
          throw new Error("JSON input must contain one top-level array.");
        }
        started = true;
        continue;
      }
      if (ended) {
        if (!/\s/.test(char)) {
          throw new Error("Unexpected data follows the JSON array.");
        }
        continue;
      }
      if (!inValue) {
        if (/\s/.test(char)) continue;
        if (char === "]") {
          if (needsValue) {
            throw new Error("JSON array cannot end with a trailing comma.");
          }
          ended = true;
          continue;
        }
        if (char === ",") {
          throw new Error("JSON array contains an empty element.");
        }
        inValue = true;
        needsValue = false;
      }

      if (inString) {
        value += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else if (char === '"') {
        value += char;
        inString = true;
      } else if (char === "{" || char === "[") {
        value += char;
        depth += 1;
      } else if (char === "}") {
        value += char;
        depth -= 1;
        if (depth < 0) {
          throw new Error("JSON array contains unbalanced object syntax.");
        }
      } else if (char === "]") {
        if (depth > 0) {
          value += char;
          depth -= 1;
        } else {
          await finishValue();
          ended = true;
        }
      } else if (char === "," && depth === 0) {
        await finishValue();
        needsValue = true;
      } else {
        value += char;
      }

      if (value.length > MAX_TEXT_RECORD) {
        throw new Error("A JSON array element exceeds the 1 MiB safety limit.");
      }
    }
  };

  for (;;) {
    assertActive();
    const { done, value: chunk } = await reader.read();
    if (done) break;
    await consume(decoder.decode(chunk, { stream: true }));
  }
  await consume(decoder.decode());
  if (!started || !ended || inValue || inString || depth !== 0) {
    throw new Error("JSON array is incomplete or malformed.");
  }
  await writer.flush();
}

async function runRecords(
  profileId: string,
  file: File,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const [input, output] = profileId.replace("-to-", ":").split(":");
  if (input === "json") {
    await runJsonArrayInput(
      file,
      output as "ndjson" | "csv" | "tsv",
      destination,
      jobId,
      metrics,
      startedAt,
    );
    return;
  }
  if (input === "ndjson" && output === "json") {
    await runNdjsonToJson(
      file,
      destination,
      jobId,
      metrics,
      startedAt,
    );
    return;
  }
  if (input === "ndjson") {
    await runNdjsonInput(
      file,
      output === "csv" ? "," : "\t",
      destination,
      jobId,
      metrics,
      startedAt,
    );
    return;
  }
  await runDelimitedInput(
    file,
    input === "csv" ? "," : "\t",
    output as "csv" | "tsv" | "ndjson",
    destination,
    jobId,
    metrics,
    startedAt,
  );
}

async function runJob(message: Extract<WorkerRequest, { type: "start" }>) {
  const { jobId, profileId, file } = message;
  const compressionTranscode =
    COMPRESSION_TRANSCODES[
      profileId as keyof typeof COMPRESSION_TRANSCODES
    ];
  activeJobId = jobId;
  cancelled = false;
  lastProgressAt = 0;
  lastCancellationYieldBytes = 0;
  const metrics = newMetrics();
  const startedAt = performance.now();
  let destination: Destination | null = null;

  try {
    emitProgress(jobId, "Worker started", metrics, startedAt, true);
    destination = await openDestination(
      message.destination,
      (profileId === "mkv-to-mp4" ||
        profileId === "mov-to-mp4" ||
        profileId === "3gp-to-mp4" ||
        profileId === "mpeg-ts-to-mp4" ||
        profileId === "flv-to-mp4" ||
        profileId === "avi-to-mp4" ||
        profileId === "h264-to-mp4" ||
        profileId === "mkv-to-h264" ||
        profileId === "mp4-to-h264" ||
        profileId === "mov-to-h264" ||
        profileId === "3gp-to-h264" ||
        profileId === "mpeg-ts-to-h264" ||
        profileId === "flv-to-h264" ||
        profileId === "mkv-to-hevc" ||
        profileId === "mp4-to-hevc" ||
        profileId === "mov-to-hevc" ||
        profileId === "mpeg-ts-to-hevc" ||
        profileId === "mp4-to-mkv" ||
        profileId === "mov-to-mkv" ||
        profileId === "3gp-to-mkv" ||
        profileId === "mpeg-ts-to-mkv" ||
        profileId === "flv-to-mkv" ||
        profileId === "avi-to-mkv" ||
        profileId === "webm-to-mkv" ||
        profileId === "ogv-to-mkv" ||
        profileId === "mkv-to-mpeg-ts" ||
        profileId === "mp4-to-mpeg-ts" ||
        profileId === "mov-to-mpeg-ts" ||
        profileId === "3gp-to-mpeg-ts" ||
        profileId === "flv-to-mpeg-ts" ||
        profileId === "mkv-to-3gp" ||
        profileId === "mp4-to-3gp" ||
        profileId === "mov-to-3gp" ||
        profileId === "mpeg-ts-to-3gp" ||
        profileId === "flv-to-3gp" ||
        profileId === "mkv-to-mov" ||
        profileId === "mp4-to-mov" ||
        profileId === "3gp-to-mov" ||
        profileId === "mpeg-ts-to-mov" ||
        profileId === "flv-to-mov" ||
        profileId === "mkv-to-flv" ||
        profileId === "mp4-to-flv" ||
        profileId === "mov-to-flv" ||
        profileId === "3gp-to-flv" ||
        profileId === "mpeg-ts-to-flv" ||
        profileId === "m2v-to-mpeg-ts" ||
        profileId === "mkv-to-m2v" ||
        profileId === "mp4-to-m2v" ||
        profileId === "mov-to-m2v" ||
        profileId === "avi-to-m2v" ||
        profileId === "mpeg-ts-to-m2v" ||
        profileId === "m4v-to-mp4" ||
        profileId === "mkv-to-m4v" ||
        profileId === "mp4-to-m4v" ||
        profileId === "mov-to-m4v" ||
        profileId === "avi-to-m4v" ||
        profileId === "mkv-to-webm-av1" ||
        profileId === "mkv-to-mp3" ||
        profileId === "mp4-to-mp3" ||
        profileId === "mov-to-mp3" ||
        profileId === "avi-to-mp3" ||
        profileId === "mpeg-ts-to-mp3" ||
        profileId === "flv-to-mp3" ||
        profileId === "mkv-to-aac" ||
        profileId === "mp4-to-aac" ||
        profileId === "mov-to-aac" ||
        profileId === "3gp-to-aac" ||
        profileId === "mpeg-ts-to-aac" ||
        profileId === "flv-to-aac" ||
        profileId === "mkv-to-ogg" ||
        profileId === "webm-to-ogg" ||
        profileId === "ogv-to-ogg" ||
        profileId === "mkv-to-opus" ||
        profileId === "webm-to-opus" ||
        profileId === "mkv-to-m4a" ||
        profileId === "mov-to-m4a" ||
        profileId === "3gp-to-m4a" ||
        profileId === "mpeg-ts-to-m4a" ||
        profileId === "flv-to-m4a" ||
        profileId === "mp4-to-m4a" ||
        profileId === "aac-to-m4a" ||
        profileId === "mkv-to-wav" ||
        profileId === "mov-to-wav" ||
        profileId === "3gp-to-wav" ||
        profileId === "mpeg-ts-to-wav" ||
        profileId === "flv-to-wav" ||
        profileId === "avi-to-wav" ||
        profileId === "ogv-to-wav" ||
        profileId === "mp4-to-wav" ||
        profileId === "m4a-to-wav" ||
        profileId === "aac-to-wav" ||
        profileId === "amr-to-wav" ||
        profileId === "mp3-to-wav" ||
        profileId === "flac-to-wav" ||
        profileId === "wma-to-wav" ||
        profileId === "aiff-to-wav" ||
        profileId === "ogg-to-wav" ||
        profileId === "opus-to-wav" ||
        profileId === "m4a-to-flac" ||
        profileId === "mkv-to-flac" ||
        profileId === "mp4-to-flac" ||
        profileId === "mov-to-flac" ||
        profileId === "3gp-to-flac" ||
        profileId === "mpeg-ts-to-flac" ||
        profileId === "flv-to-flac" ||
        profileId === "avi-to-flac" ||
        profileId === "ogv-to-flac" ||
        profileId === "aac-to-flac" ||
        profileId === "amr-to-flac" ||
        profileId === "mp3-to-flac" ||
        profileId === "wav-to-flac" ||
        profileId === "wma-to-flac" ||
        profileId === "aiff-to-flac" ||
        profileId === "ogg-to-flac" ||
        profileId === "opus-to-flac" ||
        profileId === "wav-to-alac" ||
        profileId === "flac-to-alac" ||
        WMA_OUTPUT_PROFILES.has(profileId) ||
        AIFF_OUTPUT_PROFILES.has(profileId) ||
        AMR_OUTPUT_PROFILES.has(profileId) ||
        MP3_OUTPUT_PROFILES.has(profileId) ||
        AAC_OUTPUT_PROFILES.has(profileId) ||
        OPUS_OUTPUT_PROFILES.has(profileId) ||
        VORBIS_OUTPUT_PROFILES.has(profileId) ||
        profileId === "mkv-to-webm" ||
        profileId === "3gp-to-webm" ||
        profileId === "mpeg-ts-to-webm" ||
        profileId === "flv-to-webm" ||
        profileId === "avi-to-webm" ||
        profileId === "ogv-to-webm" ||
        profileId === "m2v-to-webm" ||
        profileId === "h264-to-webm" ||
        profileId === "mkv-to-webm-vp9" ||
        profileId === "3gp-to-webm-vp9" ||
        profileId === "mpeg-ts-to-webm-vp9" ||
        profileId === "flv-to-webm-vp9" ||
        profileId === "avi-to-webm-vp9" ||
        profileId === "ogv-to-webm-vp9" ||
        profileId === "m2v-to-webm-vp9" ||
        profileId === "h264-to-webm-vp9" ||
        profileId === "mkv-to-mp4-mpeg4" ||
        profileId === "m2v-to-mp4-mpeg4") &&
        message.destination.mode === "opfs-test",
      message.testFault,
      profileId === "mkv-to-mp4"
        ? DIRECT_REMUX_WRITE_CHUNK
        : compressionTranscode ||
            profileId === "tar-to-sevenzip" ||
            profileId === "tar-gz-to-sevenzip" ||
            profileId === "tar-bz2-to-sevenzip" ||
            profileId === "tar-xz-to-sevenzip" ||
            profileId === "zip-to-sevenzip" ||
            profileId === "sevenzip-to-tar" ||
            profileId === "sevenzip-to-tar-gz" ||
            profileId === "sevenzip-to-tar-bz2" ||
            profileId === "sevenzip-to-tar-xz" ||
            profileId === "sevenzip-to-zip" ||
            profileId === "tar-bz2-to-zip" ||
            profileId === "tar-xz-to-zip" ||
            profileId === "zip-to-tar-bz2" ||
            profileId === "zip-to-tar-xz"
          ? ARCHIVE_WASM_WRITE_CHUNK
          : MAX_WRITE_CHUNK,
    );
    if (
      message.testFault &&
      message.testFault !== "worker-crash" &&
      !destination.handlesTestFault
    ) {
      destination.writable = injectDestinationFault(
        destination.writable,
        message.testFault,
      );
    }
    emitProgress(jobId, "Destination opened", metrics, startedAt, true);
    if (
      message.testFault === "worker-crash" &&
      message.destination.mode === "opfs-test"
    ) {
      const partial = new TextEncoder().encode("partial worker output\n");
      await destination.writable.write(partial);
      metrics.outputBytes = partial.byteLength;
      metrics.maxWriteChunkBytes = partial.byteLength;
      emitProgress(jobId, "Injected worker crash", metrics, startedAt, true);
      workerScope.setTimeout(() => {
        throw new Error("Injected conversion worker crash");
      }, 0);
      await new Promise<void>(() => {});
      return;
    }
    if (compressionTranscode) {
      const compressedDestination = destination.writable;
      await runCompressionTranscode({
        file,
        ...compressionTranscode,
        metrics,
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
        write: (chunk, phase) =>
          writeBounded(
            compressedDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
            true,
            ARCHIVE_WASM_WRITE_CHUNK,
          ),
      });
    } else if (
      profileId === "tar-gz-to-sevenzip" ||
      profileId === "tar-bz2-to-sevenzip" ||
      profileId === "tar-xz-to-sevenzip" ||
      profileId === "zip-to-sevenzip"
    ) {
      await runArchiveToSevenZip({
        file,
        source:
          profileId === "tar-gz-to-sevenzip"
            ? "gzip"
            : profileId === "tar-bz2-to-sevenzip"
              ? "bzip2"
              : profileId === "tar-xz-to-sevenzip"
                ? "xz"
                : "zip",
        writable: destination.writable,
        jobId,
        metrics,
        startedAt,
        isCancelled: () => cancelled,
        emitProgress,
        post,
      });
    } else if (
      profileId === "tar-to-sevenzip" ||
      profileId === "sevenzip-to-tar" ||
      profileId === "sevenzip-to-tar-gz" ||
      profileId === "sevenzip-to-tar-bz2" ||
      profileId === "sevenzip-to-tar-xz" ||
      profileId === "sevenzip-to-zip"
    ) {
      const runSevenZip =
        profileId === "tar-to-sevenzip"
          ? runTarToSevenZip
          : profileId === "sevenzip-to-zip"
          ? runSevenZipToZip
          : profileId === "sevenzip-to-tar-bz2"
          ? runSevenZipToTarBz2
          : profileId === "sevenzip-to-tar-xz"
          ? runSevenZipToTarXz
          : profileId === "sevenzip-to-tar-gz"
          ? runSevenZipToTarGz
          : runSevenZipToTar;
      await runSevenZip({
        file,
        writable: destination.writable,
        jobId,
        metrics,
        startedAt,
        isCancelled: () => cancelled,
        emitProgress,
        post,
      });
    } else if (
      profileId === "zip-to-tar-bz2" ||
      profileId === "zip-to-tar-xz"
    ) {
      const compressedTarDestination = destination.writable;
      await runZipToCompressedTar({
        file,
        codec: profileId === "zip-to-tar-bz2" ? "bzip2" : "xz",
        metrics,
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
        write: (chunk, phase) =>
          writeBounded(
            compressedTarDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
            true,
            ARCHIVE_WASM_WRITE_CHUNK,
          ),
      });
    } else if (
      profileId === "tar-bz2-to-zip" ||
      profileId === "tar-xz-to-zip"
    ) {
      const compressedArchiveDestination = destination.writable;
      await runCompressedTarToZip({
        file,
        codec: profileId === "tar-bz2-to-zip" ? "bzip2" : "xz",
        metrics,
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
        write: (chunk, phase) =>
          writeBounded(
            compressedArchiveDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
            false,
            ARCHIVE_WASM_WRITE_CHUNK,
          ),
      });
    } else if (
      profileId === "bzip2-compress" ||
      profileId === "bzip2-decompress" ||
      profileId === "tar-to-tar-bz2" ||
      profileId === "tar-bz2-to-tar"
    ) {
      const decompress =
        profileId === "bzip2-decompress" ||
        profileId === "tar-bz2-to-tar";
      const validateTar =
        profileId === "tar-to-tar-bz2" ||
        profileId === "tar-bz2-to-tar";
      const tarValidator = validateTar ? new TarStreamValidator() : null;
      const bzip2Destination = destination.writable;
      await runBzip2Conversion({
        file,
        decompress,
        metrics,
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
        write: (chunk, phase) =>
          writeBounded(
            bzip2Destination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
            true,
          ),
        validateInput:
          validateTar && !decompress
            ? (chunk) => tarValidator!.push(chunk)
            : undefined,
        validateOutput:
          validateTar && decompress
            ? (chunk) => tarValidator!.push(chunk)
            : undefined,
      });
      tarValidator?.finish();
    } else if (
      profileId === "xz-compress" ||
      profileId === "xz-decompress" ||
      profileId === "tar-to-tar-xz" ||
      profileId === "tar-xz-to-tar"
    ) {
      const decompress =
        profileId === "xz-decompress" || profileId === "tar-xz-to-tar";
      const validateTar =
        profileId === "tar-to-tar-xz" || profileId === "tar-xz-to-tar";
      const tarValidator = validateTar ? new TarStreamValidator() : null;
      const xzDestination = destination.writable;
      await runXzConversion({
        file,
        decompress,
        metrics,
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
        write: (chunk, phase) =>
          writeBounded(
            xzDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
            true,
          ),
        validateInput:
          validateTar && !decompress
            ? (chunk) => tarValidator!.push(chunk)
            : undefined,
        validateOutput:
          validateTar && decompress
            ? (chunk) => tarValidator!.push(chunk)
            : undefined,
      });
      tarValidator?.finish();
    } else if (
      profileId === "gzip-compress" ||
      profileId === "gzip-decompress" ||
      profileId === "tar-to-tar-gz" ||
      profileId === "tar-gz-to-tar"
    ) {
      await runCompression(
        file,
        destination.writable,
        profileId,
        jobId,
        metrics,
        startedAt,
      );
    } else if (
      profileId === "zip-to-tar" ||
      profileId === "zip-to-tar-gz" ||
      profileId === "tar-to-zip" ||
      profileId === "tar-gz-to-zip"
    ) {
      const archiveDestination = destination.writable;
      await runZipArchiveConversion({
        file,
        profileId,
        metrics,
        write: (chunk, phase) =>
          writeBounded(
            archiveDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
          ),
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
      });
    } else if (profileId === "docx-to-txt") {
      const documentDestination = destination.writable;
      await runDocxToText({
        file,
        metrics,
        write: (chunk, phase) =>
          writeBounded(
            documentDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
          ),
        warn: (message) => post({ type: "warning", jobId, message }),
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
      });
    } else if (profileId === "epub-to-txt") {
      const ebookDestination = destination.writable;
      await runEpubToText({
        file,
        metrics,
        write: (chunk, phase) =>
          writeBounded(
            ebookDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
          ),
        warn: (message) => post({ type: "warning", jobId, message }),
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
      });
    } else if (profileId === "xlsx-to-csv") {
      const spreadsheetDestination = destination.writable;
      await runXlsxToCsv({
        file,
        metrics,
        write: (chunk, phase) =>
          writeBounded(
            spreadsheetDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
          ),
        warn: (message) => post({ type: "warning", jobId, message }),
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
      });
    } else if (profileId === "pptx-to-txt") {
      const presentationDestination = destination.writable;
      await runPptxToText({
        file,
        metrics,
        write: (chunk, phase) =>
          writeBounded(
            presentationDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
          ),
        warn: (message) => post({ type: "warning", jobId, message }),
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
      });
    } else if (
      profileId === "odt-to-txt" ||
      profileId === "ods-to-csv" ||
      profileId === "odp-to-txt"
    ) {
      const odfDestination = destination.writable;
      await runOdfConversion({
        file,
        profileId,
        metrics,
        write: (chunk, phase) =>
          writeBounded(
            odfDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
          ),
        warn: (message) => post({ type: "warning", jobId, message }),
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
      });
    } else if (
      profileId === "txt-to-html" ||
      profileId === "md-to-html" ||
      profileId === "html-to-txt"
    ) {
      const documentDestination = destination.writable;
      await runDocumentConversion({
        file,
        profileId,
        metrics,
        write: (chunk, phase) =>
          writeBounded(
            documentDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
          ),
        warn: (message) => post({ type: "warning", jobId, message }),
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
      });
    } else if (profileId === "xml-to-ndjson") {
      const xmlDestination = destination.writable;
      await runXmlToNdjson({
        file,
        metrics,
        write: (chunk, phase) =>
          writeBounded(
            xmlDestination,
            chunk,
            jobId,
            phase,
            metrics,
            startedAt,
          ),
        warn: (message) => post({ type: "warning", jobId, message }),
        assertActive,
        progress: (phase) =>
          emitProgress(jobId, phase, metrics, startedAt),
      });
    } else if (profileId === "srt-to-vtt" || profileId === "vtt-to-srt") {
      await runSubtitles(
        file,
        destination.writable,
        profileId === "srt-to-vtt",
        jobId,
        metrics,
        startedAt,
      );
    } else if (profileId === "srt-to-ttml" || profileId === "vtt-to-ttml") {
      await runTextSubtitleToTtml(
        file,
        profileId === "srt-to-ttml",
        destination.writable,
        jobId,
        metrics,
        startedAt,
      );
    } else if (profileId === "srt-to-ass" || profileId === "vtt-to-ass") {
      await runTextSubtitleToAss(
        file,
        profileId === "srt-to-ass",
        destination.writable,
        jobId,
        metrics,
        startedAt,
      );
    } else if (profileId === "ttml-to-srt" || profileId === "ttml-to-vtt") {
      await runTtmlToTextSubtitle(
        file,
        profileId === "ttml-to-vtt",
        destination.writable,
        jobId,
        metrics,
        startedAt,
      );
    } else if (profileId === "ass-to-srt" || profileId === "ass-to-vtt") {
      await runAssSubtitles(
        file,
        destination.writable,
        profileId === "ass-to-vtt",
        jobId,
        metrics,
        startedAt,
      );
    } else if (profileId === "svg-to-png") {
      await runSvgToPng(
        file,
        destination.writable,
        jobId,
        metrics,
        startedAt,
      );
    } else if (
      /^(?:png|jpeg|webp|gif|avif|bmp)-to-(?:png|jpeg|webp|bmp|ico)$/.test(profileId)
    ) {
      await runImageConversion(
        profileId,
        file,
        destination.writable,
        jobId,
        metrics,
        startedAt,
      );
    } else if (profileId === "tiff-to-png") {
      await runTiffToPng({
        file,
        writable: destination.writable,
        jobId,
        metrics,
        startedAt,
        isCancelled: () => cancelled,
        emitProgress,
        post,
      });
    } else if (
      profileId === "mkv-to-mp4" ||
      profileId === "mov-to-mp4" ||
      profileId === "3gp-to-mp4" ||
      profileId === "mpeg-ts-to-mp4" ||
      profileId === "flv-to-mp4" ||
      profileId === "avi-to-mp4" ||
      profileId === "h264-to-mp4" ||
      profileId === "mkv-to-h264" ||
      profileId === "mp4-to-h264" ||
      profileId === "mov-to-h264" ||
      profileId === "3gp-to-h264" ||
      profileId === "mpeg-ts-to-h264" ||
      profileId === "flv-to-h264" ||
      profileId === "mkv-to-hevc" ||
      profileId === "mp4-to-hevc" ||
      profileId === "mov-to-hevc" ||
      profileId === "mpeg-ts-to-hevc" ||
      profileId === "mp4-to-mkv" ||
      profileId === "mov-to-mkv" ||
      profileId === "3gp-to-mkv" ||
      profileId === "mpeg-ts-to-mkv" ||
      profileId === "flv-to-mkv" ||
      profileId === "avi-to-mkv" ||
      profileId === "webm-to-mkv" ||
      profileId === "ogv-to-mkv" ||
      profileId === "mkv-to-mpeg-ts" ||
      profileId === "mp4-to-mpeg-ts" ||
      profileId === "mov-to-mpeg-ts" ||
      profileId === "3gp-to-mpeg-ts" ||
      profileId === "flv-to-mpeg-ts" ||
      profileId === "mkv-to-3gp" ||
      profileId === "mp4-to-3gp" ||
      profileId === "mov-to-3gp" ||
      profileId === "mpeg-ts-to-3gp" ||
      profileId === "flv-to-3gp" ||
      profileId === "mkv-to-mov" ||
      profileId === "mp4-to-mov" ||
      profileId === "3gp-to-mov" ||
      profileId === "mpeg-ts-to-mov" ||
      profileId === "flv-to-mov" ||
      profileId === "mkv-to-flv" ||
      profileId === "mp4-to-flv" ||
      profileId === "mov-to-flv" ||
      profileId === "3gp-to-flv" ||
      profileId === "mpeg-ts-to-flv" ||
      profileId === "m2v-to-mpeg-ts" ||
      profileId === "mkv-to-m2v" ||
      profileId === "mp4-to-m2v" ||
      profileId === "mov-to-m2v" ||
      profileId === "avi-to-m2v" ||
      profileId === "mpeg-ts-to-m2v" ||
      profileId === "m4v-to-mp4" ||
      profileId === "mkv-to-m4v" ||
      profileId === "mp4-to-m4v" ||
      profileId === "mov-to-m4v" ||
      profileId === "avi-to-m4v" ||
      profileId === "mkv-to-webm-av1" ||
      profileId === "mkv-to-mp3" ||
      profileId === "mp4-to-mp3" ||
      profileId === "mov-to-mp3" ||
      profileId === "avi-to-mp3" ||
      profileId === "mpeg-ts-to-mp3" ||
      profileId === "flv-to-mp3" ||
      profileId === "mkv-to-aac" ||
      profileId === "mp4-to-aac" ||
      profileId === "mov-to-aac" ||
      profileId === "3gp-to-aac" ||
      profileId === "mpeg-ts-to-aac" ||
      profileId === "flv-to-aac" ||
      profileId === "mkv-to-ogg" ||
      profileId === "webm-to-ogg" ||
      profileId === "ogv-to-ogg" ||
      profileId === "mkv-to-opus" ||
      profileId === "webm-to-opus" ||
      profileId === "mkv-to-m4a" ||
      profileId === "mov-to-m4a" ||
      profileId === "3gp-to-m4a" ||
      profileId === "mpeg-ts-to-m4a" ||
      profileId === "flv-to-m4a" ||
      profileId === "mp4-to-m4a" ||
      profileId === "aac-to-m4a" ||
      profileId === "mkv-to-wav" ||
      profileId === "mov-to-wav" ||
      profileId === "3gp-to-wav" ||
      profileId === "mpeg-ts-to-wav" ||
      profileId === "flv-to-wav" ||
      profileId === "avi-to-wav" ||
      profileId === "ogv-to-wav" ||
      profileId === "mp4-to-wav" ||
      profileId === "m4a-to-wav" ||
      profileId === "aac-to-wav" ||
      profileId === "amr-to-wav" ||
      profileId === "mp3-to-wav" ||
      profileId === "flac-to-wav" ||
      profileId === "wma-to-wav" ||
      profileId === "aiff-to-wav" ||
      profileId === "ogg-to-wav" ||
      profileId === "opus-to-wav" ||
      profileId === "m4a-to-flac" ||
      profileId === "mkv-to-flac" ||
      profileId === "mp4-to-flac" ||
      profileId === "mov-to-flac" ||
      profileId === "3gp-to-flac" ||
      profileId === "mpeg-ts-to-flac" ||
      profileId === "flv-to-flac" ||
      profileId === "avi-to-flac" ||
      profileId === "ogv-to-flac" ||
      profileId === "aac-to-flac" ||
      profileId === "amr-to-flac" ||
      profileId === "mp3-to-flac" ||
      profileId === "wav-to-flac" ||
      profileId === "wma-to-flac" ||
      profileId === "aiff-to-flac" ||
      profileId === "ogg-to-flac" ||
      profileId === "opus-to-flac" ||
      profileId === "wav-to-alac" ||
      profileId === "flac-to-alac" ||
      WMA_OUTPUT_PROFILES.has(profileId) ||
      AIFF_OUTPUT_PROFILES.has(profileId) ||
      AMR_OUTPUT_PROFILES.has(profileId) ||
      MP3_OUTPUT_PROFILES.has(profileId) ||
      AAC_OUTPUT_PROFILES.has(profileId) ||
      OPUS_OUTPUT_PROFILES.has(profileId) ||
      VORBIS_OUTPUT_PROFILES.has(profileId) ||
      profileId === "mp4-to-webm" ||
      profileId === "mov-to-webm" ||
      profileId === "mkv-to-webm" ||
      profileId === "3gp-to-webm" ||
      profileId === "mpeg-ts-to-webm" ||
      profileId === "flv-to-webm" ||
      profileId === "avi-to-webm" ||
      profileId === "ogv-to-webm" ||
      profileId === "m2v-to-webm" ||
      profileId === "h264-to-webm" ||
      profileId === "mp4-to-webm-vp9" ||
      profileId === "mov-to-webm-vp9" ||
      profileId === "mkv-to-webm-vp9" ||
      profileId === "3gp-to-webm-vp9" ||
      profileId === "mpeg-ts-to-webm-vp9" ||
      profileId === "flv-to-webm-vp9" ||
      profileId === "avi-to-webm-vp9" ||
      profileId === "ogv-to-webm-vp9" ||
      profileId === "m2v-to-webm-vp9" ||
      profileId === "h264-to-webm-vp9" ||
      profileId === "mkv-to-mp4-mpeg4" ||
      profileId === "m2v-to-mp4-mpeg4"
    ) {
      await runMediaRemux({
        file,
        writable: destination.writable,
        remuxProfile:
          profileId === "mkv-to-mp3" ||
          profileId === "mp4-to-mp3" ||
          profileId === "mov-to-mp3" ||
          profileId === "avi-to-mp3" ||
          profileId === "mpeg-ts-to-mp3" ||
          profileId === "flv-to-mp3"
            ? 18
          : profileId === "mkv-to-aac" ||
            profileId === "mp4-to-aac" ||
            profileId === "mov-to-aac" ||
            profileId === "3gp-to-aac" ||
            profileId === "mpeg-ts-to-aac" ||
            profileId === "flv-to-aac"
            ? 19
          : profileId === "mkv-to-ogg" ||
            profileId === "webm-to-ogg" ||
            profileId === "ogv-to-ogg"
            ? 20
          : profileId === "mkv-to-opus" ||
            profileId === "webm-to-opus"
            ? 21
          : profileId === "mkv-to-webm-av1"
            ? 17
          : profileId === "mkv-to-m4v" ||
            profileId === "mp4-to-m4v" ||
            profileId === "mov-to-m4v" ||
            profileId === "avi-to-m4v"
            ? 15
          : profileId === "m4v-to-mp4"
            ? 16
          : profileId === "mkv-to-m2v" ||
            profileId === "mp4-to-m2v" ||
            profileId === "mov-to-m2v" ||
            profileId === "avi-to-m2v" ||
            profileId === "mpeg-ts-to-m2v"
            ? 13
          : profileId === "m2v-to-mpeg-ts"
            ? 14
          : profileId === "mkv-to-h264" ||
            profileId === "mp4-to-h264" ||
            profileId === "mov-to-h264" ||
            profileId === "3gp-to-h264" ||
            profileId === "mpeg-ts-to-h264" ||
            profileId === "flv-to-h264"
            ? 12
          : profileId === "mkv-to-hevc" ||
            profileId === "mp4-to-hevc" ||
            profileId === "mov-to-hevc" ||
            profileId === "mpeg-ts-to-hevc"
            ? 22
          : profileId === "mp4-to-mkv" ||
            profileId === "mov-to-mkv" ||
            profileId === "3gp-to-mkv" ||
            profileId === "mpeg-ts-to-mkv" ||
            profileId === "flv-to-mkv" ||
            profileId === "avi-to-mkv" ||
            profileId === "webm-to-mkv" ||
            profileId === "ogv-to-mkv"
            ? 23
          : profileId === "mkv-to-mpeg-ts" ||
            profileId === "mp4-to-mpeg-ts" ||
            profileId === "mov-to-mpeg-ts" ||
            profileId === "3gp-to-mpeg-ts" ||
            profileId === "flv-to-mpeg-ts"
            ? 24
          : profileId === "mkv-to-3gp" ||
            profileId === "mp4-to-3gp" ||
            profileId === "mov-to-3gp" ||
            profileId === "mpeg-ts-to-3gp" ||
            profileId === "flv-to-3gp"
            ? 25
          : profileId === "mkv-to-mov" ||
            profileId === "mp4-to-mov" ||
            profileId === "3gp-to-mov" ||
            profileId === "mpeg-ts-to-mov" ||
            profileId === "flv-to-mov"
            ? 26
          : profileId === "mkv-to-flv" ||
            profileId === "mp4-to-flv" ||
            profileId === "mov-to-flv" ||
            profileId === "3gp-to-flv" ||
            profileId === "mpeg-ts-to-flv"
            ? 27
          : profileId === "mkv-to-wav" ||
            profileId === "mov-to-wav" ||
            profileId === "3gp-to-wav" ||
            profileId === "mpeg-ts-to-wav" ||
            profileId === "flv-to-wav" ||
            profileId === "avi-to-wav" ||
            profileId === "ogv-to-wav" ||
            profileId === "mp4-to-wav" ||
            profileId === "m4a-to-wav" ||
            profileId === "aac-to-wav" ||
            profileId === "amr-to-wav" ||
            profileId === "mp3-to-wav" ||
            profileId === "flac-to-wav" ||
            profileId === "wma-to-wav" ||
            profileId === "aiff-to-wav" ||
            profileId === "ogg-to-wav" ||
            profileId === "opus-to-wav"
            ? 3
            : profileId === "m4a-to-flac" ||
                profileId === "mkv-to-flac" ||
                profileId === "mp4-to-flac" ||
                profileId === "mov-to-flac" ||
                profileId === "3gp-to-flac" ||
                profileId === "mpeg-ts-to-flac" ||
                profileId === "flv-to-flac" ||
                profileId === "avi-to-flac" ||
                profileId === "ogv-to-flac" ||
                profileId === "aac-to-flac" ||
                profileId === "amr-to-flac" ||
                profileId === "mp3-to-flac" ||
                profileId === "wav-to-flac" ||
                profileId === "wma-to-flac" ||
                profileId === "aiff-to-flac" ||
                profileId === "ogg-to-flac" ||
                profileId === "opus-to-flac"
              ? 6
            : profileId === "wav-to-alac" ||
                profileId === "flac-to-alac"
              ? 8
            : WMA_OUTPUT_PROFILES.has(profileId)
              ? 9
            : AIFF_OUTPUT_PROFILES.has(profileId)
              ? 28
            : AMR_OUTPUT_PROFILES.has(profileId)
              ? 29
            : MP3_OUTPUT_PROFILES.has(profileId)
              ? 30
            : AAC_OUTPUT_PROFILES.has(profileId)
              ? 31
            : OPUS_OUTPUT_PROFILES.has(profileId)
              ? 32
            : VORBIS_OUTPUT_PROFILES.has(profileId)
              ? 33
            : profileId === "mp4-to-webm" ||
                profileId === "mov-to-webm" ||
                profileId === "mkv-to-webm" ||
                profileId === "3gp-to-webm" ||
                profileId === "mpeg-ts-to-webm" ||
                profileId === "flv-to-webm" ||
                profileId === "avi-to-webm" ||
                profileId === "m2v-to-webm" ||
                profileId === "h264-to-webm"
              ? 5
            : profileId === "ogv-to-webm"
              ? 7
            : profileId === "mp4-to-webm-vp9" ||
                profileId === "mov-to-webm-vp9" ||
                profileId === "mkv-to-webm-vp9" ||
                profileId === "3gp-to-webm-vp9" ||
                profileId === "mpeg-ts-to-webm-vp9" ||
                profileId === "flv-to-webm-vp9" ||
                profileId === "avi-to-webm-vp9" ||
                profileId === "m2v-to-webm-vp9" ||
                profileId === "h264-to-webm-vp9"
              ? 10
            : profileId === "ogv-to-webm-vp9"
              ? 11
            : profileId === "mkv-to-mp4-mpeg4" ||
                profileId === "m2v-to-mp4-mpeg4"
              ? 4
            : profileId === "mkv-to-m4a" ||
                profileId === "mov-to-m4a" ||
                profileId === "3gp-to-m4a" ||
                profileId === "mpeg-ts-to-m4a" ||
                profileId === "flv-to-m4a" ||
                profileId === "mp4-to-m4a" ||
                profileId === "aac-to-m4a"
              ? 2
              : 1,
        jobId,
        metrics,
        startedAt,
        isCancelled: () => cancelled,
        emitProgress,
        post,
      });
    } else if (profileId.includes("-to-")) {
      await runRecords(
        profileId,
        file,
        destination.writable,
        jobId,
        metrics,
        startedAt,
      );
    } else {
      throw new Error("This conversion engine is not installed.");
    }

    assertActive();
    await destination.writable.close();
    updateElapsed(metrics, startedAt);
    emitProgress(jobId, "Complete", metrics, startedAt, true);
    activeJobId = null;
    cancelled = false;
    post({
      type: "complete",
      jobId,
      metrics: { ...metrics },
      opfsName: destination.opfsName,
    });
  } catch (error) {
    updateElapsed(metrics, startedAt);
    try {
      await destination?.writable.abort(error);
    } catch {
      // The destination may already be closed or unavailable.
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      post({ type: "cancelled", jobId, metrics: { ...metrics } });
    } else {
      post({
        type: "error",
        jobId,
        message: error instanceof Error ? error.message : String(error),
        metrics: { ...metrics },
      });
    }
  } finally {
    activeJobId = null;
    cancelled = false;
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    if (activeJobId === message.jobId) cancelled = true;
    return;
  }
  if (activeJobId) {
    post({
      type: "error",
      jobId: message.jobId,
      message: "The worker is already processing another conversion.",
      metrics: newMetrics(),
    });
    return;
  }
  void runJob(message);
};

post({ type: "ready" });
