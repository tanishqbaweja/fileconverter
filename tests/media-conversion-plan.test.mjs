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
  assert.deepEqual(
    plan.streams.map(({ action }) => action),
    ["copy", "copy", "exclude"],
  );

  const rejected = planMediaConversion(
    profile("mkv-to-mp4"),
    inspection([stream("video", "VP9"), stream("audio", "AAC")]),
  );
  assert.ok(rejected);
  assert.equal(rejected.streams[0].action, "reject");
  assert.match(rejected.streams[0].detail, /reject/i);
  assert.equal(rejected.blockingReasons.length, 1);
});

test("AVI to 3GP candidate copies compatible video and explicitly excludes MP3", () => {
  const candidate = {
    id: "avi-to-3gp",
    input: "avi",
    output: "3gp",
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [],
    fidelityLimitations: [],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: false,
  };
  const accepted = planMediaConversion(
    candidate,
    inspection([
      stream("video", "MPEG-4 Part 2"),
      stream("audio", "MP3"),
    ]),
  );
  assert.ok(accepted);
  assert.deepEqual(
    accepted.streams.map(({ action }) => action),
    ["copy", "exclude"],
  );
  assert.deepEqual(accepted.blockingReasons, []);
  assert.match(accepted.streams[1].detail, /explicitly excluded/i);

  const h264 = planMediaConversion(
    candidate,
    inspection([stream("video", "H.264/AVC"), stream("audio", "AAC")]),
  );
  assert.ok(h264);
  assert.deepEqual(
    h264.streams.map(({ action }) => action),
    ["copy", "copy"],
  );

  const rejected = planMediaConversion(
    candidate,
    inspection([stream("video", "MPEG-2 Video"), stream("audio", "MP3")]),
  );
  assert.ok(rejected);
  assert.deepEqual(
    rejected.streams.map(({ action }) => action),
    ["reject", "exclude"],
  );
});

test("AVI to MOV candidate copies compatible video and explicitly excludes MP3", () => {
  const candidate = {
    id: "avi-to-mov",
    input: "avi",
    output: "mov",
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [],
    fidelityLimitations: [],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: false,
  };
  const accepted = planMediaConversion(
    candidate,
    inspection([
      stream("video", "MPEG-4 Part 2"),
      stream("audio", "MP3"),
    ]),
  );
  assert.ok(accepted);
  assert.deepEqual(
    accepted.streams.map(({ action }) => action),
    ["copy", "exclude"],
  );
  assert.deepEqual(accepted.blockingReasons, []);
  assert.match(accepted.streams[1].detail, /explicitly excluded/i);

  const h264 = planMediaConversion(
    candidate,
    inspection([stream("video", "H.264/AVC"), stream("audio", "AAC")]),
  );
  assert.ok(h264);
  assert.deepEqual(
    h264.streams.map(({ action }) => action),
    ["copy", "copy"],
  );

  const rejected = planMediaConversion(
    candidate,
    inspection([stream("video", "MPEG-2 Video"), stream("audio", "MP3")]),
  );
  assert.ok(rejected);
  assert.deepEqual(
    rejected.streams.map(({ action }) => action),
    ["reject", "exclude"],
  );
});

test("AVI to MPEG-TS candidate packet-copies compatible video and audio", () => {
  const candidate = {
    id: "avi-to-mpeg-ts",
    input: "avi",
    output: "mpeg-ts",
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [],
    fidelityLimitations: [],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: false,
  };
  const accepted = planMediaConversion(
    candidate,
    inspection([
      stream("video", "MPEG-4 Part 2"),
      stream("audio", "MP3"),
    ]),
  );
  assert.ok(accepted);
  assert.deepEqual(
    accepted.streams.map(({ action }) => action),
    ["copy", "copy"],
  );
  assert.deepEqual(accepted.blockingReasons, []);

  const h264 = planMediaConversion(
    candidate,
    inspection([stream("video", "H.264/AVC"), stream("audio", "AAC")]),
  );
  assert.ok(h264);
  assert.deepEqual(
    h264.streams.map(({ action }) => action),
    ["copy", "copy"],
  );

  const rejected = planMediaConversion(
    candidate,
    inspection([stream("video", "MPEG-2 Video"), stream("audio", "MP3")]),
  );
  assert.ok(rejected);
  assert.deepEqual(
    rejected.streams.map(({ action }) => action),
    ["reject", "copy"],
  );
});

