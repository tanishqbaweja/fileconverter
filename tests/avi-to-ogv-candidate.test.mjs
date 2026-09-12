import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const evidence = JSON.parse(
  readFileSync("evidence/avi-to-ogv-feasibility-2026-09-12.json", "utf8"),
);

test("AVI to OGV remains outside the registry until the browser gate passes", () => {
  const profile = conversionProfiles.find(({ id }) => id === "avi-to-ogv");
  assert.equal(profile, undefined);
  assert.equal(evidence.status, "private-candidate-not-public");
  assert.equal(evidence.nativeFeasibility.selectedSpeedLevel, 2);
  assert.equal(evidence.cleanup.temporaryOutputsRetained, 0);
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
  assert.match(build, /within-theora/);
  assert.match(build, /libtheoraVersion\": \"1\.2\.0/);
  assert.match(libraries, /WITHIN_ENABLE_THEORA_ENCODER/);
  assert.match(reproduction, /LIBTHEORA_SHA256=279327339903b544/);
});
