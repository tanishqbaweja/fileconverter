// Compiled synthetic libavutil transport only; never a media conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { readMpeg2SplitNativeLayout } from "./lib/mpeg2-split-frame-layout.mjs";
import { createMpeg2SplitFrameBridge } from "./lib/mpeg2-split-frame-bridge.mjs";
import { copyMpeg2SplitProperties } from "./lib/mpeg2-split-frame-properties.mjs";

const root = new URL("../", import.meta.url), build = new URL("work/mpeg2-split-properties-build/", root);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const artifacts = {}, actualLimits = {}, sources = {}, rows = [];
for (const role of ["decoder", "encoder"]) {
  for (const ext of ["mjs", "wasm"]) artifacts[`split-properties-${role}.${ext}`] =
    sha(await readFile(new URL(`split-properties-${role}.${ext}`, build)));
  actualLimits[role] = readWasmMemoryLimits(await readFile(new URL(`split-properties-${role}.wasm`, build)));
  const pages = role === "decoder" ? 512 : 256;
  assert.deepEqual(actualLimits[role], [{ imported: true, initialPages: pages, maximumPages: pages, shared: true }]);
}
for (const file of ["media/ffmpeg/mpeg2-split-frame-layout.h", "media/ffmpeg/mpeg2-split-frame-smoke.c",
  "media/ffmpeg/mpeg2-split-frame-properties.h", "media/ffmpeg/mpeg2-split-properties-smoke.c",
  "media/ffmpeg/verify-mpeg2-split-properties.sh", "scripts/verify-mpeg2-split-properties-native.mjs",
  "scripts/lib/mpeg2-split-frame-properties.mjs", "scripts/lib/mpeg2-split-frame-layout.mjs",
  "scripts/lib/mpeg2-split-frame-bridge.mjs", "scripts/lib/wasm-memory-limits.mjs"])
  sources[file] = sha(await readFile(new URL(file, root)));
