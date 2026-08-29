import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AUDIO_CONVERSION_OPTIONS,
  supportsMp3EncodingOptions,
  validateAudioConversionOptions,
} from "../lib/media-conversion-options.ts";

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
