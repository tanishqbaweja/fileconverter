// Compiles/runs arithmetic tests only: no native media conversion or output.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const runtime = await createOwnedRuntimeScratch("h264-startup-smoke-");
try {
  const execute = promisify(execFile), root = path.resolve(import.meta.dirname, "..");
  const file = path.join(runtime.directory, process.platform === "win32" ? "smoke.exe" : "smoke");
  const options = { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 };
  await execute(process.env.WITHIN_CC_EXECUTABLE ?? "clang", ["-std=c11", "-Wall", "-Wextra", "-Werror", "-O2",
    "media/ffmpeg/h264-startup-dts-smoke.c", "-o", file], options);
  await execute(file, [], options);
  console.log(JSON.stringify({ status: "passed-native-arithmetic-smoke-not-browser-acceptance", mediaInputs: 0, nativeMediaConversion: false }));
} finally { await runtime.close(); assert.equal(runtime.directory.includes(path.sep + "work" + path.sep), true); }
