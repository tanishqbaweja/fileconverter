import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { loadMkvEditListBuildArtifact } from "./lib/mkv-edit-list-build-artifact.mjs";
import { retainQualifiedHeaderNativeCache } from "./lib/mkv-header-native-cache.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("mkv-header-native-reproduction-");
const r = { scope: "exact native rebuild reproduction and explicit reusable qualification-code retention, not browser conversion",
  status: "running", failures: [], dockerUsed: false, nativeConversionUsed: false, publicAcceptance: false };
try {
  const tools = await loadMkvEditListBuildArtifact("43691831594", "0e2f2caa924413a1edc81c23c49c027dd952fec8", runtime, true, true, true, true, true, true);
  r.actualRebuiltNativeProof = tools.proof;
  const license = (await promisify(execFile)(path.join(process.env.SystemRoot ?? "C:/Windows", "System32/tar.exe"),
    ["-xOf", path.join(runtime.directory, "mkv-edit-list-tools.zip"), "LICENSE.ffmpeg-lgpl3"],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, encoding: "buffer", maxBuffer: 32768 })).stdout;
  r.retainedQualificationCode = await retainQualifiedHeaderNativeCache(root, tools, license);
  r.status = "passed-complete-native-rebuild-byte-reproduction-not-browser-or-public-acceptance";
} catch (error) { r.status = "failed-native-rebuild-reproduction"; r.failures.push(String(error.stack ?? error).slice(0, 2048)); process.exitCode = 1; }
finally {
  try { await runtime.close(); r.disposableDownloadedArchiveRemoved = true; }
  catch (error) { r.status = "failed-owned-runtime-cleanup"; r.failures.push(String(error)); process.exitCode = 1; }
  r.sourcePins = {};
  for (const file of ["scripts/retain-mkv-header-native.mjs", "scripts/lib/mkv-header-native-cache.mjs", "scripts/lib/mkv-edit-list-build-artifact.mjs"])
    r.sourcePins[file] = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
  const file = `evidence/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-mkv-header-native-reproduction.json`;
  await writeFile(path.join(root, file), JSON.stringify(r, null, 2) + "\n", { flag: "wx" }); console.log(JSON.stringify({ file, status: r.status, failures: r.failures }));
}
