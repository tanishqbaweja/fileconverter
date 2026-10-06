import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
const root = new URL("../../", import.meta.url), output = new URL("work/mpeg2-split-pipeline-output/", root);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const artifacts = {}, memories = {}, sources = {};
for (const file of ["within-mpeg2-split.mjs", "within-mpeg2-split.wasm", "split-encoder.mjs", "split-encoder.wasm",
  "config_components.h", "LICENSE.ffmpeg", "encoder-initialization.json"]) artifacts[file] = sha(await readFile(new URL(file, output)));
for (const [role, file, pages] of [["decoderMux", "within-mpeg2-split.wasm", 512], ["encoder", "split-encoder.wasm", 256]]) {
  memories[role] = readWasmMemoryLimits(await readFile(new URL(file, output)));
  assert.deepEqual(memories[role], [{ imported: true, initialPages: pages, maximumPages: pages, shared: true }]);
}
const components = await readFile(new URL("config_components.h", output), "utf8");
assert.equal([...components.matchAll(/^#define CONFIG_(\w+)_ENCODER 1$/gm)].length, 0);
const encoder = JSON.parse(await readFile(new URL("encoder-initialization.json", output)));
for (const [file, hash] of Object.entries(encoder.sources)) assert.equal(sha(await readFile(new URL(file, root))), hash);
assert.equal(artifacts["split-encoder.mjs"], encoder.artifacts["split-encoder.mjs"]);
assert.equal(artifacts["split-encoder.wasm"], encoder.artifacts["split-encoder.wasm"]);
for (const file of ["media/ffmpeg/build-mpeg2-split-pipeline.sh", "media/ffmpeg/mpeg2-split-pipeline-manifest.mjs",
  "media/ffmpeg/make-mpeg2-split-pipeline.mjs", "media/ffmpeg/mpeg2-split-kernel.mjs", "media/ffmpeg/mpeg2-split-mux-bridge.h",
  "media/ffmpeg/within_remux.c", "media/ffmpeg/mpeg2-candidate.c", "media/ffmpeg/mpeg2-split-codec-parameters.h",
  "media/ffmpeg/mpeg2-split-frame-layout.h", "media/ffmpeg/mpeg2-split-frame-properties.h",
  "scripts/lib/mpeg2-split-session.mjs", "scripts/lib/mpeg2-split-frame-bridge.mjs",
  "scripts/lib/mpeg2-split-frame-layout.mjs", "scripts/lib/mpeg2-split-frame-properties.mjs",
  "scripts/lib/mpeg2-split-packet-bridge.mjs", "scripts/lib/wasm-memory-limits.mjs",
  "media/ffmpeg/patches/matroska-bounded-no-cues.patch", "media/ffmpeg/patches/mov-fragmented-cover-metadata-only.patch",
  "media/ffmpeg/patches/mov-bounded-custom-metadata.patch", "media/ffmpeg/patches/mov-fragmented-aac-exact-priming.patch",
  "media/ffmpeg/patches/mpeg2-encoder-uncached-frame-buffers.patch", "media/ffmpeg/patches/mpeg2-encoder-uncached-accessories.patch",
  "media/ffmpeg/patches/hevc-decoder-uncached-frame-buffers.patch", "media/ffmpeg/mpeg2-hevc-auxiliary-policy.mjs",
  "media/ffmpeg/mpeg2-hevc-auxiliary-policy.h", "media/ffmpeg/apply-mpeg2-split-hevc-policy.mjs"]) sources[file] = sha(await readFile(new URL(file, root)));
const text = JSON.stringify({ scope: "private-production-AVIO-split-codec-pipeline-not-browser-acceptance",
  ffmpeg: "8.1.2", emscripten: "6.0.4", artifacts, sources, memories,
  decoderMemoryBytes: 33554432, encoderMemoryBytes: 16777216, aggregateWasmMemoryBytes: 50331648,
  nativeStackBytesPerCore: 262144, asyncifyStackBytesDecoder: 262144, stackOverflowCheck: 2,
  allowMemoryGrowth: false, allocator: "dlmalloc", publicAcceptance: false, browserConversionVerified: false,
  conversionSeconds: null, completeChromiumMemoryMeasured: false }, null, 2) + "\n";
assert.ok(Buffer.byteLength(text) < 65536);
await writeFile(new URL("build-manifest.json", output), text, { flag: "wx" });
process.stdout.write("Private split pipeline compiled; both actual fixed Wasm memories verified. Browser conversion remains required.\n");
