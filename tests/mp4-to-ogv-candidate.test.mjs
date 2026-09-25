import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  conversionProfiles,
  publicProfilesFor,
} from "../lib/capability-registry.ts";
import {
  VIDEO_PROFILE_DEFAULT_CODEC_BY_ID,
  videoOptionProfileForId,
} from "../lib/media-conversion-options.ts";

test("MP4 to OGV is explicitly failed and hidden after its memory rejection", () => {
  const profile = conversionProfiles.find(({ id }) => id === "mp4-to-ogv");
  assert.ok(profile);
  assert.equal(profile.input, "mp4");
  assert.equal(profile.output, "ogv");
  assert.equal(profile.engine, "ffmpeg-video");
  assert.equal(profile.route, "re-encode");
  assert.equal(profile.automatedTestStatus, "failed");
  assert.equal(profile.maxTestedBytes, null);
  assert.equal(profile.public, false);
  assert.equal(
    publicProfilesFor("mp4").some(({ id }) => id === profile.id),
    false,
  );
  assert.equal(
    publicProfilesFor("mp4", true).some(({ id }) => id === profile.id),
    true,
  );
});

test("raw MPEG-2 to OGV remains hidden after the direct-save memory failure", () => {
  const profile = conversionProfiles.find(({ id }) => id === "m2v-to-ogv");
  assert.ok(profile);
  assert.equal(profile.input, "m2v");
  assert.equal(profile.output, "ogv");
  assert.equal(profile.engine, "ffmpeg-video");
  assert.equal(profile.route, "re-encode");
  assert.equal(profile.automatedTestStatus, "failed");
  assert.equal(profile.maxTestedBytes, null);
  assert.equal(profile.public, false);
  assert.equal(publicProfilesFor("m2v").some(({ id }) => id === profile.id), false);
  assert.equal(publicProfilesFor("m2v", true).some(({ id }) => id === profile.id), true);
  assert.equal(VIDEO_PROFILE_DEFAULT_CODEC_BY_ID["m2v-to-ogv"], "theora");
  assert.deepEqual(videoOptionProfileForId("m2v-to-ogv"), {
    engine: "ffmpeg-video",
    output: "ogv",
  });
  const evidence = JSON.parse(
    readFileSync("evidence/m2v-to-ogv-candidate-2026-09-25.json", "utf8"),
  );
  assert.equal(evidence.status, "hidden-failed-memory");
  assert.equal(evidence.runs.find(({ mode }) => mode === "direct-handle")?.memoryGatePassed, false);
  assert.ok(evidence.runs.find(({ mode }) => mode === "direct-handle")?.incrementalPrivateMiB > 250);
  assert.equal(evidence.commonOutput.fullNativeDecode, true);
  assert.equal(evidence.commonOutput.packetsAndDecodedFrames, evidence.stressSource.decodedFrames);
});

test("MP4 to OGV reuses the fixed-memory Theora ABI and bounded controls", () => {
  const worker = readFileSync("workers/conversion.worker.ts", "utf8");
  const wrapper = readFileSync("media/ffmpeg/within_remux.c", "utf8");
  const sourceManifest = readFileSync("media/ffmpeg/build-remux.sh", "utf8");
  const memoryProfile = readFileSync("scripts/memory-profile.mjs", "utf8");
  const profileCategory = readFileSync("scripts/profile-category.mjs", "utf8");
  const stressGenerator = readFileSync(
    "scripts/generate-container-webm-stress-fixtures.mjs",
    "utf8",
  );
  const cleanup = readFileSync("scripts/cleanup-generated.mjs", "utf8");
  const publishedManifest = JSON.parse(
    readFileSync("public/engines/remux/build-manifest.json", "utf8"),
  );
  assert.match(
    worker,
    /profileId === "avi-to-ogv" \|\|[\s\S]*?profileId === "mp4-to-ogv" \|\|[\s\S]*?profileId === "m2v-to-ogv"[\s\S]*?\? 39/,
  );
  assert.match(wrapper, /within_video_reencode\(3, 0/);
  assert.match(sourceManifest, /"within-theora"[\s\S]*?"mp4-to-ogv"/);
  const theoraModule = publishedManifest.modules.find(
    ({ name }) => name === "within-theora",
  );
  assert.deepEqual(theoraModule, {
    name: "within-theora",
    wasmPthreadPoolSize: 0,
    videoCodecThreads: 1,
    profiles: ["avi-to-ogv", "mp4-to-ogv", "m2v-to-ogv"],
  });
  assert.equal(VIDEO_PROFILE_DEFAULT_CODEC_BY_ID["mp4-to-ogv"], "theora");
  assert.deepEqual(videoOptionProfileForId("mp4-to-ogv"), {
    engine: "ffmpeg-video",
    output: "ogv",
  });
  assert.match(
    memoryProfile,
    /THEORA_OGV_PROFILES = \["avi-to-ogv", "mp4-to-ogv", "m2v-to-ogv"\]/,
  );
  assert.match(
    profileCategory,
    /"mp4-ogv"[\s\S]*?"mp4-to-ogv"[\s\S]*?h264-aac-128m\.mp4/,
  );
  assert.match(stressGenerator, /"-threads:v", "1"/);
  assert.match(cleanup, /temp-mp4-ogv/);
  assert.match(cleanup, /ffmpeg-candidate-34932654495/);
});

test("MP4 to OGV remains hidden after the complete-browser memory rejection", () => {
  const evidence = JSON.parse(
    readFileSync("evidence/mp4-to-ogv-candidate-2026-09-15.json", "utf8"),
  );
  const rejected = evidence.stress.twentyMiBInitialHeapOneMiBGrowth;
  assert.equal(rejected.status, "rejected");
  assert.ok(Math.max(...rejected.incrementalPrivateMiB) > 250);
  assert.equal(rejected.actualWasmMemoryBytes, 25 * 1024 * 1024);
  assert.equal(rejected.decodedFramesPerRun, 1560);
  assert.equal(rejected.mediaTraversal, "full-native-decode");
  assert.equal(rejected.allNonMemoryChecksPassed, true);
  assert.equal(rejected.cancellationPassed, true);
  assert.equal(rejected.cleanupRecoveryPassed, true);
  const profile = conversionProfiles.find(({ id }) => id === "mp4-to-ogv");
  assert.equal(profile?.public, false);
  assert.equal(profile?.automatedTestStatus, "failed");
  assert.equal(profile?.maxTestedBytes, null);
});
