import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const evidence = JSON.parse(
  readFileSync("evidence/avi-to-flv-browser-2026-09-12.json", "utf8"),
);
const nativeWrapper = readFileSync("media/ffmpeg/within_remux.c", "utf8");
const worker = readFileSync("workers/conversion.worker.ts", "utf8");
const browser = readFileSync("tests/browser/media-remux.spec.ts", "utf8");
const profiler = readFileSync("scripts/memory-profile.mjs", "utf8");
const profileCategory = readFileSync("scripts/profile-category.mjs", "utf8");
const stressGenerator = readFileSync(
  "scripts/generate-container-mp3-stress-fixtures.mjs",
  "utf8",
);
const cleanup = readFileSync("scripts/cleanup-generated.mjs", "utf8");

test("AVI to FLV exposes only the currently browser-validated size", () => {
  const profile = conversionProfiles.find(
    (candidate) => candidate.id === "avi-to-flv",
  );
  assert.ok(profile);
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.route, "stream-copy");
  assert.equal(profile.maxTestedBytes, 145_328_774);
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.output.formatFamily, "flv");
  assert.equal(evidence.output.sourceAndOutputCompressedPacketsMatch, true);
  assert.equal(evidence.output.sourceAndOutputDecodedVideoMatch, true);
  assert.equal(evidence.browser.opfs.runs, 3);
  assert.equal(evidence.browser.directDestination.runs, 3);
  assert.ok(evidence.browser.opfs.worstIncrementalPrivateMiB <= 250);
  assert.ok(evidence.browser.directDestination.worstIncrementalPrivateMiB <= 250);
});

test("AVI FLV conversion, validation, stress, and cleanup stay wired", () => {
  assert.match(
    nativeWrapper,
    /container_flv_output[\s\S]*AVI[\s\S]*MP3/,
  );
  assert.match(worker, /profileId === "avi-to-flv"/);
  assert.match(worker, /preferAsynchronousDirect/);
  assert.match(
    browser,
    /packet-copies AVI H\.264 video and MP3 audio into genuine bounded FLV/,
  );
  assert.match(browser, /expectVideoPacketMatch\(mp3ContainerFixturePaths\.avi/);
  assert.match(
    browser,
    /expectCompressedAudioPacketMatch\([\s\S]*mp3ContainerFixturePaths\.avi/,
  );
  assert.match(profiler, /"avi-to-flv"/);
  assert.match(
    profileCategory,
    /"avi-flv"[\s\S]*passSelectedFixturesToGenerator: true/,
  );
  assert.match(stressGenerator, /const requestedNames = process\.argv\.slice\(2\)/);
  assert.match(stressGenerator, /h264-mp3-flv-128m\.avi/);
  assert.match(cleanup, /avi-to-flv-feasibility/);
  assert.equal(evidence.cleanup.generatedSourceDeleted, true);
  assert.equal(evidence.cleanup.convertedOutputDeleted, true);
  assert.equal(evidence.browser.opfs.cancellation.passed, true);
  assert.equal(evidence.browser.directDestination.cancellation.passed, true);
  assert.equal(evidence.cleanup.protectedTestMkvUnmodified, true);
});
