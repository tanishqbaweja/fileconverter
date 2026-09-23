import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const source = (path) => readFileSync(path, "utf8");
const app = source("app/converter/ConverterApp.tsx");
const protocol = source("lib/conversion-protocol.ts");
const worker = source("workers/conversion.worker.ts");
const destination = source("workers/random-access-destination.ts");
const profiler = source("scripts/memory-profile.mjs");
const ffmpegLibraries = source("media/ffmpeg/build-libraries.sh");
const ffmpegBuild = source("media/ffmpeg/build-remux.sh");
const ffmpegReproduction = source("media/ffmpeg/reproduce-nondocker.sh");
const ffmpegDirectPatch = source(
  "media/ffmpeg/patches/direct-mp4-only-source.patch",
);
const mkvOptimizationEvidence = JSON.parse(
  source("evidence/mkv-to-mp4-current-chrome-optimization-2026-09-21.json"),
);

test("the current-browser MP4-to-AVI and MKV-to-MP4 routes use app-owned bounded staging", () => {
  assert.match(protocol, /mode: "staged-handle"/);
  assert.match(
    app,
    /batch\.profile\.id !== "mp4-to-avi"[\s\S]*batch\.profile\.id !== "mkv-to-mp4"/,
  );
  assert.match(app, /`within-stage-\$\{batch\.profile\.id\}-\$\{jobId\}`/);
  assert.match(app, /name\?\.startsWith\("within-stage-"\)/);
  assert.match(worker, /destination\.mode === "staged-handle"/);
  assert.match(worker, /stagingName\.startsWith\(`within-stage-\$\{profileId\}-`\)/);
  assert.match(worker, /profileId !== "mp4-to-avi" && profileId !== "mkv-to-mp4"/);
});

test("staged MP4-to-AVI checks quota, bounds copy memory, and cleans every terminal path", () => {
  assert.match(worker, /const requiredBytes = Math\.ceil\(sourceBytes \* 1\.25\)/);
  assert.match(worker, /navigator\.storage\.persist\?\.\(\)/);
  assert.match(worker, /const buffer = new Uint8Array\(copyChunkBytes\)/);
  assert.match(
    worker,
    /const STAGED_MKV_COPY_CHUNK = 512 \* 1024/,
  );
  assert.match(
    worker,
    /profileId === "mkv-to-mp4" \? STAGED_MKV_COPY_CHUNK : MAX_WRITE_CHUNK/,
  );
  assert.match(worker, /readAccess\.read\(buffer, { at: copiedBytes }\)/);
  assert.match(worker, /metrics\.pendingOperations = 1/);
  assert.match(worker, /await finalWritable\.write\(value\)/);
  assert.match(worker, /if \(copiedBytes !== stagedFile\.size\)/);
  assert.match(worker, /await finalWritable\?\.abort\(error\)/);
  assert.match(worker, /await removeStage\(\)/);
  assert.match(app, /replaceWorker\(worker, staleOpfsName\)/);
});

test("MP4-to-AVI disclosure and profiler cover the staging tradeoff and final-copy cancellation", () => {
  const profile = conversionProfiles.find(({ id }) => id === "mp4-to-avi");
  assert.ok(profile);
  assert.ok(
    profile.metadataLimitations.some(
      (note) =>
        note.includes("browser-private storage") &&
        note.includes("256 KiB") &&
        note.includes("deletes the temporary file"),
    ),
  );
  assert.match(profiler, /"Copying staged AVI to selected destination"/);
  assert.match(profiler, /"Copying staged MP4 to selected destination"/);
  assert.match(profiler, /outputBytes[\s\S]*1024 \* 1024/);
  assert.match(profiler, /phaseAtTrigger: cancellableState\?\.phase/);
});

test("MKV-to-MP4 discloses private staging and its bounded final copy", () => {
  const profile = conversionProfiles.find(({ id }) => id === "mkv-to-mp4");
  assert.ok(profile);
  assert.ok(
    profile.metadataLimitations.some(
      (note) =>
        note.includes("browser-private storage") &&
        note.includes("512 KiB") &&
        note.includes("every terminal path"),
    ),
  );
});

