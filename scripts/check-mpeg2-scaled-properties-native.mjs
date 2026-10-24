import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.platform, "win32");
const runtime = await createOwnedRuntimeScratch("mpeg2-scaled-properties-native-");
const compiler = "H:/LLVM-MinGW/llvm-mingw-20260616-ucrt-x86_64/bin/clang.exe", sdk = "C:/ffmpeg";
const report = { scope: "Actual installed libavutil API/property-wire behavior; no media/browser conversion or native-core rebuild", startedAt: new Date().toISOString(), publicAcceptance: false };
try {
  const sources = ["media/ffmpeg/mpeg2-scaled-frame-properties.h", "media/ffmpeg/mpeg2-split-frame-properties.h", "media/ffmpeg/mpeg2-candidate.c",
    "tests/native/mpeg2-scaled-frame-properties.c", "scripts/check-mpeg2-scaled-properties-native.mjs"];
  report.sources = Object.fromEntries(await Promise.all(sources.map(async file => [file, sha(await readFile(path.join(root, file)))])));
  report.native = Object.fromEntries(await Promise.all([compiler, path.join(sdk, "include/libavutil/frame.h"), path.join(sdk, "bin/avutil-60.dll")]
    .map(async file => [file, sha(await readFile(file))])));
  const executable = path.join(runtime.directory, "probe.exe"), options = { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 };
  await execute(compiler, ["tests/native/mpeg2-scaled-frame-properties.c", "-std=c11", "-Wall", "-Wextra", "-Werror", "-Wno-unused-function", "-O2",
    "-I" + path.join(sdk, "include"), path.join(sdk, "lib/libavutil.dll.a"), "-o", executable], options);
  report.behavior = JSON.parse((await execute(executable, [], options)).stdout);
  assert.equal(report.behavior.status, "passed-native-scaled-property-lifecycle"); report.status = "passed";
} catch (error) { report.status = "failed"; report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); report.scratchRemoved = true;
  report.finishedAt = new Date().toISOString();
  const destination = path.join(root, "evidence", report.startedAt.replaceAll(":", "-") + "-mpeg2-scaled-properties-native.json");
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report));
}
