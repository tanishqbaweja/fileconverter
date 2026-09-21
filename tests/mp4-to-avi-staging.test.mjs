import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const source = (path) => readFileSync(path, "utf8");
const app = source("app/converter/ConverterApp.tsx");
const protocol = source("lib/conversion-protocol.ts");
const worker = source("workers/conversion.worker.ts");
const profiler = source("scripts/memory-profile.mjs");

test("only direct MP4-to-AVI uses app-owned bounded staging", () => {
  assert.match(protocol, /mode: "staged-handle"/);
  assert.match(app, /batch\.profile\.id !== "mp4-to-avi"/);
  assert.match(app, /`within-stage-\$\{batch\.profile\.id\}-\$\{jobId\}`/);
  assert.match(app, /name\?\.startsWith\("within-stage-"\)/);
  assert.match(worker, /destination\.mode === "staged-handle"/);
  assert.match(worker, /stagingName\.startsWith\("within-stage-mp4-to-avi-"\)/);
});

test("staged MP4-to-AVI checks quota, bounds copy memory, and cleans every terminal path", () => {
  assert.match(worker, /const requiredBytes = Math\.ceil\(sourceBytes \* 1\.25\)/);
  assert.match(worker, /navigator\.storage\.persist\?\.\(\)/);
  assert.match(worker, /const buffer = new Uint8Array\(MAX_WRITE_CHUNK\)/);
  assert.match(worker, /readAccess\.read\(buffer, { at: copiedBytes }\)/);
  assert.match(worker, /metrics\.pendingOperations = 1/);
  assert.match(worker, /await finalWritable\.write\(value\)/);
  assert.match(worker, /if \(copiedBytes !== stagedFile\.size\)/);
  assert.match(worker, /await finalWritable\?\.abort\(error\)/);
  assert.match(worker, /await removeStage\(\)/);
  assert.match(app, /replaceWorker\(worker, staleOpfsName\)/);
});

test("MP4-to-AVI disclosure and profiler cover the staging tradeoff and final-copy cancellation", () => {
  const profile = conversionProfiles.find(({ id }) => id === "mp4-to-avi");
  assert.ok(profile);
  assert.ok(
    profile.metadataLimitations.some(
      (note) =>
        note.includes("browser-private storage") &&
        note.includes("256 KiB") &&
        note.includes("deletes the temporary file"),
    ),
  );
  assert.match(
    profiler,
    /state\.phase === "Copying staged AVI to selected destination"[\s\S]*outputBytes[\s\S]*1024 \* 1024/,
  );
  assert.match(profiler, /phaseAtTrigger: cancellableState\?\.phase/);
});
