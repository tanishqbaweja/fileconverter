import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const evidence = JSON.parse(
  readFileSync("evidence/avi-to-mpegts-browser-2026-09-12.json", "utf8"),
);
const nativeWrapper = readFileSync("media/ffmpeg/within_remux.c", "utf8");
const worker = readFileSync("workers/conversion.worker.ts", "utf8");
const mediaBridge = readFileSync("workers/media-remux.ts", "utf8");
const browser = readFileSync("tests/browser/media-remux.spec.ts", "utf8");
const profiler = readFileSync("scripts/memory-profile.mjs", "utf8");
const cleanup = readFileSync("scripts/cleanup-generated.mjs", "utf8");

test("AVI to MPEG-TS is public only with exact bounded browser evidence", () => {
  const profile = conversionProfiles.find(
    (candidate) => candidate.id === "avi-to-mpeg-ts",
  );
  assert.ok(profile);
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.route, "stream-copy");
  assert.equal(profile.maxTestedBytes, 159_500_442);
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.output.formatFamily, "mpegts");
  assert.equal(evidence.output.sourceAndOutputCompressedPacketsMatch, true);
  assert.equal(evidence.output.sourceAndOutputDecodedVideoMatch, true);
  assert.equal(evidence.browser.opfs.runs, 3);
  assert.equal(evidence.browser.directDestination.runs, 3);
  assert.ok(evidence.browser.opfs.worstIncrementalPrivateMiB <= 250);
  assert.ok(evidence.browser.directDestination.worstIncrementalPrivateMiB <= 250);
});

test("AVI MPEG-TS conversion, validation, cancellation, and cleanup stay wired", () => {
  assert.match(nativeWrapper, /avi_fragmented_iso_input[\s\S]*AV_CODEC_ID_MPEG4/);
  assert.match(nativeWrapper, /avi_fragmented_iso_input[\s\S]*AV_CODEC_ID_MP3/);
  assert.match(worker, /profileId === "avi-to-mpeg-ts"/);
  assert.match(browser, /packet-copies AVI MPEG-4 video and MP3 audio into genuine MPEG-TS/);
  assert.match(browser, /expectCompressedVideoPacketMatch\(aviInputFixturePath/);
  assert.match(browser, /expectCompressedAudioPacketMatch\(aviInputFixturePath/);
  assert.match(profiler, /const aviMpegTsCopy = route === "avi-to-mpeg-ts"/);
  assert.match(mediaBridge, /DIRECT_CANCELLATION_YIELD_BYTES = 8 \* 1024 \* 1024/);
  assert.match(cleanup, /avi-to-mpegts-candidate/);
  assert.match(cleanup, /avi-to-mpeg-ts-direct-handle-stress/);
  assert.equal(evidence.browser.opfs.cancellation.passed, true);
  assert.equal(evidence.browser.directDestination.cancellation.passed, true);
  assert.equal(evidence.cleanup.generatedStressSourceDeleted, true);
  assert.equal(evidence.cleanup.convertedOutputsDeleted, true);
  assert.equal(evidence.cleanup.rawReportsDeletedAfterCompactManifestGeneration, true);
});
