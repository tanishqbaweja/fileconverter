import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const evidence = JSON.parse(
  readFileSync(
    "evidence/compatible-avi-source-expansion-2026-09-08.json",
    "utf8",
  ),
);
const worker = readFileSync("workers/conversion.worker.ts", "utf8");
const nativeWrapper = readFileSync("media/ffmpeg/within_remux.c", "utf8");
const browser = readFileSync("tests/browser/media-remux.spec.ts", "utf8");
const generator = readFileSync(
  "scripts/generate-compatible-avi-stress-fixture.mjs",
  "utf8",
);
const profiler = readFileSync("scripts/memory-profile.mjs", "utf8");
const cleanup = readFileSync("scripts/cleanup-generated.mjs", "utf8");

const expectedBytes = {
  "mkv-to-avi": 191_735_971,
  "mp4-to-avi": 191_718_445,
  "mov-to-avi": 191_718_419,
  "3gp-to-avi": 177_146_977,
  "mpeg-ts-to-avi": 199_649_420,
};

test("compatible AVI source expansion has exact public stress evidence", () => {
  assert.equal(evidence.status, "accepted-public-expansion");
  assert.equal(evidence.dockerUsed, false);
  assert.deepEqual(
    Object.keys(evidence.profiles).sort(),
    Object.keys(expectedBytes).sort(),
  );
  for (const [id, bytes] of Object.entries(expectedBytes)) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, id);
    assert.equal(profile.public, true, id);
    assert.equal(profile.automatedTestStatus, "passed", id);
    assert.equal(profile.route, "stream-copy", id);
    assert.equal(profile.maxTestedBytes, bytes, id);
    assert.equal(evidence.profiles[id].sourceBytes, bytes, id);
    assert.equal(evidence.profiles[id].conversionSeconds.length, 3, id);
    assert.ok(evidence.profiles[id].worstIncrementalPrivateMiB <= 250, id);
  }
});

test("AVI browser and native paths retain every source route and bounded probe", () => {
  for (const id of Object.keys(expectedBytes)) {
    assert.match(worker, new RegExp(id.replaceAll("-", "-")));
    assert.match(browser, new RegExp(id.replaceAll("-", "-")));
  }
  assert.match(nativeWrapper, /container_avi_input_requires_probe/);
  assert.match(nativeWrapper, /probesize = 2 \* 1024 \* 1024/);
  assert.match(nativeWrapper, /max_analyze_duration = 2 \* AV_TIME_BASE/);
  assert.match(browser, /expectCompressedVideoPacketMatch/);
  assert.match(browser, /expectCompressedAudioPacketMatch/);
  assert.match(browser, /expectDecodedVideoMatch/);
  assert.match(browser, /to AVI propagates a bounded write failure/);
  assert.equal(evidence.smallBrowserGate.successCases, 4);
  assert.equal(evidence.smallBrowserGate.writeFailureCases, 4);
  assert.equal(evidence.smallBrowserGate.allPassed, true);
});

test("stress generation, validation, and cleanup remain fully wired", () => {
  assert.match(generator, /Promise\.allSettled/);
  assert.match(generator, /minimumFreeBytes = 2 \* 1024 \* 1024 \* 1024/);
  assert.match(profiler, /COMPATIBLE_AVI_PROFILES/);
  assert.match(profiler, /inspectAviOpenDml/);
  assert.match(profiler, /mpeg4-packet-sha256/);
  assert.match(cleanup, /avi-candidate-build/);
  assert.equal(evidence.stressGate.runsPerProfile, 3);
  assert.equal(evidence.stressGate.allPassed, true);
  assert.equal(evidence.stressGate.allPacketHashesExact, true);
  assert.equal(evidence.stressGate.allCancellationCleanupPassed, true);
  assert.equal(evidence.fixtureGeneration.seconds, 5.25);
  assert.equal(evidence.fixtureGeneration.allFilesRepositoryLocal, true);
});
