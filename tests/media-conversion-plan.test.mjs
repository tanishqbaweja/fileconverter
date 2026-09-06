import assert from "node:assert/strict";
import test from "node:test";
import { conversionProfiles } from "../lib/capability-registry.ts";
import {
  mediaOutputFamily,
  planMediaConversion,
  selectAutomaticMediaProfile,
} from "../lib/media-conversion-plan.ts";

function profile(id) {
  const result = conversionProfiles.find((candidate) => candidate.id === id);
  assert.ok(result, `Missing profile ${id}`);
  return result;
}

function stream(mediaType, codec) {
  return {
    mediaType,
    codec,
    durationSeconds: 10,
    bitrateBps: null,
    sampleRateHz: mediaType === "audio" ? 48_000 : null,
    channels: mediaType === "audio" ? 2 : null,
    channelLayout: mediaType === "audio" ? "Stereo" : null,
    bitsPerSample: null,
    width: mediaType === "video" ? 1920 : null,
    height: mediaType === "video" ? 1080 : null,
    frameRate: mediaType === "video" ? 30 : null,
  };
}

function inspection(streams, metadataSignals = []) {
  const primary = streams[0];
  return {
    mediaType: primary.mediaType === "audio" ? "audio" : "video",
    container: "test",
    codec: primary.codec,
    durationSeconds: 10,
    bitrateBps: null,
    sampleRateHz: primary.sampleRateHz,
    channels: primary.channels,
    channelLayout: primary.channelLayout,
    bitsPerSample: null,
    width: primary.width,
    height: primary.height,
    frameRate: primary.frameRate,
    streams,
    metadataSignals,
    notes: [],
    inspectedBytes: 100,
    maximumInspectionBytes: 1024,
  };
}

test("MP4 stream-copy plan distinguishes copied, excluded, and rejecting streams", () => {
  const plan = planMediaConversion(
    profile("mkv-to-mp4"),
    inspection([
      stream("video", "H.264/AVC"),
      stream("audio", "AAC"),
      stream("subtitle", "ASS subtitle"),
    ]),
  );
  assert.ok(plan);
  assert.deepEqual(plan.streams.map(({ action }) => action), [
    "copy",
    "copy",
    "exclude",
  ]);

  const rejected = planMediaConversion(
    profile("mkv-to-mp4"),
    inspection([stream("video", "VP9"), stream("audio", "AAC")]),
  );
  assert.ok(rejected);
  assert.equal(rejected.streams[0].action, "reject");
  assert.match(rejected.streams[0].detail, /reject/i);
  assert.equal(rejected.blockingReasons.length, 1);
});

test("Matroska plan copies certified subtitle codecs and rejects unsupported audio", () => {
  const plan = planMediaConversion(
    profile("mp4-to-mkv"),
    inspection([
      stream("video", "H.264/AVC"),
      stream("subtitle", "WebVTT subtitle"),
      stream("audio", "AC-3"),
    ]),
  );
  assert.ok(plan);
  assert.deepEqual(plan.streams.map(({ action }) => action), [
    "copy",
    "copy",
    "reject",
  ]);
});

test("lossless audio extraction selects only the first matching codec", () => {
  const plan = planMediaConversion(
    profile("mkv-to-mp3"),
    inspection([
      stream("video", "H.264/AVC"),
      stream("audio", "AAC"),
      stream("audio", "MP3"),
      stream("audio", "MP3"),
    ]),
  );
  assert.ok(plan);
  assert.deepEqual(plan.streams.map(({ action }) => action), [
    "exclude",
    "exclude",
    "copy",
    "exclude",
  ]);
});

test("M4A stream copy includes every AAC stream and rejects incompatible audio", () => {
  const plan = planMediaConversion(
    profile("mkv-to-m4a"),
    inspection([
      stream("video", "H.264/AVC"),
      stream("audio", "AAC"),
      stream("audio", "AAC"),
      stream("audio", "Opus"),
    ]),
  );
  assert.ok(plan);
  assert.deepEqual(plan.streams.map(({ action }) => action), [
    "exclude",
    "copy",
    "copy",
    "reject",
  ]);
  assert.equal(plan.blockingReasons.length, 1);
});

test("missing required extraction codec is a preflight blocker", () => {
  const plan = planMediaConversion(
    profile("mkv-to-mp3"),
    inspection([stream("video", "H.264/AVC"), stream("audio", "AAC")]),
  );
  assert.ok(plan);
  assert.equal(plan.streams[1].action, "reject");
  assert.match(plan.blockingReasons.join(" "), /requires MP3 audio/);
});

test("OGV video conversion re-encodes video and copies first Vorbis audio", () => {
  const plan = planMediaConversion(
    profile("ogv-to-webm-vp9"),
    inspection([
      stream("video", "Theora"),
      stream("audio", "Vorbis"),
      stream("subtitle", "Text subtitle"),
    ]),
  );
  assert.ok(plan);
  assert.deepEqual(plan.streams.map(({ action }) => action), [
    "re-encode",
    "copy",
    "exclude",
  ]);
  assert.match(plan.streams[0].detail, /VP9/);
});

