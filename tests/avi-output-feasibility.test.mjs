import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const evidence = JSON.parse(
  readFileSync("evidence/avi-output-feasibility-2026-09-08.json", "utf8"),
);
const patch = readFileSync("media/ffmpeg/patches/avi-bounded-index.patch");
const patchText = patch.toString("utf8");
const wrapper = readFileSync("media/ffmpeg/within_remux.c", "utf8");
const libraries = readFileSync("media/ffmpeg/build-libraries.sh", "utf8");
const noDockerBuild = readFileSync(
  "media/ffmpeg/reproduce-nondocker.sh",
  "utf8",
);
const dockerfile = readFileSync("media/ffmpeg/Dockerfile", "utf8");
const worker = readFileSync("workers/conversion.worker.ts", "utf8");

test("AVI output keeps stock packet indexes bounded by smaller OpenDML segments", () => {
  assert.equal(evidence.status, "accepted-public-profile");
  assert.equal(
    evidence.boundedDesign.configuredRiffSizeLimitBytes,
    8 * 1024 * 1024,
  );
  assert.equal(
    evidence.boundedDesign.maximumRetainedIndexPayloadBytesByByteBound,
    16 * 1024 * 1024,
  );
  assert.equal(evidence.boundedDesign.maximumPendingWrites, 1);
  assert.equal(evidence.boundedDesign.largeFileMemfs, false);
  assert.equal(
    evidence.boundedDesign.patchSha256,
    createHash("sha256").update(patch).digest("hex"),
  );
  assert.match(patchText, /riff_size_limit/);
  assert.match(patchText, /AV_OPT_TYPE_INT64/);
  assert.match(wrapper, /"riff_size_limit", "8388608"/);
  assert.match(wrapper, /"reserve_index_space", "262176"/);
  assert.match(libraries, /ENABLED_MUXERS=.*avi/);
  assert.match(
    noDockerBuild,
    /avi-bounded-index\.patch[\s\S]*emmake make install[\s\S]*patch --reverse[\s\S]*emmake make distclean[\s\S]*WITHIN_ENABLE_AVI_MUXER=0 \.\/build-libraries\.sh/,
  );
  assert.match(
    dockerfile,
    /avi-bounded-index\.patch[\s\S]*emmake make install[\s\S]*patch --reverse[\s\S]*emmake make distclean[\s\S]*WITHIN_ENABLE_AVI_MUXER=0 \/src\/build-libraries\.sh/,
  );
  assert.match(libraries, /WITHIN_ENABLE_AVI_MUXER[\s\S]*ENABLED_MUXERS/);
  assert.match(libraries, /ENABLED_MUXERS=tgp,aiff,amr,asf,avi,/);
  assert.match(libraries, /ENABLED_MUXERS=tgp,aiff,amr,asf,flac,/);
});

test("AVI output profile 37 is wired and public only after browser certification", () => {
  assert.match(wrapper, /profile == 37/);
  assert.match(wrapper, /AV_CODEC_ID_MPEG4/);
  assert.match(wrapper, /AV_CODEC_ID_MP3/);
  assert.match(worker, /profileId === "mkv-to-avi"/);
  const profile = conversionProfiles.find(
    (candidate) => candidate.id === "mkv-to-avi",
  );
  assert.ok(profile);
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.maxTestedBytes, 159_417_989);
  assert.equal(
    evidence.acceptedEvidence,
    "evidence/compatible-avi-copy-2026-09-08.json",
  );
});
