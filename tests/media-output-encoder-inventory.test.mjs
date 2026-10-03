import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidence = JSON.parse(await readFile(new URL(
  "../evidence/media-output-encoder-inventory-2026-10-03.json", import.meta.url,
), "utf8"));
const manifestBytes = await readFile(new URL("../public/engines/remux/build-manifest.json", import.meta.url));
const manifest = JSON.parse(manifestBytes);
const wrapper = await readFile(new URL("../media/ffmpeg/within_remux.c", import.meta.url));

test("M-04 records actual selectable video encoders separately from decode/copy coverage", () => {
  assert.equal(createHash("sha256").update(manifestBytes).digest("hex"), evidence.sources.manifestSha256);
  assert.equal(createHash("sha256").update(wrapper).digest("hex"), evidence.sources.wrapperSha256);
  assert.deepEqual(evidence.publishedSelectableVideoEncoders, manifest.videoEncoderOptions.selectableCodecs);
  assert.ok(wrapper.toString().includes(`static int ${evidence.nativeSelection.function}(`));
  assert.deepEqual(evidence.notImplementedFreshMediaOutputs.map((item) => item.codec),
    ["h264", "av1", "mpeg2video", "hevc"]);
  const missingEncoderNames = [
    "h264", "libx264", "libopenh264", "av1", "libaom_av1", "libsvtav1", "librav1e",
    "mpeg2video", "hevc", "libx265",
  ];
  assert.ok(manifest.enabledEncoders.every((name) => !missingEncoderNames.includes(name)));
  assert.deepEqual(evidence.notInstalledMediaSoftwareDecoders, ["av1", "vp8", "vp9"]);
  assert.ok(evidence.notInstalledMediaSoftwareDecoders.every((name) => !manifest.enabledDecoders.includes(name)));
});

test("missing encoder inventory does not invent unsupported feasibility results", () => {
  assert.equal(evidence.status, "partially-implemented-output-encoder-surface");
  assert.ok(evidence.nextAction.includes("specialist H.264 encoder first"));
  assert.ok(evidence.limitations.some((item) => item.includes("No codec has been newly rejected")));
  assert.equal(evidence.cleanup.generatedMedia, false);
  assert.equal(evidence.cleanup.convertedOutputs, false);
});
