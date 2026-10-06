// Actual compiled codec initialization and native field checks, never encoding
// or conversion acceptance. Browser integration/fidelity/memory remain required.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { readMpeg2SplitNativeLayout } from "./lib/mpeg2-split-frame-layout.mjs";

const root = new URL("../", import.meta.url), output = new URL("work/mpeg2-split-encoder-output/", root);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sources = {};
for (const file of ["media/ffmpeg/mpeg2-split-encoder.c", "media/ffmpeg/mpeg2-split-frame-layout.h",
  "media/ffmpeg/mpeg2-split-frame-properties.h", "media/ffmpeg/mpeg2-split-codec-parameters.h",
  "media/ffmpeg/build-mpeg2-split-encoder.sh", "scripts/verify-mpeg2-split-encoder-native.mjs",
  "media/ffmpeg/patches/mpeg2-encoder-uncached-frame-buffers.patch", "media/ffmpeg/patches/mpeg2-encoder-uncached-accessories.patch",
  "scripts/lib/wasm-memory-limits.mjs", "scripts/lib/mpeg2-split-frame-layout.mjs"])
  sources[file] = sha(await readFile(new URL(file, root)));
const artifacts = {};
for (const file of ["split-encoder.mjs", "split-encoder.wasm", "config_components.h", "LICENSE.LGPLv2.1", "mpeg2-accessory-smoke.json"])
  artifacts[file] = sha(await readFile(new URL(file, output)));
