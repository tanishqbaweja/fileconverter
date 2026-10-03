import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const build = path.resolve(process.argv[2] ?? "");
const output = path.resolve(process.argv[3] ?? "");
if (build !== path.join(root, "work/h264-candidate-build") ||
    output !== path.join(root, "work/h264-candidate-output")) throw new Error("Candidate paths escaped owned work directories.");
const sha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const components = await readFile(path.join(output, "config_components.h"), "utf8");
const enabled = (kind) => [...components.matchAll(new RegExp(`^#define CONFIG_(\\w+)_${kind} 1$`, "gm"))]
  .map((match) => match[1].toLowerCase()).sort();
const manifest = {
  status: "private-feasibility-candidate-not-certified-not-public",
  ffmpegVersion: "8.1.2",
  ffmpegSourceSha256: "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c",
  openh264Version: "2.6.0",
  openh264Commit: "652bdb7719f30b52b08e506645a7322ff1b2cc6f",
  openh264SourceSha256: await sha256(path.join(build, "openh264.tar.gz")),
  emscriptenVersion: "6.0.4",
  currentAvioWrapperSourceSha256: await sha256(path.join(root, "media/ffmpeg/within_remux.c")),
  generatedWrapperSourceSha256: await sha256(path.join(build, "within_h264.c")),
  candidateKernelSha256: await sha256(path.join(root, "media/ffmpeg/h264-candidate.c")),
  buildRecipeSha256: await sha256(path.join(root, "media/ffmpeg/build-h264-candidate.sh")),
  forceIntraBridgeSha256: await sha256(path.join(root, "media/ffmpeg/openh264-force-intra.cpp")),
  forceIntraPatchSha256: await sha256(path.join(root, "media/ffmpeg/patches/openh264-force-intra-wasm.patch")),
  forceIntraCall: "Typed C++ virtual call with explicit all-layers argument -1; no function-cast emulation",
  matroskaNoCuesPatchSha256: await sha256(path.join(root, "media/ffmpeg/patches/matroska-bounded-no-cues.patch")),
  matroskaFinalization: "Normal seekable duration/tag/segment finalization; per-keyframe cue collection disabled",
  mp4Timing: "Delay bounded initial fragment header for accurate edit lists; disable automatic negative timestamp shifting",
  artifacts: Object.fromEntries(await Promise.all(["within-h264.mjs", "within-h264.wasm"].map(async (file) => [file, await sha256(path.join(output, file))]))),
  enabledDecoders: enabled("DECODER"), enabledEncoders: enabled("ENCODER"),
  enabledDemuxers: enabled("DEMUXER"), enabledMuxers: enabled("MUXER"),
  enabledParsers: enabled("PARSER"), enabledBitstreamFilters: enabled("BSF"),
  initialWasmMemoryBytes: 67108864, maximumWasmMemoryBytes: 67108864,
  allowMemoryGrowth: false, codecThreads: 1, pthreadPoolSize: 0,
  avioInputBufferBytes: 262144, avioOutputBufferBytes: 262144,
  maximumStreams: 32, maximumChapters: 1024, maximumAttachmentBytes: 8388608,
  encoderFrameSkipping: false, normalizesSourceTiming: false,
  primaryVideo: "decoded-and-encoded-to-H.264", secondaryStreams: "compatible-packet-copy-with-explicit-exclusions",
  licenses: ["FFmpeg LGPL-2.1-or-later", "OpenH264 BSD-2-Clause"],
  patentScope: "Self-compiled Wasm is not a Cisco-distributed binary; no claim of Cisco royalty coverage or legal clearance.",
  requiredUnpassedGates: ["production-browser validation", "fidelity", "speed A/B", "complete-process private memory", "stress repeats and scaling", "failure/cancellation/cleanup", "reproducibility", "legal deployment review", "registry/UI integration"],
};
await writeFile(path.join(output, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
