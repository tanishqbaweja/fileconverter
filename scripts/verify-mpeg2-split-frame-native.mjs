// Synthetic libavutil Wasm ownership test, NEVER a video conversion or acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { readMpeg2SplitNativeLayout } from "./lib/mpeg2-split-frame-layout.mjs";
import { createMpeg2SplitFrameBridge } from "./lib/mpeg2-split-frame-bridge.mjs";

const root = new URL("../", import.meta.url), build = new URL("work/mpeg2-split-frame-build/", root);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const actualLimits = {}, artifacts = {}, sources = {}, rows = [];
for (const role of ["decoder", "encoder"]) {
  for (const extension of ["mjs", "wasm"])
    artifacts[`split-${role}.${extension}`] = sha(await readFile(new URL(`split-${role}.${extension}`, build)));
  actualLimits[role] = readWasmMemoryLimits(await readFile(new URL(`split-${role}.wasm`, build)));
  const pages = role === "decoder" ? 512 : 256;
  assert.deepEqual(actualLimits[role], [{ imported: true, initialPages: pages, maximumPages: pages, shared: true }]);
}
for (const file of ["media/ffmpeg/mpeg2-split-frame-layout.h", "media/ffmpeg/mpeg2-split-frame-smoke.c",
  "media/ffmpeg/verify-mpeg2-split-frame.sh", "scripts/verify-mpeg2-split-frame-native.mjs",
  "scripts/lib/mpeg2-split-frame-layout.mjs", "scripts/lib/mpeg2-split-frame-bridge.mjs", "scripts/lib/wasm-memory-limits.mjs"])
  sources[file] = sha(await readFile(new URL(file, root)));
const decoderFactory = (await import(new URL("split-decoder.mjs", build))).default;
const encoderFactory = (await import(new URL("split-encoder.mjs", build))).default;
const decoder = await decoderFactory(), encoder = await encoderFactory();
for (const core of [decoder, encoder])
  assert.equal(core._emscripten_stack_get_base() - core._emscripten_stack_get_end(), 262144);