const memoryLimits = readWasmMemoryLimits(await readFile(new URL("split-encoder.wasm", output)));
assert.equal(memoryLimits.length, 1); assert.equal(memoryLimits[0].initialPages, 256);
assert.equal(memoryLimits[0].maximumPages, 256); assert.equal(memoryLimits[0].shared, true);
const components = await readFile(new URL("config_components.h", output), "utf8");
const enabledEncoders = [...components.matchAll(/^#define CONFIG_(\w+)_ENCODER 1$/gm)].map(x => x[1]);
const enabledDecoders = [...components.matchAll(/^#define CONFIG_(\w+)_DECODER 1$/gm)].map(x => x[1]);
assert.deepEqual(enabledEncoders, ["MPEG2VIDEO"]); assert.deepEqual(enabledDecoders, []);
const core = await (await import(new URL("split-encoder.mjs", output))).default();
assert.equal(core.HEAPU8.byteLength, 16777216); assert.ok(core.HEAPU8.buffer instanceof SharedArrayBuffer);
const stackBytes = core._emscripten_stack_get_base() - core._emscripten_stack_get_end(); assert.equal(stackBytes, 262144);
const configPointer = core._within_split_encoder_config();
const config = new DataView(core.HEAPU8.buffer, configPointer, 96);
function setup({ width = 1920, height = 804, kind = 0, bitrate = 2000000, qmin = 4, qmax = 20 } = {}) {
  core.HEAPU8.fill(0, configPointer, configPointer + 96);
  [1, width, height, kind, 1, 24, 24, 1, bitrate, qmin, qmax, 1, 1, 1, 1, 1, 1, 1]
    .forEach((value, i) => config.setUint32(i * 4, value, true));
}
const cases = [];
try {
  for (const dimensions of [[18, 10], [1920, 804]]) for (const kind of [0, 1]) {
    setup({ width: dimensions[0], height: dimensions[1], kind });
    assert.equal(core._within_split_encoder_open(), 0); assert.equal(core._within_split_encoder_state(), 1);
    assert.equal(core._within_split_encoder_settings_match(), 1); assert.equal(core._within_split_encoder_parameters_check(), 0);
    const bytes = core._within_split_encoder_parameter_bytes(), pointer = core._within_split_encoder_parameters();
    assert.ok(bytes >= 144 && bytes <= 65536);
    const wire = new DataView(core.HEAPU8.buffer, pointer, bytes);
    assert.equal(wire.getUint32(0, true), 0x31504357); assert.equal(wire.getUint32(4, true), 1);
    assert.equal(wire.getUint32(8, true), bytes); assert.equal(wire.getUint32(12, true), 1);
    assert.equal(wire.getUint32(16, true), dimensions[0]); assert.equal(wire.getUint32(20, true), dimensions[1]);
    assert.equal(wire.getUint32(24, true), kind); assert.equal(wire.getBigInt64(32, true), 2000000n);
    for (const [at, value] of [[56, 1], [60, 1], [64, 24], [68, 1], [76, 1], [80, 1], [84, 1], [88, 1], [92, 1]])
      assert.equal(wire.getInt32(at, true), value);
    for (let at = 112; at < 144; at += 4) assert.equal(wire.getUint32(at, true), 0);
    const parameterSha256 = sha(core.HEAPU8.subarray(pointer, pointer + bytes));
    // A changed field must fail the actual native-context comparison, not just
    // roundtrip through mutually wrong serializers. Restore before continuing.
    wire.setUint32(16, 20, true); assert.ok(core._within_split_encoder_parameters_check() < 0);
    wire.setUint32(16, dimensions[0], true); assert.equal(core._within_split_encoder_parameters_check(), 0);
    let prepareCount = 0, firstLayout;
    for (let i = 0; i < 100; i++) {
      const layoutPointer = core._within_split_encoder_prepare(); assert.ok(layoutPointer > 0);
      const layout = readMpeg2SplitNativeLayout(core.HEAPU8, layoutPointer);
      assert.equal(layout.width, dimensions[0]); assert.equal(layout.height, dimensions[1]);
      assert.equal(layout.pixelFormat, kind ? "yuv422p" : "yuv420p");
      assert.equal(core._within_split_encoder_input_refs(), 1);
      if (!firstLayout) firstLayout = layout; else assert.deepEqual(layout, firstLayout);
      assert.ok(core._within_split_encoder_prepare() < 0); assert.ok(core._within_split_encoder_flush() < 0);
      assert.equal(core._within_split_encoder_abort_frame(), 0); prepareCount++;
    }
    assert.ok(core._within_split_encoder_next_packet() < 0); assert.ok(core._within_split_encoder_release_packet() < 0);
    assert.equal(core._within_split_encoder_frames(), 0); assert.equal(core._within_split_encoder_packets(), 0);
    cases.push({ width: dimensions[0], height: dimensions[1], kind, settingsMatch: true,
      actualNativeParametersMatch: true, parameterBytes: bytes, parameterSha256, prepareCount,
      repeatedInputStorageIdentical: true, inputReferences: 1, layout: firstLayout, framesEncoded: 0, packetsProduced: 0 });
    assert.equal(core._within_split_encoder_close(), 0); assert.equal(core._within_split_encoder_input_refs(), 0);
    assert.equal(core._within_split_encoder_state(), 0);
  }
  // Validate every previously documented bitrate/quality pair without encoding.
  let settingsCases = 0;
  for (const bitrate of [300000, 600000, 1000000, 2000000, 4000000]) for (const [qmin, qmax] of [[8, 31], [4, 20], [2, 12]]) {
    setup({ width: 320, height: 180, bitrate, qmin, qmax });
    assert.equal(core._within_split_encoder_open(), 0); assert.equal(core._within_split_encoder_settings_match(), 1);
    assert.equal(core._within_split_encoder_parameters_check(), 0); core._within_split_encoder_close(); settingsCases++;
  }
  const rejectedConfigurations = [];
  for (const [at, value] of [[0, 2], [4, 1919], [8, 803], [12, 2], [16, 0], [24, 25], [32, 123456],
    [36, 1], [44, 0xffffffff], [48, 0], [64, 2], [72, 1], [92, 1]]) {
    setup(); config.setUint32(at, value, true);
    assert.ok(core._within_split_encoder_open() < 0); assert.equal(core._within_split_encoder_state(), 0);
    assert.equal(core._within_split_encoder_input_refs(), 0); rejectedConfigurations.push({ offset: at, value });
  }
  assert.equal(core._within_split_encoder_close(), 0);
  for (const [pointer, size] of [[configPointer, 96], [core._within_split_encoder_properties(), 65536],
    [core._within_split_encoder_parameters(), 65536]]) assert.ok(core.HEAPU8.subarray(pointer, pointer + size).every(x => x === 0));
  const report = { scope: "private-actual-codec-initialization-not-browser-conversion-acceptance", sources, artifacts,
    ffmpeg: { version: "8.1.2", releaseSha256: "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c" },
    emscripten: "6.0.4", memoryLimits, stackBytes, enabledEncoders, enabledDecoders, cases, settingsCases,
    rejectedConfigurations, finalInputReferences: 0, closedSlotsZeroed: true, framesEncoded: 0, packetsProduced: 0,
    originalRead: false, mediaRead: false, mediaWritten: false, conversionSeconds: null,
    completeChromiumMemoryMeasured: false, publicAcceptance: false };
  const text = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(text) <= 65536);
  await writeFile(new URL("initialization-contract.json", output), text, { flag: "wx" });
  process.stdout.write(`Actual MPEG2 initialized: ${cases.length} pixel layouts, ${settingsCases} settings, ${rejectedConfigurations.length} refusals; zero encoded frames.\n`);
} finally { core._within_split_encoder_close(); }
