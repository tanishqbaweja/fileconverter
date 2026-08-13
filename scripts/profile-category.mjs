import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const activeProfileMarker = path.join(
  projectRoot,
  "work",
  "memory-profile-chrome",
  "DevToolsActivePort",
);
const category = process.argv[2];
const runCount = process.env.WITHIN_RUN_COUNT ?? "3";
const reuseFixtures = process.env.WITHIN_REUSE_FIXTURES === "1";
const resumeProfile = process.env.WITHIN_PROFILE_START ?? null;
const endProfile = process.env.WITHIN_PROFILE_END ?? null;

const categories = {
  "wma-output": {
    generator: "scripts/generate-wma-output-stress-fixtures.mjs",
    profiles: [
      ["m4a-to-wma", "audio-aac-wma-128m.m4a"],
      ["m4a-to-wma", "audio-alac-128m.m4a"],
      ["aac-to-wma", "audio-aac-128m.aac"],
      ["mp3-to-wma", "audio-mp3-wma-128m.mp3"],
      ["aiff-to-wma", "audio-pcm-192m.aiff"],
      ["ogg-to-wma", "audio-vorbis-flac-128m.ogg"],
      ["opus-to-wma", "audio-opus-flac-128m.opus"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "container-wma": {
    generator: "scripts/generate-container-wma-stress-fixtures.mjs",
    profiles: [
      ["mkv-to-wma", "h264-aac-flac-128m.mkv"],
      ["mp4-to-wma", "h264-aac-flac-128m.mp4"],
      ["mov-to-wma", "h264-aac-flac-128m.mov"],
      ["3gp-to-wma", "h264-aac-flac-128m.3gp"],
      ["mpeg-ts-to-wma", "h264-aac-flac-128m.mpegts"],
      ["flv-to-wma", "h264-aac-flac-128m.flv"],
      ["avi-to-wma", "mpeg4-mp3-webm-128m.avi"],
      ["ogv-to-wma", "theora-video-128m.ogv"],
      ["webm-to-wma", "av1-opus-128m.webm"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "container-aiff": {
    generator: "scripts/generate-container-wma-stress-fixtures.mjs",
    profiles: [
      ["mkv-to-aiff", "h264-aac-flac-128m.mkv"],
      ["mp4-to-aiff", "h264-aac-flac-128m.mp4"],
      ["mov-to-aiff", "h264-aac-flac-128m.mov"],
      ["3gp-to-aiff", "h264-aac-flac-128m.3gp"],
      ["mpeg-ts-to-aiff", "h264-aac-flac-128m.mpegts"],
      ["flv-to-aiff", "h264-aac-flac-128m.flv"],
      ["avi-to-aiff", "mpeg4-mp3-webm-128m.avi"],
      ["ogv-to-aiff", "theora-video-128m.ogv"],
      ["webm-to-aiff", "av1-opus-128m.webm"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "webm-audio": {
    generator: "scripts/generate-container-ogg-stress-fixtures.mjs",
    generatorArguments: ["av1-opus-128m.webm"],
    profiles: ["wav", "flac", "amr", "mp3", "aac"].map((output) => [
      `webm-to-${output}`,
      "fixtures/stress/media/av1-opus-128m.webm",
    ]),
  },
  "container-amr-aac": {
    generator: "scripts/generate-container-amr-aac-stress-fixtures.mjs",
    passSelectedFixturesToGenerator: true,
    profiles: [
      ["mkv-to-amr", "h264-aac-flac-128m.mkv"],
      ["mp4-to-amr", "h264-aac-flac-128m.mp4"],
      ["mov-to-amr", "h264-aac-flac-128m.mov"],
      ["mpeg-ts-to-amr", "h264-aac-flac-128m.mpegts"],
      ["flv-to-amr", "h264-aac-flac-128m.flv"],
      ["avi-to-amr", "mpeg4-mp3-webm-128m.avi"],
      ["avi-to-aac", "mpeg4-mp3-webm-128m.avi"],
      ["ogv-to-aac", "theora-video-128m.ogv"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "container-lossy-audio": {
    generator: "scripts/generate-container-amr-aac-stress-fixtures.mjs",
    passSelectedFixturesToGenerator: true,
    profiles: [
      ["mp4-to-opus", "h264-aac-flac-128m.mp4"],
      ["mov-to-opus", "h264-aac-flac-128m.mov"],
      ["mpeg-ts-to-opus", "h264-aac-flac-128m.mpegts"],
      ["flv-to-opus", "h264-aac-flac-128m.flv"],
      ["avi-to-opus", "mpeg4-mp3-webm-128m.avi"],
      ["ogv-to-opus", "theora-video-128m.ogv"],
      ["mp4-to-ogg", "h264-aac-flac-128m.mp4"],
      ["mov-to-ogg", "h264-aac-flac-128m.mov"],
      ["mpeg-ts-to-ogg", "h264-aac-flac-128m.mpegts"],
      ["flv-to-ogg", "h264-aac-flac-128m.flv"],
      ["avi-to-ogg", "mpeg4-mp3-webm-128m.avi"],
      ["ogv-to-mp3", "theora-video-128m.ogv"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "container-m4a-amr": {
    generator: "scripts/generate-container-m4a-amr-stress-fixtures.mjs",
    passSelectedFixturesToGenerator: true,
    profiles: [
      ["avi-to-m4a", "mpeg4-mp3-webm-128m.avi"],
      ["ogv-to-m4a", "theora-video-128m.ogv"],
      ["webm-to-m4a", "av1-opus-128m.webm"],
      ["3gp-to-amr", "audio-amr-nb-128m.3gp"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "3gp-amr": {
    generator: "scripts/generate-3gp-amr-stress-fixture.mjs",
    profiles: [
      ["3gp-to-wav", "audio-amr-nb-128m.3gp"],
      ["3gp-to-flac", "audio-amr-nb-128m.3gp"],
      ["3gp-to-aiff", "audio-amr-nb-128m.3gp"],
      ["3gp-to-mp3", "audio-amr-nb-128m.3gp"],
      ["3gp-to-opus", "audio-amr-nb-128m.3gp"],
      ["3gp-to-ogg", "audio-amr-nb-128m.3gp"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "vorbis-output": {
    generator: "scripts/generate-mp3-output-stress-fixtures.mjs",
    generatorArguments: [
      "audio-aac-50m.m4a",
      "audio-alac-128m.m4a",
      "audio-aac-128m.aac",
      "audio-amr-nb-128m.amr",
      "audio-mp3-50m.mp3",
      "audio-flac-alac-128m.flac",
      "audio-pcm-alac-128m.wav",
      "audio-wma-128m.wma",
      "audio-pcm-192m.aiff",
      "audio-opus-flac-128m.opus",
    ],
    profiles: [
      ["m4a-to-ogg", "audio-aac-50m.m4a"],
      ["m4a-to-ogg", "audio-alac-128m.m4a"],
      ["aac-to-ogg", "audio-aac-128m.aac"],
      ["amr-to-ogg", "audio-amr-nb-128m.amr"],
      ["mp3-to-ogg", "audio-mp3-50m.mp3"],
      ["flac-to-ogg", "audio-flac-alac-128m.flac"],
      ["wav-to-ogg", "audio-pcm-alac-128m.wav"],
      ["wma-to-ogg", "audio-wma-128m.wma"],
      ["aiff-to-ogg", "audio-pcm-192m.aiff"],
      ["opus-to-ogg", "audio-opus-flac-128m.opus"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "opus-output": {
    generator: "scripts/generate-mp3-output-stress-fixtures.mjs",
    generatorArguments: [
      "audio-aac-50m.m4a",
      "audio-alac-128m.m4a",
      "audio-aac-128m.aac",
      "audio-amr-nb-128m.amr",
      "audio-mp3-50m.mp3",
      "audio-flac-alac-128m.flac",
      "audio-pcm-alac-128m.wav",
      "audio-wma-128m.wma",
      "audio-pcm-192m.aiff",
      "audio-vorbis-flac-128m.ogg",
    ],
    profiles: [
      ["m4a-to-opus", "audio-aac-50m.m4a"],
      ["m4a-to-opus", "audio-alac-128m.m4a"],
      ["aac-to-opus", "audio-aac-128m.aac"],
      ["amr-to-opus", "audio-amr-nb-128m.amr"],
      ["mp3-to-opus", "audio-mp3-50m.mp3"],
      ["flac-to-opus", "audio-flac-alac-128m.flac"],
      ["wav-to-opus", "audio-pcm-alac-128m.wav"],
      ["wma-to-opus", "audio-wma-128m.wma"],
      ["aiff-to-opus", "audio-pcm-192m.aiff"],
      ["ogg-to-opus", "audio-vorbis-flac-128m.ogg"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "aac-output": {
    generator: "scripts/generate-mp3-output-stress-fixtures.mjs",
    generatorArguments: [
      "audio-aac-50m.m4a",
      "audio-alac-128m.m4a",
      "audio-amr-nb-128m.amr",
      "audio-mp3-50m.mp3",
      "audio-flac-alac-128m.flac",
      "audio-pcm-alac-128m.wav",
      "audio-wma-128m.wma",
      "audio-pcm-192m.aiff",
      "audio-vorbis-flac-128m.ogg",
      "audio-opus-flac-128m.opus",
    ],
    profiles: [
      ["m4a-to-aac", "audio-aac-50m.m4a"],
      ["m4a-to-aac", "audio-alac-128m.m4a"],
      ["amr-to-aac", "audio-amr-nb-128m.amr"],
      ["mp3-to-aac", "audio-mp3-50m.mp3"],
      ["flac-to-aac", "audio-flac-alac-128m.flac"],
      ["wav-to-aac", "audio-pcm-alac-128m.wav"],
      ["wma-to-aac", "audio-wma-128m.wma"],
      ["aiff-to-aac", "audio-pcm-192m.aiff"],
      ["ogg-to-aac", "audio-vorbis-flac-128m.ogg"],
      ["opus-to-aac", "audio-opus-flac-128m.opus"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "mp3-output": {
    generator: "scripts/generate-mp3-output-stress-fixtures.mjs",
    profiles: [
      ["m4a-to-mp3", "audio-aac-50m.m4a"],
      ["m4a-to-mp3", "audio-alac-128m.m4a"],
      ["aac-to-mp3", "audio-aac-128m.aac"],
      ["amr-to-mp3", "audio-amr-nb-128m.amr"],
      ["flac-to-mp3", "audio-flac-alac-128m.flac"],
      ["wav-to-mp3", "audio-pcm-alac-128m.wav"],
      ["wma-to-mp3", "audio-wma-128m.wma"],
      ["aiff-to-mp3", "audio-pcm-192m.aiff"],
      ["ogg-to-mp3", "audio-vorbis-flac-128m.ogg"],
      ["opus-to-mp3", "audio-opus-flac-128m.opus"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "amr-output": {
    generator: "scripts/generate-amr-output-stress-fixtures.mjs",
    profiles: [
      ["m4a-to-amr", "audio-aac-50m.m4a"],
      ["m4a-to-amr", "audio-alac-128m.m4a"],
      ["aac-to-amr", "audio-aac-128m.aac"],
      ["mp3-to-amr", "audio-mp3-50m.mp3"],
      ["flac-to-amr", "audio-flac-alac-128m.flac"],
      ["wav-to-amr", "audio-pcm-alac-128m.wav"],
      ["wma-to-amr", "audio-wma-128m.wma"],
      ["aiff-to-amr", "audio-pcm-192m.aiff"],
      ["ogg-to-amr", "audio-vorbis-flac-128m.ogg"],
      ["opus-to-amr", "audio-opus-flac-128m.opus"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "aiff-output": {
    generator: "scripts/generate-aiff-output-stress-fixtures.mjs",
    profiles: [
      ["m4a-to-aiff", "audio-aac-50m.m4a"],
      ["m4a-to-aiff", "audio-alac-128m.m4a"],
      ["aac-to-aiff", "audio-aac-128m.aac"],
      ["amr-to-aiff", "audio-amr-nb-128m.amr"],
      ["mp3-to-aiff", "audio-mp3-50m.mp3"],
      ["flac-to-aiff", "audio-flac-alac-128m.flac"],
      ["wav-to-aiff", "audio-pcm-alac-128m.wav"],
      ["wma-to-aiff", "audio-wma-128m.wma"],
      ["ogg-to-aiff", "audio-vorbis-flac-128m.ogg"],
      ["opus-to-aiff", "audio-opus-flac-128m.opus"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  audio: {
    generator: "scripts/generate-audio-stress-fixture.mjs",
    profiles: [
      ["m4a-to-wav", "audio-aac-50m.m4a"],
      ["mp3-to-wav", "audio-mp3-50m.mp3"],
      ["flac-to-wav", "audio-flac-50m.flac"],
      ["aiff-to-wav", "audio-pcm-192m.aiff"],
      ["ogg-to-wav", "audio-vorbis-long.ogg"],
      ["opus-to-wav", "audio-opus-long.opus"],
      ["m4a-to-flac", "audio-aac-50m.m4a"],
      ["mp3-to-flac", "audio-mp3-50m.mp3"],
      ["wav-to-flac", "audio-pcm-192m.wav"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  aac: {
    generator: "scripts/generate-aac-stress-fixture.mjs",
    profiles: [
      ["aac-to-m4a", "audio-aac-128m.aac"],
      ["aac-to-wav", "audio-aac-128m.aac"],
      ["aac-to-flac", "audio-aac-128m.aac"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  alac: {
    generator: "scripts/generate-alac-stress-fixture.mjs",
    profiles: [
      ["m4a-to-wav", "audio-alac-128m.m4a"],
      ["m4a-to-flac", "audio-alac-128m.m4a"],
      ["wav-to-alac", "audio-pcm-alac-128m.wav"],
      ["flac-to-alac", "audio-flac-alac-128m.flac"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  wma: {
    generator: "scripts/generate-wma-stress-fixture.mjs",
    profiles: [
      ["wma-to-wav", "audio-wma-128m.wma"],
      ["wma-to-flac", "audio-wma-128m.wma"],
      ["wav-to-wma", "audio-pcm-wma-128m.wav"],
      ["flac-to-wma", "audio-flac-wma-128m.flac"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  amr: {
    generator: "scripts/generate-amr-stress-fixture.mjs",
    profiles: [
      ["amr-to-wav", "audio-amr-nb-128m.amr"],
      ["amr-to-flac", "audio-amr-nb-128m.amr"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "amr-wb": {
    generator: "scripts/generate-amr-wb-stress-fixture.mjs",
    profiles: [
      ["amr-wb-to-wav", "audio-amr-wb-128m.awb"],
      ["amr-wb-to-flac", "audio-amr-wb-128m.awb"],
      ["amr-wb-to-mp3", "audio-amr-wb-128m.awb"],
      ["amr-wb-to-aiff", "audio-amr-wb-128m.awb"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "flac-inputs": {
    generator: "scripts/generate-flac-input-stress-fixtures.mjs",
    profiles: [
      ["aiff-to-flac", "audio-pcm-flac-192m.aiff"],
      ["ogg-to-flac", "audio-vorbis-flac-128m.ogg"],
      ["opus-to-flac", "audio-opus-flac-128m.opus"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "container-flac": {
    generator: "scripts/generate-container-flac-stress-fixtures.mjs",
    profiles: ["mkv", "mp4", "mov", "3gp", "mpeg-ts", "flv"].map(
      (input) => [
        `${input}-to-flac`,
        `fixtures/stress/media/h264-aac-flac-128m.${input === "mpeg-ts" ? "mpegts" : input}`,
      ],
    ),
  },
  "container-aac": {
    generator: "scripts/generate-container-flac-stress-fixtures.mjs",
    profiles: ["mkv", "mp4", "mov", "3gp", "mpeg-ts", "flv"].map(
      (input) => [
        `${input}-to-aac`,
        `fixtures/stress/media/h264-aac-flac-128m.${input === "mpeg-ts" ? "mpegts" : input}`,
      ],
    ),
  },
  "container-ogg": {
    generator: "scripts/generate-container-ogg-stress-fixtures.mjs",
    profiles: [
      ["mkv-to-ogg", "fixtures/stress/media/av1-vorbis-128m.mkv"],
      ["webm-to-ogg", "fixtures/stress/media/av1-vorbis-128m.webm"],
      ["ogv-to-ogg", "fixtures/stress/media/theora-video-128m.ogv"],
      ["mkv-to-opus", "fixtures/stress/media/av1-opus-128m.mkv"],
      ["webm-to-opus", "fixtures/stress/media/av1-opus-128m.webm"],
    ],
  },
  "legacy-container-flac": {
    generator: "scripts/generate-legacy-container-flac-stress-fixtures.mjs",
    profiles: [
      ["avi-to-flac", "mpeg4-mp3-webm-128m.avi"],
      ["ogv-to-flac", "theora-video-128m.ogv"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  mov: {
    generator: "scripts/generate-mov-stress-fixture.mjs",
    profiles: [
      ["mov-to-mp4", "quicktime-128m.mov"],
      ["mov-to-m4a", "quicktime-128m.mov"],
      ["mov-to-wav", "quicktime-128m.mov"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "container-webm": {
    generator: "scripts/generate-container-webm-stress-fixtures.mjs",
    profiles: [
      ["mp4-to-webm", "h264-aac-128m.mp4"],
      ["mp4-to-webm-vp9", "h264-aac-128m.mp4"],
      ["mov-to-webm", "h264-aac-128m.mov"],
      ["mov-to-webm-vp9", "h264-aac-128m.mov"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "legacy-container-webm": {
    generator: "scripts/generate-legacy-container-webm-stress-fixtures.mjs",
    profiles: [
      ["3gp-to-webm", "h264-aac-128m.3gp"],
      ["3gp-to-webm-vp9", "h264-aac-128m.3gp"],
      ["mpeg-ts-to-webm", "h264-aac-128m.mpegts"],
      ["mpeg-ts-to-webm-vp9", "h264-aac-128m.mpegts"],
      ["flv-to-webm", "h264-aac-128m.flv"],
      ["flv-to-webm-vp9", "h264-aac-128m.flv"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "container-matroska": {
    generator: "scripts/generate-container-matroska-stress-fixtures.mjs",
    profiles: [
      ["mp4-to-mkv", "h264-aac-128m.mp4"],
      ["mov-to-mkv", "h264-aac-128m.mov"],
      ["3gp-to-mkv", "h264-aac-128m.3gp"],
      ["mpeg-ts-to-mkv", "h264-aac-128m.mpegts"],
      ["flv-to-mkv", "h264-aac-128m.flv"],
      ["avi-to-mkv", "mpeg4-mp3-webm-128m.avi"],
      ["webm-to-mkv", "av1-opus-128m.webm"],
      ["ogv-to-mkv", "theora-video-128m.ogv"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "container-mpegts": {
    generator: "scripts/generate-container-mpegts-stress-fixtures.mjs",
    profiles: [
      ["mkv-to-mpeg-ts", "fixtures/stress/media/h264-aac-128m.mkv"],
      ["mp4-to-mpeg-ts", "fixtures/stress/media/h264-aac-128m.mp4"],
      ["mov-to-mpeg-ts", "fixtures/stress/media/h264-aac-128m.mov"],
      ["3gp-to-mpeg-ts", "fixtures/stress/media/h264-aac-128m.3gp"],
      ["flv-to-mpeg-ts", "fixtures/stress/media/h264-aac-128m.flv"],
    ],
  },
  "container-threegp": {
    generator: "scripts/generate-container-mpegts-stress-fixtures.mjs",
    profiles: [
      ["mkv-to-3gp", "fixtures/stress/media/h264-aac-128m.mkv"],
      ["mp4-to-3gp", "fixtures/stress/media/h264-aac-128m.mp4"],
      ["mov-to-3gp", "fixtures/stress/media/h264-aac-128m.mov"],
      ["mpeg-ts-to-3gp", "fixtures/stress/media/h264-aac-128m.mpegts"],
      ["flv-to-3gp", "fixtures/stress/media/h264-aac-128m.flv"],
    ],
  },
  "container-mov": {
    generator: "scripts/generate-container-mpegts-stress-fixtures.mjs",
    profiles: [
      ["mkv-to-mov", "fixtures/stress/media/h264-aac-128m.mkv"],
      ["mp4-to-mov", "fixtures/stress/media/h264-aac-128m.mp4"],
      ["3gp-to-mov", "fixtures/stress/media/h264-aac-128m.3gp"],
      ["mpeg-ts-to-mov", "fixtures/stress/media/h264-aac-128m.mpegts"],
      ["flv-to-mov", "fixtures/stress/media/h264-aac-128m.flv"],
    ],
  },
  "container-flv": {
    generator: "scripts/generate-container-mpegts-stress-fixtures.mjs",
    profiles: [
      ["mkv-to-flv", "fixtures/stress/media/h264-aac-128m.mkv"],
      ["mp4-to-flv", "fixtures/stress/media/h264-aac-128m.mp4"],
      ["mov-to-flv", "fixtures/stress/media/h264-aac-128m.mov"],
      ["3gp-to-flv", "fixtures/stress/media/h264-aac-128m.3gp"],
      ["mpeg-ts-to-flv", "fixtures/stress/media/h264-aac-128m.mpegts"],
    ],
  },
  "3gp": {
    generator: "scripts/generate-3gp-stress-fixture.mjs",
    profiles: [
      ["3gp-to-mp4", "mobile-video-128m.3gp"],
      ["3gp-to-m4a", "mobile-video-128m.3gp"],
      ["3gp-to-wav", "mobile-video-128m.3gp"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "mpeg-ts": {
    generator: "scripts/generate-mpeg-ts-stress-fixture.mjs",
    profiles: [
      ["mpeg-ts-to-mp4", "transport-128m.mpegts"],
      ["mpeg-ts-to-m4a", "transport-128m.mpegts"],
      ["mpeg-ts-to-wav", "transport-128m.mpegts"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  flv: {
    generator: "scripts/generate-flv-stress-fixture.mjs",
    profiles: [
      ["flv-to-mp4", "flash-video-128m.flv"],
      ["flv-to-m4a", "flash-video-128m.flv"],
      ["flv-to-wav", "flash-video-128m.flv"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  avi: {
    generator: "scripts/generate-avi-stress-fixture.mjs",
    profiles: [
      ["avi-to-mp4", "legacy-video-128m.avi"],
      ["avi-to-wav", "legacy-video-128m.avi"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "avi-webm": {
    generator: "scripts/generate-avi-webm-stress-fixture.mjs",
    profiles: [
      ["avi-to-webm", "mpeg4-mp3-webm-128m.avi"],
      ["avi-to-webm-vp9", "mpeg4-mp3-webm-128m.avi"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  ogv: {
    generator: "scripts/generate-ogv-stress-fixture.mjs",
    profiles: [
      ["ogv-to-webm", "theora-video-128m.ogv"],
      ["ogv-to-wav", "theora-video-128m.ogv"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "mpeg2-video": {
    generator: "scripts/generate-mpeg2-video-stress-fixture.mjs",
    profiles: [
      ["m2v-to-mp4-mpeg4", "mpeg2-video-128m.m2v"],
      ["m2v-to-webm", "mpeg2-video-128m.m2v"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "mpeg2-elementary": {
    generator: "scripts/generate-mpeg2-elementary-stress-fixtures.mjs",
    profiles: [
      ["m2v-to-mpeg-ts", "mpeg2-video-128m.m2v"],
      ["mkv-to-m2v", "mpeg2-video-128m.mkv"],
      ["mp4-to-m2v", "mpeg2-video-128m.mp4"],
      ["mov-to-m2v", "mpeg2-video-128m.mov"],
      ["avi-to-m2v", "mpeg2-video-128m.avi"],
      ["mpeg-ts-to-m2v", "mpeg2-video-128m.mpegts"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "m4v-elementary": {
    generator: "scripts/generate-m4v-elementary-stress-fixtures.mjs",
    profiles: [
      ["m4v-to-mp4", "mpeg4-video-128m.m4v"],
      ["mkv-to-m4v", "mpeg4-video-128m.mkv"],
      ["mp4-to-m4v", "mpeg4-video-128m.mp4"],
      ["mov-to-m4v", "mpeg4-video-128m.mov"],
      ["avi-to-m4v", "mpeg4-video-128m.avi"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "av1-webm": {
    generator: "scripts/generate-av1-opus-stress-fixture.mjs",
    profiles: [
      ["mkv-to-webm-av1", "fixtures/stress/media/av1-opus-128m.mkv"],
    ],
  },
  "container-mp3": {
    generator: "scripts/generate-container-mp3-stress-fixtures.mjs",
    profiles: ["mkv", "mp4", "mov", "avi", "mpeg-ts", "flv"].map(
      (input) => [
        `${input}-to-mp3`,
        `fixtures/stress/media/h264-mp3-128m.${input === "mpeg-ts" ? "mpegts" : input}`,
      ],
    ),
  },
  "h264-elementary": {
    generator: "scripts/generate-h264-elementary-stress-fixtures.mjs",
    profiles: [
      ["h264-to-mp4", "h264-elementary-128m.h264"],
      ["h264-to-webm", "h264-elementary-128m.h264"],
      ["h264-to-webm-vp9", "h264-elementary-128m.h264"],
      ["mkv-to-h264", "h264-aac-flac-128m.mkv"],
      ["mp4-to-h264", "h264-aac-flac-128m.mp4"],
      ["mov-to-h264", "h264-aac-flac-128m.mov"],
      ["3gp-to-h264", "h264-aac-flac-128m.3gp"],
      ["mpeg-ts-to-h264", "h264-aac-flac-128m.mpegts"],
      ["flv-to-h264", "h264-aac-flac-128m.flv"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  "hevc-elementary": {
    generator: "scripts/generate-hevc-elementary-stress-fixtures.mjs",
    profiles: [
      ["mkv-to-hevc", "hevc-video-128m.mkv"],
      ["mp4-to-hevc", "hevc-video-128m.mp4"],
      ["mov-to-hevc", "quicktime-128m.mov"],
      ["mpeg-ts-to-hevc", "hevc-video-128m.mpegts"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  vp9: {
    generator: "scripts/generate-vp9-stress-fixtures.mjs",
    profiles: [
      ["mkv-to-webm-vp9", "matroska-vp9-128m.mkv"],
      ["ogv-to-webm-vp9", "theora-video-128m.ogv"],
      ["m2v-to-webm-vp9", "mpeg2-video-128m.m2v"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/media/${name}`,
    ]),
  },
  records: {
    generator: "scripts/generate-record-stress-fixtures.mjs",
    profiles: [
      ["csv-to-tsv", "records-128m.csv"],
      ["csv-to-ndjson", "records-128m.csv"],
      ["csv-to-json", "records-128m.csv"],
      ["tsv-to-csv", "records-128m.tsv"],
      ["tsv-to-ndjson", "records-128m.tsv"],
      ["tsv-to-json", "records-128m.tsv"],
      ["ndjson-to-csv", "records-128m.ndjson"],
      ["ndjson-to-tsv", "records-128m.ndjson"],
      ["ndjson-to-json", "records-128m.ndjson"],
      ["json-to-ndjson", "records-128m.json"],
      ["json-to-csv", "records-128m.json"],
      ["json-to-tsv", "records-128m.json"],
      ["xml-to-ndjson", "records-128m.xml"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/data/${name}`,
    ]),
  },
  "records-csv-json": {
    generator: "scripts/generate-record-stress-fixtures.mjs",
    generatorArguments: ["csv"],
    profiles: [["csv-to-json", "fixtures/stress/data/records-128m.csv"]],
  },
  "records-tsv-json": {
    generator: "scripts/generate-record-stress-fixtures.mjs",
    generatorArguments: ["tsv"],
    profiles: [["tsv-to-json", "fixtures/stress/data/records-128m.tsv"]],
  },
  "records-json-delimited": {
    generator: "scripts/generate-record-stress-fixtures.mjs",
    generatorArguments: ["json"],
    profiles: [
      ["json-to-csv", "fixtures/stress/data/records-128m.json"],
      ["json-to-tsv", "fixtures/stress/data/records-128m.json"],
    ],
  },
  subtitles: {
    generator: "scripts/generate-subtitle-stress-fixtures.mjs",
    profiles: [
      ["srt-to-vtt", "subtitles-64m.srt"],
      ["vtt-to-srt", "subtitles-64m.vtt"],
      ["srt-to-ass", "subtitles-64m.srt"],
      ["vtt-to-ass", "subtitles-64m.vtt"],
      ["ass-to-srt", "subtitles-64m.ass"],
      ["ass-to-vtt", "subtitles-64m.ass"],
      ["srt-to-ttml", "subtitles-64m.srt"],
      ["vtt-to-ttml", "subtitles-64m.vtt"],
      ["ttml-to-srt", "subtitles-64m.ttml"],
      ["ttml-to-vtt", "subtitles-64m.ttml"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/subtitles/${name}`,
    ]),
  },
  documents: {
    generator: "scripts/generate-document-stress-fixtures.mjs",
    profiles: [
      ["txt-to-html", "document-64m.txt"],
      ["md-to-html", "document-64m.md"],
      ["html-to-txt", "document-64m.html"],
      ["docx-to-txt", "document-128m.docx"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/documents/${name}`,
    ]),
  },
  ebooks: {
    generator: "scripts/generate-ebook-stress-fixtures.mjs",
    profiles: [["epub-to-txt", "ebook-128m.epub"]].map(
      ([profileId, name]) => [
        profileId,
        `fixtures/stress/ebooks/${name}`,
      ],
    ),
  },
  spreadsheets: {
    generator: "scripts/generate-spreadsheet-stress-fixtures.mjs",
    profiles: [["xlsx-to-csv", "spreadsheet-128m.xlsx"]].map(
      ([profileId, name]) => [
        profileId,
        `fixtures/stress/spreadsheets/${name}`,
      ],
    ),
  },
  presentations: {
    generator: "scripts/generate-presentation-stress-fixtures.mjs",
    profiles: [["pptx-to-txt", "presentation-128m.pptx"]].map(
      ([profileId, name]) => [
        profileId,
        `fixtures/stress/presentations/${name}`,
      ],
    ),
  },
  odt: {
    generator: "scripts/generate-open-document-stress-fixture.mjs",
    generatorArguments: ["odt"],
    profiles: [["odt-to-txt", "document-128m.odt"]].map(
      ([profileId, name]) => [
        profileId,
        `fixtures/stress/open-documents/${name}`,
      ],
    ),
  },
  ods: {
    generator: "scripts/generate-open-document-stress-fixture.mjs",
    generatorArguments: ["ods"],
    profiles: [["ods-to-csv", "spreadsheet-128m.ods"]].map(
      ([profileId, name]) => [
        profileId,
        `fixtures/stress/open-documents/${name}`,
      ],
    ),
  },
  odp: {
    generator: "scripts/generate-open-document-stress-fixture.mjs",
    generatorArguments: ["odp"],
    profiles: [["odp-to-txt", "presentation-128m.odp"]].map(
      ([profileId, name]) => [
        profileId,
        `fixtures/stress/open-documents/${name}`,
      ],
    ),
  },
  archives: {
    generator: "scripts/generate-archive-fixtures.mjs",
    generatorArguments: ["--include-stress"],
    profiles: [
      ["tar-to-tar-gz", "archive-256m.tar"],
      ["tar-gz-to-tar", "archive-256m.tar.gz"],
      ["zip-to-tar", "archive-256m.zip"],
      ["tar-to-zip", "archive-256m.tar"],
      ["zip-to-tar-gz", "archive-256m.zip"],
      ["tar-gz-to-zip", "archive-256m.tar.gz"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/stress/archives/${name}`,
    ]),
  },
  bzip2: {
    generator: "scripts/generate-bzip2-stress-fixtures.mjs",
    profiles: [
      ["bzip2-compress", "fixtures/stress/deterministic-256m.bin"],
      ["bzip2-decompress", "fixtures/stress/deterministic-256m.bin.bz2"],
      ["tar-to-tar-bz2", "fixtures/stress/archives/archive-256m.tar"],
      [
        "tar-bz2-to-tar",
        "fixtures/stress/archives/archive-256m.tar.bz2",
      ],
      [
        "tar-bz2-to-zip",
        "fixtures/stress/archives/archive-256m.tar.bz2",
      ],
      [
        "zip-to-tar-bz2",
        "fixtures/stress/archives/archive-256m.zip",
      ],
    ],
  },
  "subtitle-ass-output": {
    generator: "scripts/generate-subtitle-stress-fixtures.mjs",
    profiles: [
      ["srt-to-ass", "fixtures/stress/subtitles/subtitles-64m.srt"],
      ["vtt-to-ass", "fixtures/stress/subtitles/subtitles-64m.vtt"],
    ],
  },
  xz: {
    generator: "scripts/generate-xz-stress-fixtures.mjs",
    profiles: [
      ["xz-compress", "fixtures/stress/deterministic-256m.bin"],
      ["xz-decompress", "fixtures/stress/deterministic-256m.bin.xz"],
      ["tar-to-tar-xz", "fixtures/stress/archives/archive-256m.tar"],
      ["tar-xz-to-tar", "fixtures/stress/archives/archive-256m.tar.xz"],
      ["tar-xz-to-zip", "fixtures/stress/archives/archive-256m.tar.xz"],
      ["zip-to-tar-xz", "fixtures/stress/archives/archive-256m.zip"],
    ],
  },
  "archive-transcode": {
    generator: "scripts/generate-sevenzip-stress-fixture.mjs",
    profiles: [
      ["tar-gz-to-tar-bz2", "fixtures/stress/archives/archive-256m.tar.gz"],
      ["tar-gz-to-tar-xz", "fixtures/stress/archives/archive-256m.tar.gz"],
      ["tar-bz2-to-tar-gz", "fixtures/stress/archives/archive-256m.tar.bz2"],
      ["tar-bz2-to-tar-xz", "fixtures/stress/archives/archive-256m.tar.bz2"],
      ["tar-xz-to-tar-gz", "fixtures/stress/archives/archive-256m.tar.xz"],
      ["tar-xz-to-tar-bz2", "fixtures/stress/archives/archive-256m.tar.xz"],
    ],
  },
  "compression-transcode": {
    generator: "scripts/generate-compression-transcode-stress-fixtures.mjs",
    profiles: [
      ["gzip-to-bzip2", "fixtures/stress/deterministic-256m.bin.gz"],
      ["gzip-to-xz", "fixtures/stress/deterministic-256m.bin.gz"],
      ["bzip2-to-gzip", "fixtures/stress/deterministic-256m.bin.bz2"],
      ["bzip2-to-xz", "fixtures/stress/deterministic-256m.bin.bz2"],
      ["xz-to-gzip", "fixtures/stress/deterministic-256m.bin.xz"],
      ["xz-to-bzip2", "fixtures/stress/deterministic-256m.bin.xz"],
    ],
  },
  gzip: {
    generator: "scripts/generate-compression-transcode-stress-fixtures.mjs",
    generatorArguments: ["gzip"],
    profiles: [
      ["gzip-compress", "fixtures/stress/deterministic-256m.bin"],
      ["gzip-decompress", "fixtures/stress/deterministic-256m.bin.gz"],
    ],
  },
  sevenzip: {
    generator: "scripts/generate-sevenzip-stress-fixture.mjs",
    profiles: [
      ["tar-to-sevenzip", "fixtures/stress/archives/archive-256m.tar"],
      ["tar-gz-to-sevenzip", "fixtures/stress/archives/archive-256m.tar.gz"],
      ["tar-bz2-to-sevenzip", "fixtures/stress/archives/archive-256m.tar.bz2"],
      ["tar-xz-to-sevenzip", "fixtures/stress/archives/archive-256m.tar.xz"],
      ["zip-to-sevenzip", "fixtures/stress/archives/archive-256m.zip"],
      ["sevenzip-to-tar", "fixtures/stress/archives/archive-256m.7z"],
      ["sevenzip-to-tar-gz", "fixtures/stress/archives/archive-256m.7z"],
      ["sevenzip-to-tar-bz2", "fixtures/stress/archives/archive-256m.7z"],
      ["sevenzip-to-tar-xz", "fixtures/stress/archives/archive-256m.7z"],
      ["sevenzip-to-zip", "fixtures/stress/archives/archive-256m.7z"],
    ],
  },
  images: {
    generator: "scripts/generate-image-fixtures.mjs",
    profiles: [
      ["png-to-jpeg", "highres-pattern.png"],
      ["png-to-webp", "highres-pattern.png"],
      ["png-to-bmp", "highres-pattern.png"],
      ["jpeg-to-png", "highres-pattern.jpg"],
      ["jpeg-to-webp", "highres-pattern.jpg"],
      ["jpeg-to-bmp", "highres-pattern.jpg"],
      ["webp-to-png", "highres-pattern.webp"],
      ["webp-to-jpeg", "highres-pattern.webp"],
      ["webp-to-bmp", "highres-pattern.webp"],
      ["avif-to-png", "highres-pattern.avif"],
      ["avif-to-jpeg", "highres-pattern.avif"],
      ["avif-to-webp", "highres-pattern.avif"],
      ["avif-to-bmp", "highres-pattern.avif"],
      ["bmp-to-png", "highres-pattern.bmp"],
      ["bmp-to-jpeg", "highres-pattern.bmp"],
      ["bmp-to-webp", "highres-pattern.bmp"],
      ["gif-to-png", "animated-pattern.gif"],
      ["gif-to-jpeg", "animated-pattern.gif"],
      ["gif-to-webp", "animated-pattern.gif"],
      ["gif-to-bmp", "animated-pattern.gif"],
      ["png-to-ico", "highres-pattern.png"],
      ["jpeg-to-ico", "highres-pattern.jpg"],
      ["webp-to-ico", "highres-pattern.webp"],
      ["gif-to-ico", "animated-pattern.gif"],
      ["avif-to-ico", "highres-pattern.avif"],
      ["bmp-to-ico", "highres-pattern.bmp"],
    ].map(([profileId, name]) => [
      profileId,
      `fixtures/images/${name}`,
    ]),
  },
  tiff: {
    generator: "scripts/generate-tiff-stress-fixture.mjs",
    profiles: [
      ["tiff-to-png", "fixtures/stress/images/tiff-rgb-tiled-48m.tiff"],
    ],
  },
  "tiff-transposed": {
    generator: "scripts/generate-tiff-stress-fixture.mjs",
    generatorArguments: ["6"],
    profiles: [
      ["tiff-to-png", "fixtures/stress/images/tiff-rgb-tiled-48m-orientation6.tiff"],
    ],
  },
  svg: {
    generator: "scripts/generate-svg-stress-fixture.mjs",
    profiles: [
      ["svg-to-png", "fixtures/stress/images/svg-grid-8m.svg"],
    ],
  },
  "svg-effects": {
    generator: "scripts/generate-svg-effects-fixtures.mjs",
    generatorArguments: ["stress"],
    profiles: [
      ["svg-to-png", "fixtures/stress/images/svg-effects-6m.svg"],
    ],
  },
};

if (!Object.hasOwn(categories, category)) {
  throw new Error(
    `Choose one category: ${Object.keys(categories).join(", ")}.`,
  );
}
if (!/^[1-9]\d*$/.test(runCount) || Number(runCount) > 10) {
  throw new Error(`WITHIN_RUN_COUNT must be an integer from 1 through 10.`);
}
try {
  await access(activeProfileMarker);
  throw new Error(
    "Another memory profile appears active. Wait for it to finish or clean its stale project-local profile before starting a category.",
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const selected = categories[category];
let profiles = selected.profiles;
let startIndex = 0;
if (resumeProfile) {
  startIndex = profiles.findIndex(
    ([profileId]) => profileId === resumeProfile,
  );
  if (startIndex < 0) {
    throw new Error(
      `WITHIN_PROFILE_START=${resumeProfile} is not part of category ${category}.`,
    );
  }
}
let endIndex = profiles.length - 1;
if (endProfile) {
  endIndex = profiles.findIndex(([profileId]) => profileId === endProfile);
  if (endIndex < 0) {
    throw new Error(
      `WITHIN_PROFILE_END=${endProfile} is not part of category ${category}.`,
    );
  }
}
if (endIndex < startIndex) {
  throw new Error(
    `WITHIN_PROFILE_END=${endProfile} precedes WITHIN_PROFILE_START=${resumeProfile}.`,
  );
}
profiles = profiles.slice(startIndex, endIndex + 1);
let completed = false;
let activeChild = null;
let terminationSignal = null;
const handleTermination = (signal) => {
  if (terminationSignal) return;
  terminationSignal = signal;
  process.stderr.write(
    `Received ${signal}; stopping the active profile before project-local cleanup.\n`,
  );
  if (process.platform !== "win32" || signal === "SIGTERM") {
    activeChild?.kill(signal);
  }
};
const onSigint = () => handleTermination("SIGINT");
const onSigterm = () => handleTermination("SIGTERM");
process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);
try {
  process.stdout.write(
    "Building the current source before profiling the production bundle.\n",
  );
  await runNode("node_modules/vinext/dist/cli.js", ["build"]);
  if (reuseFixtures) {
    for (const [, relativeFixture] of profiles) {
      await access(path.resolve(projectRoot, relativeFixture));
      await access(path.resolve(projectRoot, `${relativeFixture}.json`));
    }
    process.stdout.write(
      "Reusing verified project-local fixtures; generation was skipped.\n",
    );
  } else {
    const generatorArguments = selected.passSelectedFixturesToGenerator
      ? [...new Set(profiles.map(([, relativeFixture]) => path.basename(relativeFixture)))]
      : selected.generatorArguments ?? [];
    await runNode(selected.generator, generatorArguments);
  }
  for (const [profileId, relativeFixture] of profiles) {
    const relativeManifest = `${relativeFixture}.json`;
    process.stdout.write(
      `\nProfiling ${profileId} with ${relativeFixture} (${runCount} run${runCount === "1" ? "" : "s"})\n`,
    );
    await runNode(
      "scripts/memory-profile.mjs",
      [relativeFixture, profileId, relativeManifest],
      { WITHIN_RUN_COUNT: runCount },
    );
  }
  completed = true;
} finally {
  await runNode("scripts/cleanup-generated.mjs", []);
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);
}

if (terminationSignal) {
  throw new Error(`Category ${category} was interrupted by ${terminationSignal}.`);
}
if (completed) {
  process.stdout.write(
    `Category ${category}${resumeProfile ? ` from ${resumeProfile}` : ""}${endProfile ? ` through ${endProfile}` : ""} passed; large generated fixtures and converted copies were removed.\n`,
  );
}

function runNode(script, arguments_, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...arguments_], {
      cwd: projectRoot,
      env: { ...process.env, ...extraEnvironment },
      stdio: "inherit",
      windowsHide: true,
    });
    activeChild = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (activeChild === child) activeChild = null;
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${script} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`,
          ),
        );
      }
    });
  });
}
