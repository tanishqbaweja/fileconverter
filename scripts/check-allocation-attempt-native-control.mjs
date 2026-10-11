// Local compiled synthetic contract only. Never browser/original-video acceptance.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAllocationAttemptRecipe } from "../media/ffmpeg/mpeg2-allocation-attempt-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const files = ["media/ffmpeg/mpeg2-allocation-attempt.c", "media/ffmpeg/mpeg2-allocation-attempt-smoke.c",
  "media/ffmpeg/mpeg2-allocation-attempt-recipe.mjs", "media/ffmpeg/build-mpeg2-allocation-attempt.mjs",
  "media/ffmpeg/mpeg2-aligned-reuse.c", "media/ffmpeg/mpeg2-single-idle-recipe.mjs",
  "media/ffmpeg/mpeg2-late-refstruct-recipe.mjs", "media/ffmpeg/mpeg2-aligned-reuse-recipe.mjs",
  "media/ffmpeg/build-mpeg2-split-pipeline.sh", "scripts/check-allocation-attempt-native-control.mjs",
  "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/stable-ui-headless-baseline-recipe.mjs", "tests/mpeg2-allocation-attempt.test.mjs"];
const preimages = Object.fromEntries(await Promise.all(files.map(async file => [file, (await read(file)).toString("base64")])));
const sourcePins = Object.fromEntries(Object.entries(preimages).map(([file, encoded]) => [file, sha(Buffer.from(encoded, "base64"))]));
const runtime = await createOwnedRuntimeScratch("allocation-attempt-native-");
const execute = promisify(execFile);
let compilerVersion, smoke = null, failure = null;
try {
  compilerVersion = (await execute("cc", ["--version"], { cwd: root, env: runtime.env, windowsHide: true, timeout: 5000, maxBuffer: 4096 })).stdout.trim();
  const program = path.join(runtime.directory, process.platform === "win32" ? "smoke.exe" : "smoke");
  await execute("cc", ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-UNDEBUG",
    "media/ffmpeg/mpeg2-allocation-attempt-smoke.c", "-o", program],
  { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  smoke = JSON.parse((await execute(program, [], { cwd: root, env: runtime.env, windowsHide: true, timeout: 5000, maxBuffer: 4096 })).stdout);
  assert.equal(smoke.passed, 9); assert.equal(smoke.conversionsPerformed, 0);
} catch (error) { failure = { message: String(error).slice(0, 4096), stderr: String(error.stderr ?? "").slice(0, 4096) }; process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const postSourcePins = Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await read(file))])));
assert.deepEqual(postSourcePins, sourcePins);
const generatedRecipe = makeAllocationAttemptRecipe((await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")).toString());
const report = { recordedAt: new Date().toISOString(), status: failure ? "failed-synthetic-native-dispatch" : "passed-synthetic-native-dispatch-not-wasm-or-media",
  compilerVersion, smoke, failure, sourcePins, postSourcePins, preimages, generatedRecipe, generatedRecipeSha256: sha(generatedRecipe),
  scratchRemoved: true, ownedRuntime: runtime.directory, browserConversionsPerformed: 0,
  protectedSourceRead: false, publicAcceptance: false, originalFailureCauseProven: false };
await mkdir(path.join(root, "evidence"), { recursive: true });
const output = `evidence/${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-allocation-attempt-native-control.json`;
await writeFile(path.join(root, output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: report.status, smoke, scratchRemoved: true, browserConversionsPerformed: 0 }));
