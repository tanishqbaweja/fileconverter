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
  "build-mpeg2-candidate.sh", "mpeg2-candidate-manifest.mjs", "patches/matroska-bounded-no-cues.patch",
  "patches/mov-bounded-custom-metadata.patch", "patches/mov-fragmented-cover-metadata-only.patch",
  "mpeg2-allocator-diagnostic.h", "patches/mpeg2-encoder-uncached-frame-buffers.patch",
  "patches/hevc-decoder-uncached-frame-buffers.patch", "patches/mov-fragmented-aac-exact-priming.patch",
  "patches/refstruct-readonly-pool-diagnostic.patch", "refstruct-diagnostic-smoke.c"];
const allocatorDiagnostic = process.env.WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC ?? "0";
if (!["0", "1"].includes(allocatorDiagnostic)) throw new Error("Private MPEG2 allocator diagnostic must be 0 or 1");
const refstructSourceSha256 = await sha256(path.join(build, "ffmpeg/libavutil/refstruct.c"));
if (refstructSourceSha256 !== (allocatorDiagnostic === "1"
  ? "715cba26d3c68d65db8edf584f2dc3daae555de92f1003b5cfe3f32d6ddbb0b2"
  : "d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f"))
  throw new Error("Unexpected refstruct diagnostic source state");
const refstructPoolDiagnosticSmoke = allocatorDiagnostic === "1"
  ? JSON.parse(await readFile(path.join(output, "refstruct-diagnostic-smoke.json"), "utf8")) : null;
if (refstructPoolDiagnosticSmoke && JSON.stringify(refstructPoolDiagnosticSmoke) !== JSON.stringify({
  status: "passed", scope: "synthetic-source-reader-unit-not-conversion", payloadBytes: 1024,
  checkedTransitions: 9, multipleReferencesNotMultipleEntries: true, cacheReuseVerified: true,
  cap129InactiveLinksUnavailable: true, nullPoolUnavailable: true,
})) throw new Error("Compiled diagnostic reader did not produce the exact required smoke proof");
if (allocatorDiagnostic === "1" && !refstructPoolDiagnosticSmoke)
  throw new Error("Compiled diagnostic smoke proof missing");
// Inspect real generated artifacts, not just their declared build flags.
const generatedRuntime = await readFile(path.join(output, "within-mpeg2.mjs"), "utf8");
const asyncifyStackSizes = [...generatedRuntime.matchAll(/\bStackSize:(\d+),currData:/g)];
if (asyncifyStackSizes.length !== 1 || Number(asyncifyStackSizes[0][1]) !== 262144)
  throw new Error("Generated Asyncify reserve differs from the guarded candidate");
const compiledModule = new WebAssembly.Module(await readFile(path.join(output, "within-mpeg2.wasm")));
const compiledImports = WebAssembly.Module.imports(compiledModule);
const compiledExports = WebAssembly.Module.exports(compiledModule);
if (!compiledImports.some((entry) => entry.name === "__handle_stack_overflow" && entry.kind === "function")
  || !compiledExports.some((entry) => entry.name === "__set_stack_limits" && entry.kind === "function"))
  throw new Error("Compiled StackCheck2 runtime guard missing");
for (const name of ["emscripten_stack_get_base", "emscripten_stack_get_end"])
  if (!compiledExports.some((entry) => entry.name === name && entry.kind === "function"))
    throw new Error("Native stack bound export missing");
const manifest = {
  status: "private-feasibility-candidate-not-certified-not-public",
  ffmpegVersion: "8.1.2", ffmpegSourceSha256, emscriptenVersion: "6.0.4",
  allocatorDiagnostic: allocatorDiagnostic === "1",
  allocatorInstrumentationSha256: await sha256(path.join(root, "scripts/lib/mpeg2-allocator-instrumentation.mjs")),
  allocatorDiagnosticScope: "Private fixed96 heap/frame snapshots plus fixed128 refstruct pool snapshots; read-only128-link cap and null incomplete counts; no allocator/codec mutation or acceptance",
  refstructSourceSha256,
  refstructPoolDiagnosticLimits: { heapSnapshots: 96, poolSnapshots: 128, inactiveLinksPerSnapshot: 128, browserEvents: 224 },
  refstructPoolDiagnosticSmoke,
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
  nativeStackBytes: 262144, asyncifyStackBytes: Number(asyncifyStackSizes[0][1]),
  stackOverflowCheck: 2, compiledStackOverflowHandler: true,
  stackReserveScope: "Private guarded256KiB C +256KiB Asyncify candidate inside unchanged32MiB; actual stack demand, full-source fit and performance not certified",
  stackReserveAdapterSha256: await sha256(path.join(root, "scripts/lib/mpeg2-stack-reserve-adapter.mjs")),
  encoderDelay: "MPEG2 LOW_DELAY with max_b_frames=0; no omitted frames or dimension/quantizer change",
  frameBufferPolicy: "Private encoder-only uncached planes plus HEVC decoder uncached planes; exact upstream alignment/padding/zeroing/live references; other decoder and HEVC auxiliary pools unchanged",
  frameBufferOriginalSourceSha256: "38efe5e7fc627437306290919c8de3e2de5817d611b29d1f98e7ee6c12a8fb19",
  frameBufferEncoderStageSourceSha256: "62a73fe537318e4706f25904022d071e8f8ef9535b5334bf5c7b650e572c0478",
  frameBufferPatchedSourceSha256: "910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4",
  avioInputBufferBytes: 262144, avioOutputBufferBytes: 262144,
  maximumStreams: 32, maximumChapters: 1024, maximumAttachmentBytes: 8388608,
  maximumMetadataEntries: 4096, maximumMetadataTextBytes: 2097152,
  mp4Metadata: "iTunes covr plus free-form UTF-8 original-name fields; source-pinned private mux patch",
  mp4AacPriming: "Private fragmented AAC edit-list candidate retains copied initial_padding in sample units; no codec, compressed packet or source clock rewriting; browser fidelity unproven",
  mp4MetadataStageSourceSha256: "e2d80222a7e8f4c42257540ed9ea011c6a8be7ac447cbf4ed60dae758319f509",
  mp4PrimingPatchedSourceSha256: "f93e901eef7867d56373d07afc32237e051f28cf64b2d9a0bca2474a36c0fcad",
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
