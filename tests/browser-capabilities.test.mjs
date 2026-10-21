import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  browserRequirementSatisfied,
  videoEncoderSupport,
} from "../lib/browser-capabilities.ts";
import { conversionProfiles } from "../lib/capability-registry.ts";

const completeCapabilities = {
  secure: true,
  wasm: true,
  wasmSimd: true,
  workers: true,
  fileSystemAccess: true,
  directoryAccess: true,
  opfs: true,
  storageEstimate: true,
  compressionGzip: true,
  compressionDeflate: true,
  compressionDeflateRaw: true,
  sharedArrayBuffer: true,
  crossOriginIsolated: true,
  webCrypto: true,
  webCodecsVideo: true,
  webCodecsAudio: true,
  imageDecoder: true,
  imageDecoderTypes: { "image/png": true, "image/avif": true },
  offscreenCanvas: true,
};

const requirementNames = [
  "CompressionStream with DEFLATE",
  "CompressionStream with GZIP",
  "CompressionStream with raw DEFLATE",
  "DecompressionStream with GZIP",
  "DecompressionStream with raw DEFLATE",
  "File System Access",
  "ImageDecoder",
  "OffscreenCanvas",
  "Origin Private File System",
  "SharedArrayBuffer",
  "Web Crypto",
  "Web Workers",
  "WebAssembly",
  "cross-origin isolation",
];

test("every registry browser requirement has an exact functional mapping", () => {
  const used = [...new Set(
    conversionProfiles.flatMap((profile) => profile.browserRequirements),
  )].sort();
  assert.deepEqual(used, requirementNames);
  for (const requirement of used) {
    assert.equal(
      browserRequirementSatisfied(requirement, completeCapabilities, "image/png"),
      true,
      requirement,
    );
  }
  assert.equal(
    browserRequirementSatisfied("Unknown future capability", completeCapabilities),
    false,
    "unknown requirements must fail closed",
  );
});

test("requirement mapping distinguishes codecs, compression formats, and storage", () => {
  const withoutRawDeflate = {
    ...completeCapabilities,
    compressionDeflateRaw: false,
  };
  assert.equal(
    browserRequirementSatisfied("CompressionStream with GZIP", withoutRawDeflate),
    true,
  );
  assert.equal(
    browserRequirementSatisfied("CompressionStream with raw DEFLATE", withoutRawDeflate),
    false,
  );
  assert.equal(
    browserRequirementSatisfied("CompressionStream with DEFLATE", withoutRawDeflate),
    true,
  );
  assert.equal(
    browserRequirementSatisfied("ImageDecoder", completeCapabilities, "image/png"),
    true,
  );
  assert.equal(
    browserRequirementSatisfied("ImageDecoder", completeCapabilities, "image/gif"),
    false,
  );
  assert.equal(
    browserRequirementSatisfied("Origin Private File System", {
      ...completeCapabilities,
      opfs: false,
    }),
    false,
  );
  assert.equal(
    browserRequirementSatisfied("File System Access", {
      ...completeCapabilities,
      fileSystemAccess: false,
    }),
    false,
  );
});

test("capability detection performs bounded functional probes instead of presence checks", () => {
  const source = readFileSync(
    new URL("../lib/browser-capabilities.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /CAPABILITY_PROBE_TIMEOUT_MS = 3_000/);
  assert.match(source, /validatesWasm\(BASIC_WASM_MODULE\)/);
  assert.match(source, /validatesWasm\(SIMD_WASM_MODULE\)/);
  assert.match(source, /WebAssembly\.validate\(bytes\)/);
  assert.match(source, /new SharedArrayBuffer\(Int32Array\.BYTES_PER_ELEMENT\)/);
  assert.match(source, /new CompressionStream\(format\)/);
  assert.match(source, /new DecompressionStream\(format\)/);
  assert.match(source, /navigator\.storage\.getDirectory\(\)/);
  assert.match(source, /navigator\.storage\.estimate\(\)/);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(source, /ImageDecoder\.isTypeSupported\(mime\)/);
  assert.match(source, /new OffscreenCanvas\(1, 1\)\.getContext\("2d"\)/);
  assert.match(source, /VideoEncoder\.isConfigSupported\(configuration\)/);
  assert.match(source, /AudioEncoder\.isConfigSupported/);

  const app = readFileSync(
    new URL("../app/converter/ConverterApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /browserRequirementSatisfied\(requirement, capabilities, inputMimeType\)/);
  assert.match(app, /data-testid="capability-blocker"/);
  assert.doesNotMatch(app, /function capabilitySnapshot/);
});

test("startup probes software functionality first without initializing unneeded hardware queries", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "VideoEncoder"), calls = [];
  try {
    Object.defineProperty(globalThis, "VideoEncoder", { configurable: true, value: class {
      static async isConfigSupported(configuration) { calls.push(configuration); return { supported: configuration.codec === "vp8" }; }
    } });
    assert.equal(await videoEncoderSupport(), true);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(x => x.hardwareAcceleration === "prefer-software"));
    assert.deepEqual(calls.map(x => x.codec), ["vp8", "vp09.00.10.08", "avc1.42001e"]);
    assert.ok(calls.every(x => x.width === 16 && x.height === 16 && x.bitrate === 100_000 && x.framerate === 1));
  } finally {
    if (original) Object.defineProperty(globalThis, "VideoEncoder", original);
    else delete globalThis.VideoEncoder;
  }
});

test("hardware-only availability and rejected software hints retain the original functional fallback", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "VideoEncoder");
  try {
    for (const mode of ["unsupported", "rejected", "all-unavailable"]) {
      const calls = [];
      Object.defineProperty(globalThis, "VideoEncoder", { configurable: true, value: class {
        static async isConfigSupported(configuration) {
          calls.push(configuration);
          if (configuration.hardwareAcceleration && mode === "rejected") throw new Error("Software hint unavailable");
          return { supported: mode !== "all-unavailable" && !configuration.hardwareAcceleration && configuration.codec === "avc1.42001e" };
        }
      } });
      assert.equal(await videoEncoderSupport(), mode !== "all-unavailable");
      assert.equal(calls.length, 6);
      assert.ok(calls.slice(0, 3).every(x => x.hardwareAcceleration === "prefer-software"));
      assert.ok(calls.slice(3).every(x => !("hardwareAcceleration" in x)));
    }
    Object.defineProperty(globalThis, "VideoEncoder", { configurable: true, value: undefined });
    assert.equal(await videoEncoderSupport(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "VideoEncoder", original);
    else delete globalThis.VideoEncoder;
  }
});