test("direct MKV-to-MP4 keeps the 1 MiB specialist without a writer worker", () => {
  assert.match(
    worker,
    /profileId === "avi-to-flv" \|\| profileId === "mkv-to-mp4"/,
  );
  assert.match(
    worker,
    /profileId === "mkv-to-mp4" \|\|[\s\S]*\? DIRECT_REMUX_WRITE_CHUNK/,
  );
  assert.match(
    destination,
    /asynchronousFileStreamDestination\([\s\S]*maximumWriteBytes = 256 \* 1024/,
  );
  assert.match(destination, /maximumWriteBytes,[\s\S]*File stream write exceeds/);
});

test("the MKV-to-MP4 profiler proves the compressed packets are unchanged", () => {
  assert.match(profiler, /const mkvMp4Copy = route === "mkv-to-mp4"/);
  assert.match(
    profiler,
    /Browser MKV-to-MP4 compressed HEVC or AAC packets do not exactly match the source/,
  );
  assert.match(profiler, /compressedPacketStreamHash: packetStreamHashes\[0\]/);
  assert.match(profiler, /mkvMp4Copy[\s\S]*"full-compressed-packet-hash"/);
});

test("the direct core is reproducibly built from an MKV-to-MP4-only FFmpeg surface", () => {
  assert.match(ffmpegLibraries, /WITHIN_MP4_COPY_ONLY/);
  assert.match(ffmpegLibraries, /ENABLED_DEMUXERS=matroska/);
  assert.match(ffmpegLibraries, /ENABLED_MUXERS=mp4/);
  assert.match(ffmpegLibraries, /ENABLED_PARSERS=aac,h264,hevc/);
  assert.match(ffmpegLibraries, /ENABLED_BSFS=aac_adtstoasc/);
  assert.match(ffmpegBuild, /"routeSpecialized": true/);
  assert.match(
    ffmpegBuild,
    /"within-direct"[\s\S]*"initialWasmMemoryBytes": 25165824[\s\S]*"maximumWasmMemoryBytes": 67108864/,
  );
  assert.match(
    ffmpegDirectPatch,
    /profile != 1 && inspect_stream_info[\s\S]*synthesize_video_dts\[index\] = 1[\s\S]*frame_size = 1024/,
  );
  assert.match(
    ffmpegReproduction,
    /WITHIN_MP4_COPY_ONLY=1 \.\/build-libraries\.sh/,
  );
  assert.match(
    ffmpegReproduction,
    /direct-mp4-only-source\.patch[\s\S]*WITHIN_BUILD_CORE_FILTER=within-direct/,
  );
});

test("compact MKV-to-MP4 evidence retains the accepted and rejected frontier", () => {
  assert.equal(mkvOptimizationEvidence.status, "accepted");
  const accepted = mkvOptimizationEvidence.candidates.find(
    ({ result }) => result === "accepted",
  );
  assert.ok(accepted);
  assert.equal(accepted.elapsedMsByRun.length, 3);
  assert.ok(accepted.peakIncrementalPrivateMiB <= 250);
  assert.equal(accepted.finalCopyBufferBytes, 512 * 1024);
  assert.match(accepted.outputSha256, /^[a-f0-9]{64}$/);
  assert.match(accepted.videoPacketSha256, /^[a-f0-9]{64}$/);
  assert.match(accepted.audioPacketSha256, /^[a-f0-9]{64}$/);
  assert.ok(
    mkvOptimizationEvidence.candidates.some(
      ({ name, result, peakIncrementalPrivateMiB }) =>
        name.includes("1 MiB private-stage final copy") &&
        result === "rejected" &&
        peakIncrementalPrivateMiB > 250,
    ),
  );
  assert.equal(mkvOptimizationEvidence.dockerUsed, false);
});