test("video plan discloses codec, width, bitrate, frame-rate, and quality controls", () => {
  const plan = planMediaConversion(
    profile("mkv-to-webm"),
    inspection([stream("video", "H.264/AVC")]),
    undefined,
    {
      codec: "vp9",
      maxWidth: 480,
      bitRateBps: 1_000_000,
      frameRateFps: 24,
      quality: "higher",
    },
  );
  assert.ok(plan);
  assert.match(plan.streams[0].detail, /VP9/);
  assert.match(plan.streams[0].detail, /480px/);
  assert.match(plan.streams[0].detail, /1000 kb\/s/);
  assert.match(plan.streams[0].detail, /24 fps cap/);
  assert.match(plan.streams[0].detail, /higher-visual-quality/);
});

test("audio re-encode plan converts only the first audio stream", () => {
  const plan = planMediaConversion(
    profile("mkv-to-flac"),
    inspection([
      stream("video", "H.264/AVC"),
      stream("audio", "AAC"),
      stream("audio", "Opus"),
    ], ["container title", "stream language"]),
  );
  assert.ok(plan);
  assert.deepEqual(plan.streams.map(({ action }) => action), [
    "exclude",
    "re-encode",
    "exclude",
  ]);
  assert.match(plan.streams[1].detail, /losslessly encodes/);
  assert.match(plan.metadataSummary, /container title/);
});

test("MP3 plan discloses the native custom bitrate, rate, and layout", () => {
  const plan = planMediaConversion(
    profile("wav-to-mp3"),
    inspection([stream("audio", "PCM")]),
    {
      codec: "mp3",
      compression: "lossy",
      bitRateBps: 256_000,
      sampleRateHz: 44_100,
      channels: 1,
      quality: "balanced",
    },
  );
  assert.ok(plan);
  assert.match(plan.streams[0].detail, /256 kb\/s/);
  assert.match(plan.streams[0].detail, /44,100 Hz/);
  assert.match(plan.streams[0].detail, /mono/);
});

test("AV1 WebM copy excludes incompatible streams instead of claiming transcoding", () => {
  const plan = planMediaConversion(
    profile("mkv-to-webm-av1"),
    inspection([
      stream("video", "AV1"),
      stream("audio", "Opus"),
      stream("audio", "AAC"),
    ]),
  );
  assert.ok(plan);
  assert.deepEqual(plan.streams.map(({ action }) => action), [
    "copy",
    "copy",
    "exclude",
  ]);
});

test("automatic media selection keeps a standards-compliant stream copy", () => {
  const selected = profile("mkv-to-mp4");
  const choice = selectAutomaticMediaProfile(
    selected,
    conversionProfiles.filter((candidate) => candidate.input === "mkv"),
    inspection([
      stream("video", "H.264/AVC"),
      stream("audio", "AAC"),
    ]),
  );
  assert.equal(choice.changed, false);
  assert.equal(choice.profile.id, "mkv-to-mp4");
  assert.deepEqual(choice.plan.streams.map(({ action }) => action), ["copy", "copy"]);
});

test("automatic media selection falls back from incompatible MP4 copy to certified encode", () => {
  const choice = selectAutomaticMediaProfile(
    profile("mkv-to-mp4"),
    conversionProfiles.filter((candidate) => candidate.input === "mkv"),
    inspection([
      stream("video", "MPEG-2 Video"),
      stream("audio", "AAC"),
    ]),
  );
  assert.equal(choice.changed, true);
  assert.equal(choice.profile.id, "mkv-to-mp4-mpeg4");
  assert.deepEqual(choice.plan.streams.map(({ action }) => action), [
    "re-encode",
    "exclude",
  ]);
  assert.match(choice.reason, /automatically selected/);
});

test("automatic media selection falls back from incompatible AV1 copy to VP8", () => {
  const choice = selectAutomaticMediaProfile(
    profile("mkv-to-webm-av1"),
    conversionProfiles.filter((candidate) => candidate.input === "mkv"),
    inspection([
      stream("video", "HEVC"),
      stream("audio", "AAC"),
    ]),
  );
  assert.equal(choice.changed, true);
  assert.equal(choice.profile.id, "mkv-to-webm");
  assert.equal(choice.plan.streams[0].action, "re-encode");
});

test("automatic media selection does not choose an uncertified decoder", () => {
  const choice = selectAutomaticMediaProfile(
    profile("mkv-to-mp4"),
    conversionProfiles.filter((candidate) => candidate.input === "mkv"),
    inspection([stream("video", "VP9"), stream("audio", "Opus")]),
  );
  assert.equal(choice.changed, false);
  assert.equal(choice.profile.id, "mkv-to-mp4");
  assert.ok(choice.plan.blockingReasons.length > 0);
});

test("automatic selection inventories every current copy-plus-encode destination family", () => {
  const families = new Map();
  for (const candidate of conversionProfiles.filter(
    (profile) => profile.public && profile.engine.startsWith("ffmpeg-"),
  )) {
    const key = `${candidate.input}:${mediaOutputFamily(candidate.output)}`;
    const routes = families.get(key) ?? new Set();
    routes.add(candidate.route);
    families.set(key, routes);
  }
  assert.deepEqual(
    [...families]
      .filter(
        ([, routes]) =>
          routes.has("stream-copy") && routes.has("re-encode"),
      )
      .map(([key]) => key)
      .sort(),
    ["mkv:mp4", "mkv:webm"],
  );
});