test("AVI to FLV candidate packet-copies H.264 video and MP3 audio", () => {
  const candidate = {
    id: "avi-to-flv",
    input: "avi",
    output: "flv",
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [],
    fidelityLimitations: [],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: false,
  };
  const accepted = planMediaConversion(
    candidate,
    inspection([stream("video", "H.264/AVC"), stream("audio", "MP3")]),
  );
  assert.ok(accepted);
  assert.deepEqual(
    accepted.streams.map(({ action }) => action),
    ["copy", "copy"],
  );
  assert.deepEqual(accepted.blockingReasons, []);

  const aac = planMediaConversion(
    candidate,
    inspection([stream("video", "H.264/AVC"), stream("audio", "AAC")]),
  );
  assert.ok(aac);
  assert.deepEqual(
    aac.streams.map(({ action }) => action),
    ["copy", "copy"],
  );

  const rejected = planMediaConversion(
    candidate,
    inspection([
      stream("video", "MPEG-4 Part 2"),
      stream("audio", "MP3"),
    ]),
  );
  assert.ok(rejected);
  assert.deepEqual(
    rejected.streams.map(({ action }) => action),
    ["reject", "copy"],
  );
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
  assert.deepEqual(
    plan.streams.map(({ action }) => action),
    ["copy", "copy", "reject"],
  );
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
  assert.deepEqual(
    plan.streams.map(({ action }) => action),
    ["exclude", "exclude", "copy", "exclude"],
  );
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
  assert.deepEqual(
    plan.streams.map(({ action }) => action),
    ["exclude", "copy", "copy", "reject"],
  );
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
  assert.deepEqual(
    plan.streams.map(({ action }) => action),
    ["re-encode", "copy", "exclude"],
  );
  assert.match(plan.streams[0].detail, /VP9/);
});

