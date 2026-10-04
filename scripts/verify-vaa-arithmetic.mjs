import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { VAA_SOURCE_SHA256, VAA_SOURCE_URL } from "./lib/openh264-vaa-reference.mjs";

const root = path.resolve(import.meta.dirname, "..");
const build = path.join(root, "work/h264-vaa-arithmetic-build");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = ["media/ffmpeg/openh264-vaa-simd.h", "media/ffmpeg/openh264-vaa-arithmetic.cpp",
  "media/ffmpeg/verify-vaa-arithmetic.sh", "scripts/verify-vaa-arithmetic.mjs",
  "scripts/generate-vaa-reference.mjs", "scripts/lib/openh264-vaa-reference.mjs",
  ".github/workflows/reproduce-ffmpeg-nondocker.yml"];
const report = {
  status: "running-private-arithmetic-proof-only", publicAcceptance: false,
  conversionBuildsChanged: false, browserConversions: 0, speedGainClaim: null,
  scope: "Actual compiled Wasm scalar/SIMD arithmetic equivalence; not video fidelity, memory or throughput acceptance",
  emscriptenVersion: "6.0.4", initialWasmMemoryBytes: 33554432, maximumWasmMemoryBytes: 33554432,
  upstream: { url: VAA_SOURCE_URL, sha256: VAA_SOURCE_SHA256, bytes: 19566 },
  reference: "Exact pinned scalar function body; name changed; byte-difference WELS_ABS supplied; source license retained",
  overflowScope: "Compare actual pinned scalar compiled at -O3 against explicit uint32 modulo accumulation; not a portable signed-overflow guarantee",
  coverageLimitation: "Exhaustive byte pairs in two block patterns, not exhaustive enumeration of every possible frame",
  sourceHashes: Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha(await readFile(path.join(root, file)))]))),
  generatedReferenceSha256: sha(await readFile(path.join(build, "vaa-reference.h"))),
  wasmSha256: sha(await readFile(path.join(build, "vaa-arithmetic.wasm"))),
  moduleSha256: sha(await readFile(path.join(build, "vaa-arithmetic.mjs"))),
  cases: {}, totalCases: 0, checkedQuadrants: 0,
};
let core;
try {
  const { default: create } = await import(pathToFileURL(path.join(build, "vaa-arithmetic.mjs")).href);
  core = await create();
  assert.equal(core.HEAPU8.byteLength, 33554432);
  let randomState = 0x6d2b79f5;
  const randomByte = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return randomState & 255; };
  function makeCase(width, height, stride, offset = 0, boundary = false) {
    const size = Math.max(1, stride * Math.max(1, height));
    const pointers = [];
    const allocate = (bytes) => {
      const pointer = core._malloc(bytes);
      assert.ok(pointer > 0, "arithmetic allocation failed");
      pointers.push(pointer);
      return pointer;
    };
    try {
      const c = boundary ? core.HEAPU8.length - size : allocate(size + offset + 32) + offset;
      const r = allocate(size + offset + 32) + offset;
      const count = (width >> 4) * (height >> 4) * 4;
      const shape = [4, count * 4, count * 4, count];
      const outputs = [0, 1].map(() => shape.map((bytes) => {
        const base = allocate(bytes + 32);
        return { base, pointer: base + 16, bytes };
      }));
      const current = core.HEAPU8.subarray(c, c + size), reference = core.HEAPU8.subarray(r, r + size);
      return {
        current, reference,
        run(group, expected = null) {
          const before = [sha(current), sha(reference)];
          for (const fields of outputs) for (const field of fields) core.HEAPU8.fill(0xa5, field.base, field.base + field.bytes + 32);
          for (const [i, fn] of [core._vaa_reference, core._vaa_simd].entries()) {
            fn(c, r, width, height, stride, ...outputs[i].map((field) => field.pointer));
          }
          for (let field = 0; field < shape.length; ++field) {
            const a = outputs[0][field], b = outputs[1][field];
            assert.deepEqual(core.HEAPU8.subarray(a.base, a.base + a.bytes + 32),
              core.HEAPU8.subarray(b.base, b.base + b.bytes + 32), `${group}: scalar/SIMD field ${field}`);
            for (const entry of [a, b]) {
              assert.ok(core.HEAPU8.subarray(entry.base, entry.pointer).every((byte) => byte === 0xa5), "prefix canary overwritten");
              assert.ok(core.HEAPU8.subarray(entry.pointer + entry.bytes, entry.base + entry.bytes + 32).every((byte) => byte === 0xa5), "suffix canary overwritten");
            }
          }
          assert.deepEqual([sha(current), sha(reference)], before, "input modified");
          const fields = outputs[1];
          const signed = (index) => new Int32Array(core.HEAPU8.buffer, fields[index].pointer, shape[index] / 4);
          if (expected) {
            assert.equal(signed(0)[0], expected.frame);
            assert.ok(signed(1).every((value) => value === expected.sad));
            assert.ok(signed(2).every((value) => value === expected.sd));
            assert.ok(core.HEAPU8.subarray(fields[3].pointer, fields[3].pointer + count).every((value) => value === expected.mad));
          }
          ++report.totalCases; report.checkedQuadrants += count;
          report.cases[group] = (report.cases[group] ?? 0) + 1;
          assert.equal(core.HEAPU8.byteLength, 33554432);
        },
        close() { for (const pointer of pointers) core._free(pointer); },
      };
    } catch (error) {
      for (const pointer of pointers) core._free(pointer);
      throw error;
    }
  }
  const pair = makeCase(16, 16, 16);
  try {
    for (let a = 0; a < 256; ++a) for (let b = 0; b < 256; ++b) {
      pair.current.fill(a); pair.reference.fill(b);
      const difference = a - b, absolute = Math.abs(difference);
      pair.run("exhaustiveUniformBytePairs", { frame: 256 * absolute, sad: 64 * absolute, sd: 64 * difference, mad: absolute });
      for (let pixel = 0; pixel < 256; ++pixel) {
        pair.current[pixel] = pixel & 1 ? a : b;
        pair.reference[pixel] = pixel & 1 ? b : a;
      }
      pair.run("exhaustiveMixedSignBytePairs", { frame: 256 * absolute, sad: 64 * absolute, sd: 0, mad: absolute });
    }
    for (let pixel = 0; pixel < 256; ++pixel) {
      pair.current.fill(0); pair.reference.fill(0);
      pair.current[pixel] = 255;
      pair.run("singlePixelQuadrantAndLane");
      pair.current[pixel] = 0; pair.reference[pixel] = 255;
      pair.run("singlePixelQuadrantAndLane");
    }
  } finally { pair.close(); }
  for (let i = 0; i < 512; ++i) {
    const width = [0, 1, 15, 16, 17, 31, 32, 33, 47, 64, 127, 256][i % 12];
    const height = [0, 1, 15, 16, 17, 31, 32, 33, 48, 65, 128][i % 11];
    const sample = makeCase(width, height, Math.max(16, width) + i % 31, i % 32);
    try {
      for (let pixel = 0; pixel < sample.current.length; ++pixel) {
        sample.current[pixel] = randomByte(); sample.reference[pixel] = randomByte();
      }
      sample.run("seededRandomStrideAlignmentAndDimensions");
    } finally { sample.close(); }
  }
  for (const [a, b] of [[255, 0], [0, 255], [255, 255], [0, 0]]) {
    const sample = makeCase(4096, 2160, 4096);
    try {
      sample.current.fill(a); sample.reference.fill(b);
      const absolute = Math.abs(a - b);
      sample.run("maximumDimensionsAndFrameOverflow", {
        frame: (4096 * 2160 * absolute) | 0, sad: 64 * absolute, sd: 64 * (a - b), mad: absolute,
      });
    } finally { sample.close(); }
  }
  const boundary = makeCase(16, 16, 16, 0, true);
  try {
    for (let pixel = 0; pixel < 256; ++pixel) { boundary.current[pixel] = randomByte(); boundary.reference[pixel] = randomByte(); }
    boundary.run("sourceEndsAtWasmMemoryBoundary");
  } finally { boundary.close(); }
  report.status = "passed-private-arithmetic-proof-only";
} catch (error) {
  report.status = "failed-private-arithmetic-proof-only";
  report.error = String(error.stack ?? error).slice(0, 8192);
  throw error;
} finally {
  await writeFile(path.join(root, "outputs/reports/vaa-arithmetic.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${report.status}: ${report.totalCases} cases; no browser conversion or speed acceptance\n`);
}