function pixelHash(core, layout) {
  const hash = createHash("sha256");
  for (let plane = 0; plane < 3; plane++) {
    const value = layout.planes[plane], rowBytes = plane ? layout.width / 2 : layout.width;
    const count = !plane || layout.pixelFormat === "yuv422p" ? layout.height : layout.height / 2;
    for (let row = 0; row < count; row++) {
      const offset = value.offset + row * value.stride;
      hash.update(core.HEAPU8.subarray(offset, offset + rowBytes));
    }
  }
  return hash.digest("hex");
}
function backingHash(core, layout) {
  const hash = createHash("sha256"), seen = new Set();
  for (const p of layout.planes) {
    const identity = `${p.allocationOffset}:${p.allocationBytes}`;
    if (!seen.has(identity)) {
      seen.add(identity); hash.update(core.HEAPU8.subarray(p.allocationOffset, p.allocationOffset + p.allocationBytes));
    }
  }
  return hash.digest("hex");
}
function paddingHash(core, layout) {
  const hash = createHash("sha256"), seen = new Set();
  for (const p of layout.planes) {
    const identity = `${p.allocationOffset}:${p.allocationBytes}`;
    if (seen.has(identity)) continue; seen.add(identity);
    const planes = layout.planes.map((value, index) => ({ ...value,
      bytes: index ? layout.width / 2 : layout.width,
      rows: !index || layout.pixelFormat === "yuv422p" ? layout.height : layout.height / 2 }))
      .filter((value) => value.allocationOffset === p.allocationOffset && value.allocationBytes === p.allocationBytes)
      .sort((a, b) => Math.min(a.offset, a.offset + (a.rows - 1) * a.stride) - Math.min(b.offset, b.offset + (b.rows - 1) * b.stride));
    let cursor = p.allocationOffset;
    for (const plane of planes) {
      const first = Math.min(plane.offset, plane.offset + (plane.rows - 1) * plane.stride);
      for (let row = 0; row < plane.rows; row++) {
        const offset = first + row * Math.abs(plane.stride);
        assert.ok(cursor <= offset); hash.update(core.HEAPU8.subarray(cursor, offset)); cursor = offset + plane.bytes;
      }
    }
    hash.update(core.HEAPU8.subarray(cursor, p.allocationOffset + p.allocationBytes));
  }
  return hash.digest("hex");
}
for (const [width, height] of [[18, 10], [1920, 804]]) {
  for (const pixelKind of [0, 1]) for (const [negativeSource, negativeTarget] of [[0, 0], [1, 0], [0, 1]]) {
    let bridge;
    try {
      assert.equal(decoder._within_split_smoke_create(width, height, pixelKind, negativeSource, 0), 0);
      assert.equal(encoder._within_split_smoke_create(width, height, pixelKind, negativeTarget, 97), 0);
      assert.equal(decoder._within_split_smoke_references(), 1); assert.equal(encoder._within_split_smoke_references(), 1);
      const source = readMpeg2SplitNativeLayout(decoder.HEAPU8, decoder._within_split_smoke_describe());
      const target = readMpeg2SplitNativeLayout(encoder.HEAPU8, encoder._within_split_smoke_describe());
      assert.equal(decoder._within_split_smoke_references(), 1); assert.equal(encoder._within_split_smoke_references(), 1);
      const original = pixelHash(decoder, source), sourceBacking = backingHash(decoder, source);
      const originalPadding = paddingHash(encoder, target);
      assert.notEqual(pixelHash(encoder, target), original, "Synthetic target starts with different pixels");
      let released = 0;
      bridge = createMpeg2SplitFrameBridge({ decoder, encoder, prepare: () => target,
        consume: () => assert.equal(pixelHash(encoder, target), original), release: () => { released++; }, isCancelled: () => false });
      await bridge.send(source);
      assert.equal(pixelHash(encoder, target), original); assert.equal(backingHash(decoder, source), sourceBacking);
      assert.equal(paddingHash(encoder, target), originalPadding);
      assert.equal(decoder._within_split_smoke_references(), 1); assert.equal(encoder._within_split_smoke_references(), 1);
      assert.equal(released, 1);
      rows.push({ width, height, pixelFormat: source.pixelFormat, negativeSource: Boolean(negativeSource),
        negativeTarget: Boolean(negativeTarget), activePixelSha256: original,
        decoderBackingUnchanged: true, encoderPaddingUnchanged: true, nativeReferenceCountBeforeAndAfter: 1,
        metrics: bridge.close() });
    } finally {
      bridge?.close();
      assert.equal(decoder._within_split_smoke_destroy(), 1); assert.equal(encoder._within_split_smoke_destroy(), 1);
      assert.equal(decoder._within_split_smoke_references(), 0); assert.equal(encoder._within_split_smoke_references(), 0);
    }
  }
}
assert.equal(rows.length, 12);
const report = { status: "passed-synthetic-native-frame-transport-not-conversion",
  publicAcceptance: false, conversionPerformed: false, processMemoryAcceptance: false, speedGainClaim: null,
  ffmpegVersion: "8.1.2", emscriptenVersion: "6.0.4", allocator: "dlmalloc",
  primarySources: { "libavutil/frame.c": "3f004de1ba09a2f1749eea93d7c75d1a942732532b669a165517091203566534",
    "libavutil/frame.h": "91275238d0abfc4fef41f2f6a4f182e279886af78e2f525864329279206a3be9" },
  sources, artifacts, actualLimits, nativeStackBytesEach: 262144, checkedCases: rows.length, rows,
  mediaFilesRead: false, mediaFilesWritten: false, originalFixtureRead: false,
  limits: "Synthetic AVFrames/real libavutil allocation/getter only, no decoder/encoder code. Native refs stay1; destroy finally returns0refs. Pixel transport does not carry properties/side data/configuration or encoded packets. Those contracts and real production-browser/full-source/fidelity/250MiB/speed gates remain incomplete. Scratch cleanup is performed by the enclosing recipe/workflow and must be verified separately.",
};
const text = JSON.stringify(report, null, 2); assert.ok(Buffer.byteLength(text) <= 65536);
await writeFile(new URL("outputs/reports/mpeg2-split-frame-contract.json", root), text + "\n", { flag: "wx" });
process.stdout.write(`Synthetic native split pixel transport: ${rows.length} cases passed; no conversion or acceptance.\n`);
