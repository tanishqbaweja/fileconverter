// Matched serializer-only experiment, NEVER native media conversion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeAudioOggArtworkLowerCopyCandidate } from "../media/ffmpeg/audio-ogg-artwork-lower-copy-candidate.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), sha = b => createHash("sha256").update(b).digest("hex");
assert.equal(process.platform, "win32");
const runtime = await createOwnedRuntimeScratch("audio-ogg-lower-copy-native-");
const report = { startedAt: new Date().toISOString(), scope: "paired serializer-only allocation/timing, NOT browser conversion speed or acceptance",
  publicAcceptance: false, browserConversionVerified: false, nativeMediaConversionUsed: false };
try {
  const compiler = "H:/LLVM-MinGW/llvm-mingw-20260616-ucrt-x86_64/bin/clang.exe", sdk = "C:/ffmpeg";
  const baseline = await readFile(path.join(root, "media/ffmpeg/audio-ogg-artwork.h"), "utf8");
  const candidate = makeAudioOggArtworkLowerCopyCandidate(baseline);
  const header = path.join(runtime.directory, "candidate.h"), output = path.join(runtime.directory, "benchmark.exe");
  await writeFile(header, candidate.generated, { flag: "wx" });
  report.derivation = { baselineSha256: candidate.baselineSha256, candidateSha256: candidate.generatedSha256,
    reversibleEdits: candidate.edits.length, maximumHeaderStackBytes: candidate.maximumHeaderStackBytes, maximumBridgeStackBytes: candidate.maximumBridgeStackBytes };
  report.sources = {};
  for (const file of ["tests/native/audio-ogg-artwork-lower-copy.c", "media/ffmpeg/audio-ogg-artwork.h", "media/ffmpeg/audio-text-metadata.h",
    "media/ffmpeg/audio-ogg-artwork-lower-copy-candidate.mjs", "scripts/benchmark-audio-ogg-artwork-lower-copy-native.mjs"])
    report.sources[file] = sha(await readFile(path.join(root, file)));
  report.native = { compilerSha256: sha(await readFile(compiler)), libavutilDllSha256: sha(await readFile(path.join(sdk, "bin/avutil-60.dll"))) };
  const options = { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 };
  await execute(compiler, ["tests/native/audio-ogg-artwork-lower-copy.c", "-std=c11", "-Wall", "-Wextra", "-Werror", "-O2",
    '-DWITHIN_LOWER_COPY_HEADER="' + header.replaceAll("\\", "/") + '"', "-I" + path.join(sdk, "include"),
    path.join(sdk, "lib/libavutil.dll.a"), "-o", output], options);
  report.behavior = JSON.parse((await execute(output, [], options)).stdout);
  assert.equal(report.behavior.status, "passed-matched-native-serializer-only");
  const median = numbers => { const sorted = numbers.toSorted((a, b) => a - b); return (sorted[3] + sorted[4]) / 2; };
  report.timing = [128, 65536, 4194304].map(imageBytes => {
    const rows = report.behavior.measurements.filter(row => row.imageBytes === imageBytes); assert.equal(rows.length, 8);
    const baselineMs = median(rows.map(row => row.baselineMs)), candidateMs = median(rows.map(row => row.candidateMs));
    return { imageBytes, iterationsPerBatch: rows[0].iterations, pairedBatches: rows.length, baselineMedianBatchMs: baselineMs,
      candidateMedianBatchMs: candidateMs, medianBatchSpeedup: baselineMs / candidateMs,
      candidateFasterBatches: rows.filter(row => row.candidateMs < row.baselineMs).length, scope: "native-serializer-only-not-browser-speed" };
  });
  report.status = "passed-differential-allocation-and-native-timing-probe-browser-unverified";
} catch (error) { report.status = "failed"; report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await runtime.close(); await assert.rejects(lstat(runtime.directory), { code: "ENOENT" }); report.ownedCompilerOutputAndScratchRemoved = true;
  report.finishedAt = new Date().toISOString(); const file = path.join(root, "outputs/reports", report.startedAt.replaceAll(":", "-") + "-audio-ogg-lower-copy-native.json");
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: file, status: report.status, timing: report.timing, failure: report.failure }));
}
