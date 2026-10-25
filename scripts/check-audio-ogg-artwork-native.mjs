// Actual installed SDK serialization only, never native user-media conversion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), sha = b => createHash("sha256").update(b).digest("hex");
assert.equal(process.platform, "win32");
const runtime = await createOwnedRuntimeScratch("audio-ogg-artwork-native-");
const report = { startedAt: new Date().toISOString(), scope: "real installed libavutil picture serialization, NOT a native converter or browser acceptance", publicAcceptance: false };
try {
  const compiler = "H:/LLVM-MinGW/llvm-mingw-20260616-ucrt-x86_64/bin/clang.exe", sdk = "C:/ffmpeg";
  const output = path.join(runtime.directory, "check.exe"), options = { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 };
  report.sources = {};
  for (const file of ["tests/native/audio-ogg-artwork.c", "media/ffmpeg/audio-ogg-artwork.h", "media/ffmpeg/audio-text-metadata.h", "scripts/check-audio-ogg-artwork-native.mjs"])
    report.sources[file] = sha(await readFile(path.join(root, file)));
  report.native = { compilerSha256: sha(await readFile(compiler)), libavutilDllSha256: sha(await readFile(path.join(sdk, "bin/avutil-60.dll"))) };
  await execute(compiler, ["tests/native/audio-ogg-artwork.c", "-std=c11", "-Wall", "-Wextra", "-Werror", "-O2", "-I" + path.join(sdk, "include"),
    path.join(sdk, "lib/libavutil.dll.a"), "-o", output], options);
  report.behavior = JSON.parse((await execute(output, [], options)).stdout);
  assert.equal(report.behavior.status, "passed-native-Ogg-picture-serialization"); report.status = "passed";
} catch (error) { report.status = "failed"; report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await runtime.close(); await assert.rejects(lstat(runtime.directory), { code: "ENOENT" }); report.ownedCompilerOutputAndScratchRemoved = true;
  report.finishedAt = new Date().toISOString(); const file = path.join(root, "outputs/reports", report.startedAt.replaceAll(":", "-") + "-audio-ogg-artwork-native.json");
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: file, status: report.status, behavior: report.behavior, failure: report.failure }));
}
