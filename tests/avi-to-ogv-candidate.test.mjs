import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const evidence = JSON.parse(
  readFileSync("evidence/avi-to-ogv-browser-2026-09-13.json", "utf8"),
);

test("AVI to OGV is public only with complete browser evidence", () => {
  const profile = conversionProfiles.find(({ id }) => id === "avi-to-ogv");
  assert.ok(profile);
  assert.equal(profile.engine, "ffmpeg-video");
  assert.equal(profile.route, "re-encode");
  assert.equal(profile.output, "ogv");
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.maxTestedBytes, 143_180_538);
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.selectedOptimization.theoraSpeedLevel, 2);
  assert.equal(evidence.browser.opfs.runs, 3);
  assert.equal(evidence.browser.directDestination.runs, 3);
  assert.equal(evidence.cleanup.convertedOutputsRetained, 0);
});

test("AVI to OGV uses an isolated pinned Theora core", () => {
  const wrapper = readFileSync("media/ffmpeg/within_remux.c", "utf8");
  const build = readFileSync("media/ffmpeg/build-remux.sh", "utf8");
  const libraries = readFileSync("media/ffmpeg/build-libraries.sh", "utf8");
  const reproduction = readFileSync(
    "media/ffmpeg/reproduce-nondocker.sh",
    "utf8",
  );
  assert.match(wrapper, /WITHIN_THEORA_ENCODE/);
  assert.match(wrapper, /profile == 39/);
  assert.match(wrapper, /speed_level", "2"/);
  assert.match(wrapper, /effective_codec = ogv \? 4/);
  assert.match(wrapper, /requested_quality == 1 \? 4/);
  assert.match(build, /within-theora/);
  assert.match(build, /"theoraUsesQualityBasedVbr": true/);
  assert.match(
    readFileSync("workers/media-remux.ts", "utf8"),
    /remuxProfile === 38 \|\|\s*remuxProfile === 39\s*\? null/s,
  );
  assert.match(build, /libtheoraVersion\": \"1\.2\.0/);
  assert.match(libraries, /WITHIN_ENABLE_THEORA_ENCODER/);
  assert.match(reproduction, /LIBTHEORA_SHA256=279327339903b544/);
  assert.match(
    reproduction,
    /WITHIN_OGV_COPY\|WITHIN_THEORA_ENCODE/,
  );
});
