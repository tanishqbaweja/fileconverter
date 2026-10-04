import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { SAD_SOURCE_SHA256, SAD_SOURCE_URL, SAD_SHAPES } from "./lib/openh264-sad-reference.mjs";

const root = path.resolve(import.meta.dirname, ".."), build = path.join(root, "work/h264-sad-arithmetic-build");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = ["media/ffmpeg/openh264-sad-simd.h", "media/ffmpeg/openh264-sad-arithmetic.cpp",
  "media/ffmpeg/verify-sad-arithmetic.sh", "scripts/verify-sad-arithmetic.mjs",
  "scripts/generate-sad-reference.mjs", "scripts/lib/openh264-sad-reference.mjs",
  ".github/workflows/reproduce-ffmpeg-nondocker.yml"];
const report = {
  status: "running-private-sad-proof-and-primitive-cost", publicAcceptance: false,
  browserConversions: 0, conversionBuildsChanged: false, speedGainClaim: null,
  scope: "Actual compiled Wasm exact SAD arithmetic and warm Node/V8 primitive cost, not browser file throughput, fidelity or memory acceptance",
  coverageLimitation: "Exhaustive byte pairs in two patterns, not exhaustive enumeration of all blocks; independent nonnegative strides",
  emscriptenVersion: "6.0.4", nodeVersion: process.version,
  compilerFlags: "-O3 -fno-strict-aliasing -msimd128 -pthread",
  initialWasmMemoryBytes: 33554432, maximumWasmMemoryBytes: 33554432,
  upstream: { url: SAD_SOURCE_URL, bytes: 8268, sha256: SAD_SOURCE_SHA256 },
  reference: "Exact four upstream scalar bodies and dependency calls with names only changed; license retained",
  sourceHashes: Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha(await readFile(path.join(root, file)))]))),
  generatedReferenceSha256: sha(await readFile(path.join(build, "sad-reference.h"))),
  wasmSha256: sha(await readFile(path.join(build, "sad-arithmetic.wasm"))),
  moduleSha256: sha(await readFile(path.join(build, "sad-arithmetic.mjs"))),
  shapes: SAD_SHAPES, cases: {}, totalCases: 0, benchmarks: [],
};
let randomState = 0x6d2b79f5;
const randomByte = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return randomState & 255; };
try {
  const { default: create } = await import(pathToFileURL(path.join(build, "sad-arithmetic.mjs")).href);
  const core = await create();
  assert.equal(core.HEAPU8.byteLength, 33554432);
  assert.ok(core.HEAPU8.buffer instanceof SharedArrayBuffer);
  function sample(shape, sa, sb, offset = 0, boundarySide = null) {
    const [width, height] = SAD_SHAPES[shape].split("x").map(Number);
    const sizes = [sa, sb].map((stride) => (height - 1) * stride + width);
    const pointers = [];
    try {
      const allocations = sizes.map((size, i) => {
        if (i === boundarySide) return { base: core.HEAPU8.length - size - 16, pointer: core.HEAPU8.length - size, size, end: core.HEAPU8.length };
        const base = core._malloc(size + offset + 32);
        assert.ok(base > 0); pointers.push(base);
        return { base, pointer: base + 16 + offset, size, end: base + size + offset + 32 };
      });
      for (const a of allocations) core.HEAPU8.fill(0xa5, a.base, a.end);
      const [a, b] = allocations.map((entry) => core.HEAPU8.subarray(entry.pointer, entry.pointer + entry.size));
      return {
        a, b, width, height,
        run(group, expected = null) {
          const before = allocations.map((entry) => sha(core.HEAPU8.subarray(entry.base, entry.end)));
          const args = [shape, allocations[0].pointer, sa, allocations[1].pointer, sb];
          const scalar = core._sad_reference(...args), simd = core._sad_simd(...args);
          assert.equal(simd, scalar, `${group}/${SAD_SHAPES[shape]}`);
          assert.ok(scalar >= 0 && scalar <= width * height * 255);
          if (expected !== null) assert.equal(simd, expected);
          assert.deepEqual(allocations.map((entry) => sha(core.HEAPU8.subarray(entry.base, entry.end))), before, "input or canary modified");
          assert.equal(core.HEAPU8.byteLength, 33554432);
          ++report.totalCases; report.cases[group] = (report.cases[group] ?? 0) + 1;
        },
        close() { for (const pointer of pointers) core._free(pointer); },
      };
    } catch (error) { for (const pointer of pointers) core._free(pointer); throw error; }
  }
  for (let shape = 0; shape < 4; ++shape) {
    const width = Number(SAD_SHAPES[shape].split("x")[0]), pair = sample(shape, width, width);
    try {
      for (let a = 0; a < 256; ++a) for (let b = 0; b < 256; ++b) {
        pair.a.fill(a); pair.b.fill(b);
        const expected = pair.width * pair.height * Math.abs(a - b);
        pair.run("exhaustiveUniformBytePairs", expected);
        for (let pixel = 0; pixel < pair.a.length; ++pixel) {
          pair.a[pixel] = pixel & 1 ? a : b; pair.b[pixel] = pixel & 1 ? b : a;
        }
        pair.run("exhaustiveMixedSignBytePairs", expected);
      }
      for (let pixel = 0; pixel < pair.a.length; ++pixel) {
        pair.a.fill(0); pair.b.fill(0); pair.a[pixel] = 255;
        pair.run("singlePixelLaneAndRow", 255);
        pair.a[pixel] = 0; pair.b[pixel] = 255;
        pair.run("singlePixelLaneAndRow", 255);
      }
    } finally { pair.close(); }
    for (let i = 0; i < 1024; ++i) {
      const entry = sample(shape, width + i % 31, width + (i * 7) % 47, i % 32);
      try {
        for (const input of [entry.a, entry.b]) for (let p = 0; p < input.length; ++p) input[p] = randomByte();
        entry.run("seededRandomIndependentStrideAndAlignment");
      } finally { entry.close(); }
    }
    for (const [sa, sb] of [[0, 0], [0, width], [width, 0], [1, 3], [3, 1]]) {
      const entry = sample(shape, sa, sb, 3);
      try {
        for (const input of [entry.a, entry.b]) for (let p = 0; p < input.length; ++p) input[p] = randomByte();
        entry.run("zeroAndOverlappingNonnegativeStrides");
      } finally { entry.close(); }
    }
    for (const side of [0, 1]) {
      const entry = sample(shape, width + 1, width + 3, 7, side);
      try {
        for (const input of [entry.a, entry.b]) for (let p = 0; p < input.length; ++p) input[p] = randomByte();
        entry.run("inputEndsExactlyAtWasmBoundary");
      } finally { entry.close(); }
    }
  }
  const benchPointers = [];
  try {
    for (let i = 0; i < 2; ++i) {
      const p = core._malloc(65536); assert.ok(p > 0); benchPointers.push(p);
      for (let j = 0; j < 65536; ++j) core.HEAPU8[p + j] = randomByte();
    }
    const before = benchPointers.map((p) => sha(core.HEAPU8.subarray(p, p + 65536)));
    const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];
    for (let shape = 0; shape < 4; ++shape) {
      const measure = (optimized, iterations) => {
        const start = performance.now();
        const checksum = core._sad_batch(shape, optimized, benchPointers[0], 32, benchPointers[1], 48, iterations) >>> 0;
        return { optimized: !!optimized, iterations, elapsedMs: performance.now() - start, checksum };
      };
      // Native loops, 64 varying blocks, actual checksum use: no per-call JS
      // crossing or repeated invariant input to hoist out of the timed loop.
      for (let warm = 0; warm < 4; ++warm) { measure(0, 100000); measure(1, 100000); }
      let iterations = 100000;
      while (iterations < 2000000 && measure(0, iterations).elapsedMs < 50) iterations = Math.min(iterations * 2, 2000000);
      const pairs = [];
      for (let round = 0; round < 7; ++round) {
        const ordered = (round & 1 ? [1, 0] : [0, 1]).map((optimized) => measure(optimized, iterations));
        const scalar = ordered.find((entry) => !entry.optimized), simd = ordered.find((entry) => entry.optimized);
        assert.equal(simd.checksum, scalar.checksum);
        pairs.push({ order: ordered.map((entry) => entry.optimized ? "simd" : "scalar"), scalar, simd });
      }
      const scalarMedianMs = median(pairs.map((pair) => pair.scalar.elapsedMs));
      const simdMedianMs = median(pairs.map((pair) => pair.simd.elapsedMs));
      report.benchmarks.push({ shape: SAD_SHAPES[shape], iterations, pairs, scalarMedianMs, simdMedianMs,
        scalarOverSimdRatio: scalarMedianMs / simdMedianMs,
        scope: "Warm hosted Node/V8 primitive microbenchmark; not production Chromium end-to-end speed acceptance" });
    }
    assert.deepEqual(benchPointers.map((p) => sha(core.HEAPU8.subarray(p, p + 65536))), before, "benchmark input modified");
  } finally { for (const pointer of benchPointers) core._free(pointer); }
  report.status = "passed-private-sad-proof-and-primitive-cost-only";
} catch (error) {
  report.status = "failed-private-sad-proof-and-primitive-cost-only";
  report.error = String(error.stack ?? error).slice(0, 8192);
  throw error;
} finally {
  await writeFile(path.join(root, "outputs/reports/sad-arithmetic.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${report.status}: ${report.totalCases} cases; no file-conversion speed acceptance\n`);
}