const decoder = await (await import(new URL("split-properties-decoder.mjs", build))).default();
const encoder = await (await import(new URL("split-properties-encoder.mjs", build))).default();
for (const core of [decoder, encoder]) {
  assert.equal(core._emscripten_stack_get_base() - core._emscripten_stack_get_end(), 262144);
  const slot = core._within_props_smoke_slot();
  assert.ok(slot > 0 && slot <= core.HEAPU8.length - 65536);
}
function exported(core) {
  const bytes = core._within_props_smoke_export(); assert.ok(bytes >= 160 && bytes <= 65536);
  return core.HEAPU8.subarray(core._within_props_smoke_slot(), core._within_props_smoke_slot() + bytes);
}
function pixelHash(core, layout) {
  const hash = createHash("sha256");
  for (let plane = 0; plane < 3; plane++) {
    const p = layout.planes[plane], bytes = plane ? layout.width / 2 : layout.width;
    const rows = !plane || layout.pixelFormat === "yuv422p" ? layout.height : layout.height / 2;
    for (let row = 0; row < rows; row++) hash.update(core.HEAPU8.subarray(p.offset + row * p.stride, p.offset + row * p.stride + bytes));
  }
  return hash.digest("hex");
}
function backingHash(core, layout) {
  const hash = createHash("sha256"), seen = new Set();
  for (const p of layout.planes) {
    const id = `${p.allocationOffset}:${p.allocationBytes}`;
    if (!seen.has(id)) { seen.add(id); hash.update(core.HEAPU8.subarray(p.allocationOffset, p.allocationOffset + p.allocationBytes)); }
  }
  return hash.digest("hex");
}
for (const [width, height] of [[18, 10], [1920, 804]]) for (const kind of [0, 1])
  for (const [negativeSource, negativeTarget] of [[0, 0], [1, 0], [0, 1]]) {
    let bridge;
    try {
      assert.equal(decoder._within_split_smoke_create(width, height, kind, negativeSource, 0), 0);
      assert.equal(encoder._within_split_smoke_create(width, height, kind, negativeTarget, 97), 0);
      assert.equal(decoder._within_props_smoke_seed(0), 0); assert.equal(encoder._within_props_smoke_seed(97), 0);
      const source = readMpeg2SplitNativeLayout(decoder.HEAPU8, decoder._within_split_smoke_describe());
      const target = readMpeg2SplitNativeLayout(encoder.HEAPU8, encoder._within_split_smoke_describe());
      const pixels = pixelHash(decoder, source), backing = backingHash(decoder, source);
      const properties = exported(decoder), propertySha = sha(properties), bytes = properties.length;
      const view = new DataView(properties.buffer, properties.byteOffset, properties.byteLength);
      assert.equal(view.getBigInt64(88, true), 1152921504606846985n);
      assert.equal(view.getBigInt64(96, true), -9223372036854775808n);
      assert.equal(view.getBigInt64(104, true), -1152921504606846985n);
      assert.equal(view.getBigInt64(112, true), 9223372036854775807n);
      assert.equal(view.getUint32(136, true), 5); assert.equal(view.getUint32(140, true), 4);
      assert.notEqual(sha(exported(encoder)), propertySha);
      let releases = 0;
      bridge = createMpeg2SplitFrameBridge({ decoder, encoder, isCancelled: () => false,
        prepare: () => target,
        consume: () => {
          assert.equal(copyMpeg2SplitProperties(decoder, encoder, decoder._within_props_smoke_slot(), encoder._within_props_smoke_slot(), bytes), bytes);
          assert.equal(encoder._within_props_smoke_import(bytes), 0);
          assert.equal(encoder._within_props_smoke_check(0), 1);
          assert.equal(sha(exported(encoder)), propertySha); assert.equal(pixelHash(encoder, target), pixels);
        }, release: () => { releases++; } });
      await bridge.send(source);
      assert.equal(releases, 1); assert.equal(sha(exported(decoder)), propertySha);
      assert.equal(backingHash(decoder, source), backing);
      assert.equal(decoder._within_split_smoke_references(), 1); assert.equal(encoder._within_split_smoke_references(), 1);
      rows.push({ width, height, pixelFormat: source.pixelFormat, negativeSource: Boolean(negativeSource),
        negativeTarget: Boolean(negativeTarget), propertyBytes: bytes, propertySha256: propertySha,
        activePixelSha256: pixels, metadataEntries: 5, byteArraySideEntries: 4,
        exact64BitTiming: true, sourceBackingAndPropertiesUnchanged: true,
        nativePixelReferencesUnchanged: true, metrics: bridge.close() });
    } finally {
      bridge?.close();
      assert.equal(decoder._within_split_smoke_destroy(), 1); assert.equal(encoder._within_split_smoke_destroy(), 1);
      assert.equal(decoder._within_split_smoke_references(), 0); assert.equal(encoder._within_split_smoke_references(), 0);
    }
  }
