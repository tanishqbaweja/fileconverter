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
const worker = readFileSync("workers/conversion.worker.ts", "utf8");

test("AVI output candidate keeps stock packet indexes bounded by smaller OpenDML segments", () => {
  assert.equal(evidence.status, "candidate-hidden-pending-production-browser-certification");
  assert.equal(evidence.boundedDesign.configuredRiffSizeLimitBytes, 8 * 1024 * 1024);
  assert.equal(evidence.boundedDesign.maximumRetainedIndexPayloadBytesByByteBound, 16 * 1024 * 1024);
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
  assert.match(libraries, /--enable-muxer=.*avi/);
});

test("AVI output profile 37 is wired but remains absent from the public registry", () => {
  assert.match(wrapper, /profile == 37/);
  assert.match(wrapper, /AV_CODEC_ID_MPEG4/);
  assert.match(wrapper, /AV_CODEC_ID_MP3/);
  assert.match(worker, /profileId === "mkv-to-avi"/);
  assert.equal(
    conversionProfiles.some((profile) => profile.id === "mkv-to-avi"),
    false,
  );
  assert.equal(evidence.convertedFilesCreated, false);
  assert.equal(evidence.temporarySourceCopiesDeleted, true);
});
