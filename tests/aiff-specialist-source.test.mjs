import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(root, "work");
const sourcePath = path.join(root, "media", "ffmpeg", "within_remux.c");
const generatorPath = path.join(root, "media", "ffmpeg", "make-aiff-specialist.mjs");

test("the unpublished AIFF specialist derives reproducibly from the exact general wrapper", async () => {
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
