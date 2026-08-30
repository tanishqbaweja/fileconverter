import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AUDIO_CONVERSION_OPTIONS,
  DEFAULT_VIDEO_CONVERSION_OPTIONS,
  VIDEO_PROFILE_DEFAULT_CODEC_BY_ID,
  supportsMp3EncodingOptions,
  supportsVideoEncodingOptions,
  validateAudioConversionOptions,
  validateVideoConversionOptions,
  videoCodecCode,
  videoOptionProfileForId,
  videoQualityCode,
} from "../lib/media-conversion-options.ts";
import { conversionProfiles } from "../lib/capability-registry.ts";

const mp3Profile = { engine: "ffmpeg-audio", output: "mp3" };

test("MP3 encoding options default to the certified automatic policy", () => {
  assert.deepEqual(
    validateAudioConversionOptions(mp3Profile),
    DEFAULT_AUDIO_CONVERSION_OPTIONS,
  );
});

test("MP3 encoding options accept every bounded custom dimension together", () => {
  assert.deepEqual(
    validateAudioConversionOptions(mp3Profile, {
      bitRateBps: 320_000,
      sampleRateHz: 48_000,
      channels: 2,
    }),
    { bitRateBps: 320_000, sampleRateHz: 48_000, channels: 2 },
  );
  assert.equal(supportsMp3EncodingOptions(mp3Profile), true);
  assert.equal(
    supportsMp3EncodingOptions({ engine: "ffmpeg-remux", output: "mp3" }),
    false,
  );
});

test("audio options reject unsupported profiles and out-of-contract values", () => {
  assert.throws(
    () =>
      validateAudioConversionOptions(
        { engine: "ffmpeg-audio", output: "aac" },
        { bitRateBps: 128_000, sampleRateHz: 44_100, channels: 2 },
      ),
    /not supported/,
  );
  assert.throws(
    () =>
      validateAudioConversionOptions(mp3Profile, {
        bitRateBps: 129_000,
        sampleRateHz: 44_100,
        channels: 2,
      }),
    /bitrate/,
  );
  assert.throws(
    () =>
      validateAudioConversionOptions(mp3Profile, {
        bitRateBps: 128_000,
        sampleRateHz: 22_050,
        channels: 2,
      }),
    /sample rate/,
  );
  assert.throws(
    () =>
      validateAudioConversionOptions(mp3Profile, {
        bitRateBps: 128_000,
        sampleRateHz: 44_100,
        channels: 6,
      }),
    /channel layout/,
  );
});

const vp8Profile = { engine: "ffmpeg-video", output: "webm" };
const vp9Profile = { engine: "ffmpeg-video", output: "webm-vp9" };
const mpeg4Profile = { engine: "ffmpeg-video", output: "mp4-mpeg4" };

test("video options default to the exact certified automatic policy", () => {
  assert.deepEqual(
    validateVideoConversionOptions(vp8Profile),
    DEFAULT_VIDEO_CONVERSION_OPTIONS,
  );
  assert.equal(supportsVideoEncodingOptions(vp8Profile), true);
  assert.equal(supportsVideoEncodingOptions(vp9Profile), true);
  assert.equal(supportsVideoEncodingOptions(mpeg4Profile), true);
  assert.equal(
    supportsVideoEncodingOptions({ engine: "ffmpeg-remux", output: "webm" }),
    false,
  );
});

test("video options accept the maximum bounded topology and codec overrides", () => {
  const maximum = {
    codec: "vp9",
    maxWidth: 640,
    bitRateBps: 4_000_000,
    frameRateFps: 30,
    quality: "higher",
  };
  assert.deepEqual(validateVideoConversionOptions(vp8Profile, maximum), maximum);
  assert.deepEqual(
    validateVideoConversionOptions(mpeg4Profile, {
      ...maximum,
      codec: "mpeg4",
    }),
    { ...maximum, codec: "mpeg4" },
  );
  assert.equal(videoCodecCode("automatic"), 0);
  assert.equal(videoCodecCode("vp8"), 1);
  assert.equal(videoCodecCode("vp9"), 2);
  assert.equal(videoCodecCode("mpeg4"), 3);
  assert.equal(videoQualityCode("automatic"), 0);
  assert.equal(videoQualityCode("smaller"), 1);
  assert.equal(videoQualityCode("balanced"), 2);
  assert.equal(videoQualityCode("higher"), 3);
});

test("video options reject cross-container codecs and out-of-contract values", () => {
  const valid = {
    codec: "vp8",
    maxWidth: 480,
    bitRateBps: 1_000_000,
    frameRateFps: 24,
    quality: "balanced",
  };
  assert.throws(
    () =>
      validateVideoConversionOptions(
        { engine: "ffmpeg-remux", output: "webm" },
        valid,
      ),
    /not supported/,
  );
  assert.throws(
    () => validateVideoConversionOptions(mpeg4Profile, valid),
    /MPEG-4 codec/,
  );
  assert.throws(
    () =>
      validateVideoConversionOptions(vp8Profile, {
        ...valid,
        codec: "mpeg4",
      }),
    /WebM codec/,
  );
  for (const [field, value, pattern] of [
    ["maxWidth", 800, /width/],
    ["bitRateBps", 3_000_000, /bitrate/],
    ["frameRateFps", 60, /frame-rate/],
    ["quality", "unbounded", /quality/],
  ]) {
    assert.throws(
      () =>
        validateVideoConversionOptions(vp8Profile, {
          ...valid,
          [field]: value,
        }),
      pattern,
    );
  }
});

test("the worker video-option profile map exactly matches the public registry", () => {
  const registryIds = conversionProfiles
    .filter((profile) => profile.engine === "ffmpeg-video")
    .map((profile) => profile.id)
    .sort();
  const mappedIds = Object.keys(VIDEO_PROFILE_DEFAULT_CODEC_BY_ID).sort();
  assert.deepEqual(mappedIds, registryIds);
  for (const profileId of mappedIds) {
    assert.ok(videoOptionProfileForId(profileId));
  }
  assert.equal(videoOptionProfileForId("mkv-to-mp4"), null);
});
