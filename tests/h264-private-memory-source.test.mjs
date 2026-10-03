import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
test("private H264 stress gate uses real local files, three repeats, independent validation and exact whole-tree formula", async () => {
  const source = await readFile(path.join(root, "scripts/h264-private-memory.mjs"), "utf8");
  assert.match(source, /const duration = 60, width = 1280, height = 720, fps = 30/);
  assert.match(source, /const runCount = 3/);
  assert.match(source, /DOM\.setFileInputFiles/);
  assert.doesNotMatch(source, /\.setInputFiles\(|\.arrayBuffer\(|readFile\(output/);
  assert.match(source, /peakPrivateBytes - blankBaseline\.privateBytes/);
  assert.match(source, /summary\.incrementalPrivateMiB <= 250/);
  assert.match(source, /ordinalSsim >= 0\.98/);
  assert.match(source, /maximumFrameTimeErrorSeconds <= 0\.001/);
  assert.match(source, /assert\.deepEqual\(hashes, sourceEvidence\.audioPacketHashes\)/);
  assert.match(source, /maxReadChunkBytes <= 256 \* 1024/);
  assert.match(source, /await cleanOpfs\(\)/);
  assert.match(source, /await rm\(work, \{ recursive: true/);
  assert.match(source, /TEMP: temporary, TMP: temporary/);
  assert.match(source, /statfs\(root\)/);
  assert.match(source, /publicProfilesChanged: false/);
});

test("the private BYOB experiment selects the existing production reader, not a different conversion engine", async () => {
  const stage = await readFile(path.join(root, "scripts/stage-h264-candidate.mjs"), "utf8");
  assert.match(stage, /\["legacy", "byob"\]/);
  assert.match(stage, /withinBridge: \{ \.\.\.options\.withinBridge, readSync: undefined \}/);
  assert.match(stage, /const target = path\.join\(root, "dist\/client\/engines\/remux"\)/);
  assert.match(stage, /Candidate artifact mismatch/);
  assert.match(stage, /Restoration hash mismatch/);
  const bridge = await readFile(path.join(root, "workers/media-remux.ts"), "utf8");
  assert.match(bridge, /getReader\(\{ mode: "byob" \}\)/);
  assert.match(bridge, /inputReader\.read\(/);
  assert.match(bridge, /inputReader\?\.cancel\("FFmpeg input seek"\)/);
});
