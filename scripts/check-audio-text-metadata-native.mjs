// Actual local libavutil dictionary test only; never convert user media natively.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
assert.equal(process.platform, "win32", "This explicit local validation uses the installed Windows FFmpeg development SDK");
const runtime = await createOwnedRuntimeScratch("audio-metadata-native-");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const report = { startedAt: new Date().toISOString(), scope: "Real installed libavutil dictionary behavior, not browser/codec/memory/promotion acceptance", publicAcceptance: false };
try {
  const executable = path.join(runtime.directory, "check.exe");
  const compiler = "H:\\LLVM-MinGW\\llvm-mingw-20260616-ucrt-x86_64\\bin\\clang.exe";
  const sdk = "C:\\ffmpeg";
  report.sources = {};
  for (const file of ["tests/native/audio-text-metadata.c", "media/ffmpeg/audio-text-metadata.h", "media/ffmpeg/audio-muxer-metadata-order.h", "scripts/check-audio-text-metadata-native.mjs"])
    report.sources[file] = sha(await readFile(path.join(root, file)));
  report.native = { compilerSha256: sha(await readFile(compiler)), dictionaryHeaderSha256: sha(await readFile(path.join(sdk, "include/libavutil/dict.h"))),
    libavutilDllSha256: sha(await readFile(path.join(sdk, "bin/avutil-60.dll"))) };
  const options = { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 };
  await execute(compiler, ["tests/native/audio-text-metadata.c", "-std=c11", "-Wall", "-Wextra", "-Werror", "-O2",
    "-I" + path.join(sdk, "include"), path.join(sdk, "lib/libavutil.dll.a"), "-o", executable], options);
  report.behavior = JSON.parse((await execute(executable, [], options)).stdout);
  assert.equal(report.behavior.status, "passed-native-dictionary-behavior"); report.status = "passed";
} catch (error) { report.status = "failed"; report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await runtime.close(); report.ownedCompilerOutputAndScratchRemoved = true; report.finishedAt = new Date().toISOString();
  const output = path.join(root, "outputs/reports", report.startedAt.replaceAll(":", "-") + "-audio-metadata-native.json");
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: output, status: report.status, behavior: report.behavior, failure: report.failure }));
}