test("AVI to OGV plans genuine Theora encoding and explicit audio exclusion", () => {
  const plan = planMediaConversion(
    profile("avi-to-ogv"),
    inspection([
      stream("video", "MPEG-4 Part 2"),
      stream("audio", "MP3"),
    ]),
  );
  assert.ok(plan);
  assert.deepEqual(
    plan.streams.map(({ action }) => action),
    ["re-encode", "exclude"],
  );
  assert.match(plan.streams[0].detail, /Theora/);
  assert.match(plan.streams[0].detail, /640px no-upscale/);
  assert.match(plan.streams[0].detail, /quality-based VBR/);
  assert.match(plan.streams[1].detail, /excludes audio/);
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
    inspection(
      [
        stream("video", "H.264/AVC"),
        stream("audio", "AAC"),
        stream("audio", "Opus"),
      ],
      ["container title", "stream language"],
    ),
  );
  assert.ok(plan);
  assert.deepEqual(
    plan.streams.map(({ action }) => action),
    ["exclude", "re-encode", "exclude"],
  );
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

test("compatible WebM copy accepts AV1, VP8, and VP9 and excludes incompatible streams", () => {
  const plan = planMediaConversion(
    profile("mkv-to-webm-av1"),
    inspection([
      stream("video", "AV1"),
      stream("audio", "Opus"),
      stream("audio", "AAC"),
    ]),
  );
  assert.ok(plan);
  assert.deepEqual(
    plan.streams.map(({ action }) => action),
    ["copy", "copy", "exclude"],
  );

  for (const codec of ["VP8", "VP9"]) {
    const compatiblePlan = planMediaConversion(
      profile("mkv-to-webm-av1"),
      inspection([stream("video", codec), stream("audio", "Vorbis")]),
    );
    assert.ok(compatiblePlan);
    assert.deepEqual(
      compatiblePlan.streams.map(({ action }) => action),
      ["copy", "copy"],
      codec,
    );
    assert.deepEqual(compatiblePlan.blockingReasons, [], codec);
  }

  const blocked = planMediaConversion(
    profile("mkv-to-webm-av1"),
    inspection([stream("video", "H.264/AVC"), stream("audio", "Opus")]),
  );
  assert.ok(blocked);
  assert.equal(blocked.streams[0].action, "reject");
  assert.match(blocked.streams[0].detail, /not AV1, VP8, or VP9/);
});

test("IVF extraction copies only the first AV1, VP8, or VP9 video and blocks incompatible sources", () => {
  for (const [input, codec] of [
    ["mkv", "AV1"],
    ["webm", "VP8"],
    ["webm", "VP9"],
  ]) {
    const accepted = planMediaConversion(
      profile(`${input}-to-ivf`),
      inspection([
        stream("video", codec),
        stream("audio", "Opus"),
        stream("video", "VP9"),
        stream("subtitle", "WebVTT"),
      ]),
    );
    assert.ok(accepted);
    assert.deepEqual(
      accepted.streams.map(({ action }) => action),
      ["copy", "exclude", "exclude", "exclude"],
      `${input} ${codec}`,
    );
    assert.deepEqual(accepted.blockingReasons, [], `${input} ${codec}`);
    assert.match(accepted.streams[0].detail, /compressed|byte-for-byte/i);
    assert.match(accepted.streams[1].detail, /explicitly excluded/i);
  }

  const blocked = planMediaConversion(
    profile("mkv-to-ivf"),
    inspection([stream("video", "H.264/AVC"), stream("video", "VP9")]),
  );
  assert.ok(blocked);
  assert.deepEqual(
    blocked.streams.map(({ action }) => action),
    ["reject", "exclude"],
  );
  assert.match(
    blocked.blockingReasons.join(" "),
    /first video stream is not AV1, VP8, or VP9/i,
  );

  const audioOnly = planMediaConversion(
    profile("webm-to-ivf"),
    inspection([stream("audio", "Opus")]),
  );
  assert.ok(audioOnly);
  assert.match(audioOnly.blockingReasons.join(" "), /requires a video stream/i);
});

test("IVF input routes plan direct compatible packet copies", () => {
  const ivfProfile = (id, output) => ({
    id,
    input: "ivf",
    output,
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [],
    fidelityLimitations: [],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: false,
  });
  for (const [id, codec] of [
    ["ivf-to-webm", "AV1"],
    ["ivf-to-webm", "VP8"],
    ["ivf-to-mkv", "VP9"],
  ]) {
    const plan = planMediaConversion(
      ivfProfile(id, id === "ivf-to-webm" ? "webm-av1" : "mkv"),
      inspection([stream("video", codec)]),
    );
    assert.ok(plan);
    assert.deepEqual(plan.streams.map(({ action }) => action), ["copy"], `${id} ${codec}`);
    assert.deepEqual(plan.blockingReasons, [], `${id} ${codec}`);
  }

  const blocked = planMediaConversion(
    ivfProfile("ivf-to-webm", "webm-av1"),
    inspection([stream("video", "H.264/AVC")]),
  );
  assert.ok(blocked);
  assert.equal(blocked.streams[0].action, "reject");
  assert.match(blocked.blockingReasons.join(" "), /incompatible/i);
});

test("compatible OGV copy packet-copies Theora and Vorbis and rejects a non-Theora primary video", () => {
  const ogvProfile = {
    id: "mkv-to-ogv",
    input: "mkv",
    output: "ogv",
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [],
    fidelityLimitations: [],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: false,
  };
  const compatible = planMediaConversion(
    ogvProfile,
    inspection([
      stream("video", "Theora"),
      stream("audio", "Vorbis"),
      stream("audio", "AAC"),
      stream("subtitle", "ASS subtitle"),
    ]),
  );
  assert.ok(compatible);
  assert.deepEqual(
    compatible.streams.map(({ action }) => action),
    ["copy", "copy", "exclude", "exclude"],
  );
  assert.deepEqual(compatible.blockingReasons, []);

  const blocked = planMediaConversion(
    ogvProfile,
    inspection([stream("video", "H.264/AVC"), stream("audio", "Vorbis")]),
  );
  assert.ok(blocked);
  assert.equal(blocked.streams[0].action, "reject");
  assert.match(blocked.streams[0].detail, /first video stream is not Theora/);

  const audioOnly = planMediaConversion(
    ogvProfile,
    inspection([stream("audio", "Vorbis")]),
  );
  assert.ok(audioOnly);
  assert.match(audioOnly.blockingReasons.join(" "), /requires a video stream/);
});

test("bounded AVI copy accepts MPEG-4 Part 2 or MPEG-2 plus MP3 and rejects incompatible video", () => {
  const aviProfile = {
    id: "mkv-to-avi",
    input: "mkv",
    output: "avi",
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [],
    fidelityLimitations: [],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: false,
  };
  const compatible = planMediaConversion(
    aviProfile,
    inspection([
      stream("video", "MPEG-4 Part 2"),
      stream("audio", "MP3"),
      stream("subtitle", "ASS subtitle"),
    ]),
  );
  assert.ok(compatible);
  assert.deepEqual(
    compatible.streams.map(({ action }) => action),
    ["copy", "copy", "exclude"],
  );
  assert.deepEqual(compatible.blockingReasons, []);

  const compatibleMpeg2 = planMediaConversion(
    aviProfile,
    inspection([stream("video", "MPEG-2 Video"), stream("audio", "MP3")]),
  );
  assert.ok(compatibleMpeg2);
  assert.deepEqual(
    compatibleMpeg2.streams.map(({ action }) => action),
    ["copy", "copy"],
  );
  assert.deepEqual(compatibleMpeg2.blockingReasons, []);

  const blocked = planMediaConversion(
    aviProfile,
    inspection([stream("video", "H.264/AVC"), stream("audio", "MP3")]),
  );
  assert.ok(blocked);
  assert.equal(blocked.streams[0].action, "reject");

  const incompatibleAudio = planMediaConversion(
    aviProfile,
    inspection([stream("video", "MPEG-4 Part 2"), stream("audio", "AAC")]),
  );
  assert.ok(incompatibleAudio);
  assert.deepEqual(
    incompatibleAudio.streams.map(({ action }) => action),
    ["copy", "exclude"],
  );
  assert.deepEqual(incompatibleAudio.blockingReasons, []);

  const audioOnly = planMediaConversion(
    aviProfile,
    inspection([stream("audio", "MP3")]),
  );
  assert.ok(audioOnly);
  assert.match(audioOnly.blockingReasons.join(" "), /requires a video stream/);
});

test("automatic generic WebM selection prefers compatible copy but respects an explicit VP9 encode", () => {
  const candidates = conversionProfiles.filter(
    (candidate) => candidate.input === "mkv",
  );
  const source = inspection([stream("video", "VP8"), stream("audio", "Opus")]);
  const automatic = selectAutomaticMediaProfile(
    profile("mkv-to-webm"),
    candidates,
    source,
  );
  assert.equal(automatic.changed, true);
  assert.equal(automatic.profile.id, "mkv-to-webm-av1");
  assert.equal(automatic.profile.route, "stream-copy");
  assert.match(automatic.reason, /without decoding or re-encoding/);

  const explicit = selectAutomaticMediaProfile(
    profile("mkv-to-webm-vp9"),
    candidates,
    source,
  );
  assert.equal(explicit.changed, false);
  assert.equal(explicit.profile.id, "mkv-to-webm-vp9");
});

test("automatic media selection keeps a standards-compliant stream copy", () => {
  const selected = profile("mkv-to-mp4");
  const choice = selectAutomaticMediaProfile(
    selected,
    conversionProfiles.filter((candidate) => candidate.input === "mkv"),
    inspection([stream("video", "H.264/AVC"), stream("audio", "AAC")]),
  );
  assert.equal(choice.changed, false);
  assert.equal(choice.profile.id, "mkv-to-mp4");
  assert.deepEqual(
    choice.plan.streams.map(({ action }) => action),
    ["copy", "copy"],
  );
});

test("automatic media selection falls back from incompatible MP4 copy to certified encode", () => {
  const choice = selectAutomaticMediaProfile(
    profile("mkv-to-mp4"),
    conversionProfiles.filter((candidate) => candidate.input === "mkv"),
    inspection([stream("video", "MPEG-2 Video"), stream("audio", "AAC")]),
  );
  assert.equal(choice.changed, true);
  assert.equal(choice.profile.id, "mkv-to-mp4-mpeg4");
  assert.deepEqual(
    choice.plan.streams.map(({ action }) => action),
    ["re-encode", "exclude"],
  );
  assert.match(choice.reason, /automatically selected/);
});

test("automatic media selection falls back from incompatible AV1 copy to VP8", () => {
  const choice = selectAutomaticMediaProfile(
    profile("mkv-to-webm-av1"),
    conversionProfiles.filter((candidate) => candidate.input === "mkv"),
    inspection([stream("video", "HEVC"), stream("audio", "AAC")]),
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
        ([, routes]) => routes.has("stream-copy") && routes.has("re-encode"),
      )
      .map(([key]) => key)
      .sort(),
    ["mkv:mp4", "mkv:webm"],
  );
});
