import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const build = path.resolve(process.argv[2] ?? "");
const output = path.resolve(process.argv[3] ?? "");
if (build !== path.join(root, "work/mpeg2-candidate-build") ||
    output !== path.join(root, "work/mpeg2-candidate-output")) {
  throw new Error("Candidate paths escaped owned work directories.");
}
const sha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const components = await readFile(path.join(output, "config_components.h"), "utf8");
const enabled = (kind) => [...components.matchAll(new RegExp(`^#define CONFIG_(\\w+)_${kind} 1$`, "gm"))]
  .map((match) => match[1].toLowerCase()).sort();
if (JSON.stringify(enabled("ENCODER")) !== '["mpeg2video"]') {
  throw new Error("Specialist build must enable exactly the MPEG-2 encoder.");
}
const ffmpegSourceSha256 = await sha256(path.join(build, "ffmpeg.tar.xz"));
if (ffmpegSourceSha256 !== "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c") {
  throw new Error("FFmpeg archive changed.");
}
const sourceFiles = ["within_remux.c", "mpeg2-candidate.c", "make-mpeg2-candidate.mjs",
  "build-mpeg2-candidate.sh", "mpeg2-candidate-manifest.mjs", "patches/matroska-bounded-no-cues.patch"];
const manifest = {
  status: "private-feasibility-candidate-not-certified-not-public",
  ffmpegVersion: "8.1.2", ffmpegSourceSha256, emscriptenVersion: "6.0.4",
  sources: Object.fromEntries(await Promise.all(sourceFiles.map(async (file) =>
    [file, await sha256(path.join(root, "media/ffmpeg", file))]))),
  generatedWrapperSourceSha256: await sha256(path.join(build, "within_mpeg2.c")),
  artifacts: Object.fromEntries(await Promise.all(["within-mpeg2.mjs", "within-mpeg2.wasm"].map(async (file) =>
    [file, await sha256(path.join(output, file))]))),
  enabledDecoders: enabled("DECODER"), enabledEncoders: enabled("ENCODER"),
  enabledDemuxers: enabled("DEMUXER"), enabledMuxers: enabled("MUXER"),
  enabledParsers: enabled("PARSER"), enabledBitstreamFilters: enabled("BSF"),
  initialWasmMemoryBytes: 33554432, maximumWasmMemoryBytes: 33554432,
  allowMemoryGrowth: false, codecThreads: 1, pthreadPoolSize: 0,
  avioInputBufferBytes: 262144, avioOutputBufferBytes: 262144,
  maximumStreams: 32, maximumChapters: 1024, maximumAttachmentBytes: 8388608,
  genericDemuxIndexHintBytesPerStream: 32768,
  demuxIndexBudgetScope: "Generic indexes honoring the hint, not a universal backing-allocation bound",
  primaryVideo: "genuine decoding and MPEG-2 encoding; no automatic resizing",
  secondaryStreams: "compatible packet copying; incompatible streams explicitly disclosed",
  controls: "requested resolution cap, bitrate, quality and rational phase-accumulator frame-rate cap",
  timeline: "CFR only; source start offset restored after encoder packet rescaling; VFR refused explicitly",
  pixelFormat: "8-bit YUV420P or source YUV422P; other conversions disclosed; full-range video refused",
  finalization: "normal seekable Matroska finalization without unbounded cues; bounded fragmented MP4",
  licenses: ["FFmpeg LGPL-2.1-or-later"],
  legalScope: "No GPL/nonfree/external encoder enabled; patent/deployment review not yet cleared",
  requiredUnpassedGates: ["production-browser conversion", "independent fidelity and timing",
    "complete-process private memory", "three repeats and multi-gigabyte scaling",
    "privacy", "success/cancellation/write-failure/cleanup", "same-setting speed A/B",
    "reproducibility", "legal deployment review", "registry/UI integration"],
};
await writeFile(path.join(output, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
