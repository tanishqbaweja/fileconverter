import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(root, "work");
const sourcePath = path.join(root, "media", "ffmpeg", "within_remux.c");
const generatorPath = path.join(root, "media", "ffmpeg", "make-aiff-specialist.mjs");
const engineRoot = path.join(root, "public", "engines", "remux");

test("the published AIFF specialist derives reproducibly from the exact general wrapper", async () => {
  await mkdir(workRoot, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(workRoot, "aiff-source-test-"));
  try {
    const candidatePath = path.join(temporaryDirectory, "within_aiff.c");
    await execFileAsync(process.execPath, [generatorPath, sourcePath, candidatePath], {
      cwd: root,
      windowsHide: true,
    });
    const candidate = await readFile(candidatePath, "utf8");
    const digest = createHash("sha256").update(candidate).digest("hex");
    assert.equal(digest, "a542881bee3e4cd407f61be87d284fabe6a9ab7b70d2c1db63e542f745395814");
    assert.match(candidate, /static\s+int within_remux\(/);
    assert.equal((candidate.match(/EMSCRIPTEN_KEEPALIVE/g) ?? []).length, 1);
    assert.match(candidate, /int within_aiff\(/);
    assert.match(candidate, /return within_audio_transcode\(28,/);
  } finally {
    if (!temporaryDirectory.startsWith(`${workRoot}${path.sep}`)) {
      throw new Error(`The test directory escaped project-local work: ${temporaryDirectory}`);
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("the published AIFF bytes and bounded manifest match the accepted browser candidate", async () => {
  const manifest = JSON.parse(await readFile(path.join(engineRoot, "build-manifest.json"), "utf8"));
  const specialist = manifest.modules.find(({ name }) => name === "within-aiff");
  assert.deepEqual(specialist, {
    name: "within-aiff",
    wasmPthreadPoolSize: 0,
    videoCodecThreads: 1,
    initialWasmMemoryBytes: 16777216,
    maximumWasmMemoryBytes: 33554432,
    wasmGrowthStepBytes: 4194304,
    entrypoint: "within_aiff",
    sourceSha256: "a542881bee3e4cd407f61be87d284fabe6a9ab7b70d2c1db63e542f745395814",
    profiles: ["m4a-to-aiff"],
  });
  for (const [filename, expectedSha256] of [
    ["within-aiff.mjs", "01caddd34039e3c4b593589a29d32b9518e9af592528179e4ef6db65476c8d07"],
    ["within-aiff.wasm", "56806d4dd2fa3e4d6f354fd2c8f41f7f0025b0d8adb754cac5a5e7aae52f354c"],
  ]) {
    const actualSha256 = createHash("sha256")
      .update(await readFile(path.join(engineRoot, filename)))
      .digest("hex");
    assert.equal(actualSha256, expectedSha256);
  }
});
