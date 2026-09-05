const BASIC_WASM_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);
const SIMD_WASM_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
]);
const CAPABILITY_PROBE_TIMEOUT_MS = 3_000;
const IMAGE_DECODER_MIME_TYPES = [
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heic-sequence",
  "image/heif",
  "image/heif-sequence",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export interface BrowserCapabilities {
  secure: boolean;
  wasm: boolean;
  wasmSimd: boolean;
  workers: boolean;
  fileSystemAccess: boolean;
  directoryAccess: boolean;
  opfs: boolean;
  storageEstimate: boolean;
  compressionGzip: boolean;
  compressionDeflate: boolean;
  compressionDeflateRaw: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  webCrypto: boolean;
  webCodecsVideo: boolean;
  webCodecsAudio: boolean;
  imageDecoder: boolean;
  imageDecoderTypes: Readonly<Record<string, boolean>>;
  offscreenCanvas: boolean;
}

async function boundedProbe<T>(probe: () => Promise<T>, fallback: T): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      probe().catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = window.setTimeout(() => resolve(fallback), CAPABILITY_PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

function validatesWasm(bytes: Uint8Array<ArrayBuffer>): boolean {
  try {
    return (
      typeof WebAssembly === "object" &&
      typeof WebAssembly.validate === "function" &&
      WebAssembly.validate(bytes)
    );
  } catch {
    return false;
  }
}

async function compressionRoundTrip(
  format: "gzip" | "deflate" | "deflate-raw",
): Promise<boolean> {
  if (
    typeof CompressionStream !== "function" ||
    typeof DecompressionStream !== "function"
  ) {
    return false;
  }
  const expected = new Uint8Array([0x57, 0x69, 0x74, 0x68, 0x69, 0x6e]);
  const compressed = new Blob([expected])
    .stream()
    .pipeThrough(new CompressionStream(format));
  const restored = new Uint8Array(
    await new Response(
      compressed.pipeThrough(new DecompressionStream(format)),
    ).arrayBuffer(),
  );
  return (
    restored.byteLength === expected.byteLength &&
    restored.every((value, index) => value === expected[index])
  );
}

async function imageDecoderSupport(): Promise<Record<string, boolean>> {
  const support: Record<string, boolean> = {};
  if (
    typeof ImageDecoder !== "function" ||
    typeof ImageDecoder.isTypeSupported !== "function"
  ) {
    return support;
  }
  await Promise.all(
    IMAGE_DECODER_MIME_TYPES.map(async (mime) => {
      support[mime] = await ImageDecoder.isTypeSupported(mime).catch(() => false);
    }),
  );
  return support;
}

async function videoEncoderSupport(): Promise<boolean> {
  if (
    typeof VideoEncoder !== "function" ||
    typeof VideoEncoder.isConfigSupported !== "function"
  ) {
    return false;
  }
  const configurations: VideoEncoderConfig[] = [
    { codec: "vp8", width: 16, height: 16, bitrate: 100_000, framerate: 1 },
    { codec: "vp09.00.10.08", width: 16, height: 16, bitrate: 100_000, framerate: 1 },
    { codec: "avc1.42001e", width: 16, height: 16, bitrate: 100_000, framerate: 1 },
  ];
  const results = await Promise.all(
    configurations.map((configuration) =>
      VideoEncoder.isConfigSupported(configuration)
        .then((result) => result.supported === true)
        .catch(() => false),
    ),
  );
  return results.some(Boolean);
}

async function audioEncoderSupport(): Promise<boolean> {
  if (
    typeof AudioEncoder !== "function" ||
    typeof AudioEncoder.isConfigSupported !== "function"
  ) {
    return false;
  }
  return AudioEncoder.isConfigSupported({
    codec: "opus",
    sampleRate: 48_000,
    numberOfChannels: 2,
    bitrate: 128_000,
  })
    .then((result) => result.supported === true)
    .catch(() => false);
}

export async function detectBrowserCapabilities(): Promise<BrowserCapabilities> {
  const wasm = validatesWasm(BASIC_WASM_MODULE);
  const wasmSimd = wasm && validatesWasm(SIMD_WASM_MODULE);
  let sharedArrayBuffer = false;
  if (typeof SharedArrayBuffer === "function" && typeof Atomics === "object") {
    try {
      const control = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
      sharedArrayBuffer = Atomics.load(control, 0) === 0;
    } catch {
      sharedArrayBuffer = false;
    }
  }
  let offscreenCanvas = false;
  if (typeof OffscreenCanvas === "function") {
    try {
      offscreenCanvas = Boolean(new OffscreenCanvas(1, 1).getContext("2d"));
    } catch {
      offscreenCanvas = false;
    }
  }

  const [opfs, storageEstimate, compressionGzip, compressionDeflate, compressionDeflateRaw, webCrypto, decoderTypes, webCodecsVideo, webCodecsAudio] =
    await Promise.all([
      boundedProbe(async () => {
        if (typeof navigator.storage?.getDirectory !== "function") return false;
        return Boolean(await navigator.storage.getDirectory());
      }, false),
      boundedProbe(async () => {
        if (typeof navigator.storage?.estimate !== "function") return false;
        const estimate = await navigator.storage.estimate();
        return (
          Number.isFinite(estimate.usage) &&
          Number.isFinite(estimate.quota) &&
          (estimate.quota ?? 0) >= (estimate.usage ?? 0)
        );
      }, false),
      boundedProbe(() => compressionRoundTrip("gzip"), false),
      boundedProbe(() => compressionRoundTrip("deflate"), false),
      boundedProbe(() => compressionRoundTrip("deflate-raw"), false),
      boundedProbe(async () => {
        if (typeof crypto.subtle?.digest !== "function") return false;
        const digest = await crypto.subtle.digest("SHA-256", new Uint8Array([0]));
        return digest.byteLength === 32;
      }, false),
      boundedProbe(imageDecoderSupport, {} as Record<string, boolean>),
      boundedProbe(videoEncoderSupport, false),
      boundedProbe(audioEncoderSupport, false),
    ]);

  return {
    secure: window.isSecureContext,
    wasm,
    wasmSimd,
    workers: typeof Worker === "function",
    fileSystemAccess: typeof window.showSaveFilePicker === "function",
    directoryAccess: typeof window.showDirectoryPicker === "function",
    opfs,
    storageEstimate,
    compressionGzip,
    compressionDeflate,
    compressionDeflateRaw,
    sharedArrayBuffer,
    crossOriginIsolated: window.crossOriginIsolated,
    webCrypto,
    webCodecsVideo,
    webCodecsAudio,
    imageDecoder: Object.values(decoderTypes).some(Boolean),
    imageDecoderTypes: decoderTypes,
    offscreenCanvas,
  };
}

export function browserRequirementSatisfied(
  requirement: string,
  capabilities: BrowserCapabilities,
  inputMimeType?: string,
): boolean {
  switch (requirement) {
    case "WebAssembly":
      return capabilities.wasm;
    case "Web Workers":
      return capabilities.workers;
    case "File System Access":
      return capabilities.fileSystemAccess;
    case "Origin Private File System":
      return capabilities.opfs;
    case "SharedArrayBuffer":
      return capabilities.sharedArrayBuffer;
    case "cross-origin isolation":
      return capabilities.crossOriginIsolated;
    case "CompressionStream with GZIP":
    case "DecompressionStream with GZIP":
      return capabilities.compressionGzip;
    case "CompressionStream with DEFLATE":
      return capabilities.compressionDeflate;
    case "CompressionStream with raw DEFLATE":
    case "DecompressionStream with raw DEFLATE":
      return capabilities.compressionDeflateRaw;
    case "ImageDecoder":
      return inputMimeType
        ? capabilities.imageDecoderTypes[inputMimeType] === true
        : capabilities.imageDecoder;
    case "OffscreenCanvas":
      return capabilities.offscreenCanvas;
    case "Web Crypto":
      return capabilities.webCrypto;
    default:
      return false;
  }
}