// Adverse tests: all rejected native records leave existing destination properties
// and pixels intact. Temporary copies below are bounded TEST-only assertions.
let rejectedRecords = 0, repeatedTransfers = 0, rejectedSources = 0;
try {
  assert.equal(decoder._within_split_smoke_create(18, 10, 0, 0, 0), 0);
  assert.equal(encoder._within_split_smoke_create(18, 10, 0, 0, 97), 0);
  assert.equal(decoder._within_props_smoke_seed(0), 0); assert.equal(encoder._within_props_smoke_seed(97), 0);
  const valid = Uint8Array.from(exported(decoder)), existing = sha(exported(encoder));
  const offset = encoder._within_props_smoke_slot();
  const malformed = [
    [0, 0], [4, 2], [8, valid.length - 1], [12, 20], [20, 1], [84, 1], [120, 1],
    [136, 65], [140, 17], [144, 1], [160, 0xffffffff], [164, 0xffffffff],
  ];
  for (const [at, value] of malformed) {
    encoder.HEAPU8.set(valid, offset); new DataView(encoder.HEAPU8.buffer).setUint32(offset + at, value, true);
    assert.ok(encoder._within_props_smoke_import(valid.length) < 0);
    assert.equal(sha(exported(encoder)), existing); rejectedRecords++;
  }
  for (const bytes of [0, 159, valid.length - 1, 65537, valid.length + 1]) {
    encoder.HEAPU8.set(valid, offset); assert.ok(encoder._within_props_smoke_import(bytes) < 0);
    assert.equal(sha(exported(encoder)), existing); rejectedRecords++;
  }
  for (let i = 0; i < 100; i++) {
    assert.equal(decoder._within_props_smoke_seed(i), 0);
    const input = exported(decoder), expected = sha(input);
    copyMpeg2SplitProperties(decoder, encoder, decoder._within_props_smoke_slot(), offset, input.length);
    assert.equal(encoder._within_props_smoke_import(input.length), 0); assert.equal(sha(exported(encoder)), expected);
    assert.equal(encoder._within_props_smoke_check(i), 1); assert.equal(decoder._within_props_smoke_check(i), 1);
    assert.equal(encoder._within_split_smoke_references(), 1); repeatedTransfers++;
  }
  // Empty source actively removes stale side data/metadata, not merely merges.
  assert.equal(decoder._within_props_smoke_empty(), 0);
  const empty = exported(decoder); assert.equal(empty.length, 160);
  copyMpeg2SplitProperties(decoder, encoder, decoder._within_props_smoke_slot(), offset, empty.length);
  assert.equal(encoder._within_props_smoke_import(empty.length), 0); assert.equal(sha(exported(encoder)), sha(empty));
  for (let mode = 1; mode <= 7; mode++) {
    assert.equal(decoder._within_props_smoke_seed(0), 0);
    const before = Uint8Array.from(exported(decoder));
    assert.ok(decoder._within_props_smoke_reject(mode) < 0);
    assert.deepEqual(decoder.HEAPU8.subarray(decoder._within_props_smoke_slot(), decoder._within_props_smoke_slot() + before.length), before);
    rejectedSources++;
  }
} finally {
  assert.equal(decoder._within_split_smoke_destroy(), 1); assert.equal(encoder._within_split_smoke_destroy(), 1);
  assert.equal(decoder._within_split_smoke_references(), 0); assert.equal(encoder._within_split_smoke_references(), 0);
}
const report = { status: "passed-synthetic-native-pixels-and-properties-not-conversion",
  ffmpegVersion: "8.1.2", emscriptenVersion: "6.0.4", allocator: "dlmalloc",
  sources, artifacts, actualLimits, nativeStackBytesEach: 262144, nativePropertySlotBytesEach: 65536,
  additionalPixelBufferBytes: 0, checkedCases: rows.length, rows, rejectedRecords, repeatedTransfers, rejectedSources,
  emptySourceClearedOldProperties: true, finalNativePixelReferences: 0,
  conversionPerformed: false, publicAcceptance: false, processMemoryAcceptance: false, speedGainClaim: null,
  originalFixtureRead: false, mediaFilesRead: false, mediaFilesWritten: false,
  limits: "Synthetic libavutil frames only. Only A53 CC/SEI unregistered/ICC/EXIF raw byte side data accepted; other or structured side types explicitly refuse, never silently drop. Opaque/hardware/audio/crop refuse. Codec settings/extradata/packet transport/real codecs/production browser AVIO/full-source fit/250MiB/fidelity/speed remain incomplete. Native temporary property frame has no pixels; metadata allocations bounded by 64KiB wire and entry/side caps. Scratch cleanup must be checked separately.",
};
const text = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(text) <= 65536);
await writeFile(new URL("outputs/reports/mpeg2-split-properties-contract.json", root), text, { flag: "wx" });
process.stdout.write(`Synthetic native pixels/properties: ${rows.length} cases, ${rejectedRecords} rejects, ${repeatedTransfers} repeats; not conversion.\n`);
