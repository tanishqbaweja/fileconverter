import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const testPort = process.env.WITHIN_TEST_PORT ?? "3000";
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const profileRoot = path.join(projectRoot, "work", "playwright-profile-media");
const outputRoot = path.join(projectRoot, "outputs", "browser-media-smoke");
const mp4OutputPath = path.join(outputRoot, "remux-output.mp4");
const movMp4OutputPath = path.join(outputRoot, "mov-remux-output.mp4");
const threeGpMp4OutputPath = path.join(outputRoot, "3gp-remux-output.mp4");
const mpegTsMp4OutputPath = path.join(outputRoot, "mpeg-ts-remux-output.mp4");
const flvMp4OutputPath = path.join(outputRoot, "flv-remux-output.mp4");
const aviMp4OutputPath = path.join(outputRoot, "avi-remux-output.mp4");
const h264Mp4OutputPath = path.join(outputRoot, "h264-remux-output.mp4");
const directMp4OutputPath = path.join(outputRoot, "direct-remux-output.mp4");
const directWavOutputPath = path.join(outputRoot, "direct-audio-output.wav");
const directM4aOutputPath = path.join(outputRoot, "direct-audio-output.m4a");
const directFlacOutputPath = path.join(outputRoot, "direct-audio-output.flac");
const directAiffOutputPath = path.join(outputRoot, "direct-audio-output.aiff");
const directAmrOutputPath = path.join(outputRoot, "direct-audio-output.amr");
const directMp3OutputPath = path.join(outputRoot, "direct-audio-output.mp3");
const aacM4aOutputPath = path.join(outputRoot, "aac-remux-output.m4a");
const aacWavOutputPath = path.join(outputRoot, "aac-convert-output.wav");
const aacFlacOutputPath = path.join(outputRoot, "aac-convert-output.flac");
const m4aOutputPath = path.join(outputRoot, "extract-output.m4a");
const mp4M4aOutputPath = path.join(outputRoot, "mp4-extract-output.m4a");
const movM4aOutputPath = path.join(outputRoot, "mov-extract-output.m4a");
const threeGpM4aOutputPath = path.join(outputRoot, "3gp-extract-output.m4a");
const mpegTsM4aOutputPath = path.join(outputRoot, "mpeg-ts-extract-output.m4a");
const flvM4aOutputPath = path.join(outputRoot, "flv-extract-output.m4a");
const wavOutputPath = path.join(outputRoot, "convert-output.wav");
const mp4WavOutputPath = path.join(outputRoot, "mp4-convert-output.wav");
const movWavOutputPath = path.join(outputRoot, "mov-convert-output.wav");
const threeGpWavOutputPath = path.join(outputRoot, "3gp-convert-output.wav");
const mpegTsWavOutputPath = path.join(outputRoot, "mpeg-ts-convert-output.wav");
const flvWavOutputPath = path.join(outputRoot, "flv-convert-output.wav");
const aviWavOutputPath = path.join(outputRoot, "avi-convert-output.wav");
const standaloneWavOutputPath = path.join(
  outputRoot,
  "standalone-convert-output.wav",
);
const mp3WavOutputPath = path.join(outputRoot, "mp3-convert-output.wav");
const flacWavOutputPath = path.join(outputRoot, "flac-convert-output.wav");
const m4aFlacOutputPath = path.join(outputRoot, "m4a-convert-output.flac");
const mkvFlacOutputPath = path.join(outputRoot, "mkv-extract-output.flac");
const mp4FlacOutputPath = path.join(outputRoot, "mp4-extract-output.flac");
const movFlacOutputPath = path.join(outputRoot, "mov-extract-output.flac");
const threeGpFlacOutputPath = path.join(outputRoot, "3gp-extract-output.flac");
const mpegTsFlacOutputPath = path.join(outputRoot, "mpeg-ts-extract-output.flac");
const flvFlacOutputPath = path.join(outputRoot, "flv-extract-output.flac");
const aviFlacOutputPath = path.join(outputRoot, "avi-extract-output.flac");
const ogvFlacOutputPath = path.join(outputRoot, "ogv-extract-output.flac");
const mp3FlacOutputPath = path.join(outputRoot, "mp3-convert-output.flac");
const wavFlacOutputPath = path.join(outputRoot, "wav-convert-output.flac");
const alacWavOutputPath = path.join(outputRoot, "alac-decode-output.wav");
const alacFlacOutputPath = path.join(outputRoot, "alac-decode-output.flac");
const wavAlacOutputPath = path.join(outputRoot, "wav-encode-output.m4a");
const flacAlacOutputPath = path.join(outputRoot, "flac-encode-output.m4a");
const wmaWavOutputPath = path.join(outputRoot, "wma-decode-output.wav");
const wmaFlacOutputPath = path.join(outputRoot, "wma-decode-output.flac");
const wavWmaOutputPath = path.join(outputRoot, "wav-encode-output.wma");
const flacWmaOutputPath = path.join(outputRoot, "flac-encode-output.wma");
const amrWavOutputPath = path.join(outputRoot, "amr-decode-output.wav");
const amrFlacOutputPath = path.join(outputRoot, "amr-decode-output.flac");
const amrWbWavOutputPath = path.join(outputRoot, "amr-wb-decode-output.wav");
const amrWbFlacOutputPath = path.join(outputRoot, "amr-wb-decode-output.flac");
const aiffWavOutputPath = path.join(outputRoot, "aiff-convert-output.wav");
const oggWavOutputPath = path.join(outputRoot, "ogg-convert-output.wav");
const opusWavOutputPath = path.join(outputRoot, "opus-convert-output.wav");
const aiffFlacOutputPath = path.join(outputRoot, "aiff-convert-output.flac");
const oggFlacOutputPath = path.join(outputRoot, "ogg-convert-output.flac");
const opusFlacOutputPath = path.join(outputRoot, "opus-convert-output.flac");
const aiffOutputPaths = {
  m4a: path.join(outputRoot, "m4a-convert-output.aiff"),
  aac: path.join(outputRoot, "aac-convert-output.aiff"),
  amr: path.join(outputRoot, "amr-convert-output.aiff"),
  mp3: path.join(outputRoot, "mp3-convert-output.aiff"),
  flac: path.join(outputRoot, "flac-convert-output.aiff"),
  wav: path.join(outputRoot, "wav-convert-output.aiff"),
  wma: path.join(outputRoot, "wma-convert-output.aiff"),
  ogg: path.join(outputRoot, "ogg-convert-output.aiff"),
  opus: path.join(outputRoot, "opus-convert-output.aiff"),
} as const;
const containerAiffOutputPaths = {
  mkv: path.join(outputRoot, "mkv-convert-output.aiff"),
  mp4: path.join(outputRoot, "mp4-convert-output.aiff"),
  mov: path.join(outputRoot, "mov-convert-output.aiff"),
  "3gp": path.join(outputRoot, "3gp-convert-output.aiff"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-convert-output.aiff"),
  flv: path.join(outputRoot, "flv-convert-output.aiff"),
  avi: path.join(outputRoot, "avi-convert-output.aiff"),
  ogv: path.join(outputRoot, "ogv-convert-output.aiff"),
  webm: path.join(outputRoot, "webm-convert-output.aiff"),
} as const;
const webmAudioOutputPaths = {
  wav: path.join(outputRoot, "webm-convert-output.wav"),
  flac: path.join(outputRoot, "webm-convert-output.flac"),
  amr: path.join(outputRoot, "webm-convert-output.amr"),
  mp3: path.join(outputRoot, "webm-convert-output.mp3"),
  aac: path.join(outputRoot, "webm-convert-output.aac"),
} as const;
const amrOutputPaths = {
  m4a: path.join(outputRoot, "m4a-convert-output.amr"),
  aac: path.join(outputRoot, "aac-convert-output.amr"),
  mp3: path.join(outputRoot, "mp3-convert-output.amr"),
  flac: path.join(outputRoot, "flac-convert-output.amr"),
  wav: path.join(outputRoot, "wav-convert-output.amr"),
  wma: path.join(outputRoot, "wma-convert-output.amr"),
  aiff: path.join(outputRoot, "aiff-convert-output.amr"),
  ogg: path.join(outputRoot, "ogg-convert-output.amr"),
  opus: path.join(outputRoot, "opus-convert-output.amr"),
} as const;
const containerAmrOutputPaths = {
  mkv: path.join(outputRoot, "mkv-convert-output.amr"),
  mp4: path.join(outputRoot, "mp4-convert-output.amr"),
  mov: path.join(outputRoot, "mov-convert-output.amr"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-convert-output.amr"),
  flv: path.join(outputRoot, "flv-convert-output.amr"),
  avi: path.join(outputRoot, "avi-convert-output.amr"),
  ogv: path.join(outputRoot, "ogv-convert-output.amr"),
} as const;
const mp3TranscodeOutputPaths = {
  m4a: path.join(outputRoot, "m4a-convert-output.mp3"),
  aac: path.join(outputRoot, "aac-convert-output.mp3"),
  amr: path.join(outputRoot, "amr-convert-output.mp3"),
  flac: path.join(outputRoot, "flac-convert-output.mp3"),
  wav: path.join(outputRoot, "wav-convert-output.mp3"),
  wma: path.join(outputRoot, "wma-convert-output.mp3"),
  aiff: path.join(outputRoot, "aiff-convert-output.mp3"),
  ogg: path.join(outputRoot, "ogg-convert-output.mp3"),
  opus: path.join(outputRoot, "opus-convert-output.mp3"),
} as const;
const aacTranscodeOutputPaths = {
  m4a: path.join(outputRoot, "m4a-convert-output.aac"),
  amr: path.join(outputRoot, "amr-convert-output.aac"),
  mp3: path.join(outputRoot, "mp3-convert-output.aac"),
  flac: path.join(outputRoot, "flac-convert-output.aac"),
  wav: path.join(outputRoot, "wav-convert-output.aac"),
  wma: path.join(outputRoot, "wma-convert-output.aac"),
  aiff: path.join(outputRoot, "aiff-convert-output.aac"),
  ogg: path.join(outputRoot, "ogg-convert-output.aac"),
  opus: path.join(outputRoot, "opus-convert-output.aac"),
} as const;
const legacyContainerAacOutputPaths = {
  avi: path.join(outputRoot, "avi-convert-output.aac"),
  ogv: path.join(outputRoot, "ogv-convert-output.aac"),
} as const;
const containerLossyAudioOutputPaths = {
  "mp4-to-opus": path.join(outputRoot, "mp4-convert-output.opus"),
  "mov-to-opus": path.join(outputRoot, "mov-convert-output.opus"),
  "mpeg-ts-to-opus": path.join(outputRoot, "mpeg-ts-convert-output.opus"),
  "flv-to-opus": path.join(outputRoot, "flv-convert-output.opus"),
  "avi-to-opus": path.join(outputRoot, "avi-convert-output.opus"),
  "ogv-to-opus": path.join(outputRoot, "ogv-convert-output.opus"),
  "mp4-to-ogg": path.join(outputRoot, "mp4-convert-output.ogg"),
  "mov-to-ogg": path.join(outputRoot, "mov-convert-output.ogg"),
  "mpeg-ts-to-ogg": path.join(outputRoot, "mpeg-ts-convert-output.ogg"),
  "flv-to-ogg": path.join(outputRoot, "flv-convert-output.ogg"),
  "avi-to-ogg": path.join(outputRoot, "avi-convert-output.ogg"),
  "ogv-to-mp3": path.join(outputRoot, "ogv-convert-output.mp3"),
} as const;
const containerM4aOutputPaths = {
  avi: path.join(outputRoot, "avi-convert-output.m4a"),
  ogv: path.join(outputRoot, "ogv-convert-output.m4a"),
  webm: path.join(outputRoot, "webm-convert-output.m4a"),
} as const;
const threeGpAmrExtractionOutputPath = path.join(
  outputRoot,
  "3gp-extract-output.amr",
);
const opusTranscodeOutputPaths = {
  m4a: path.join(outputRoot, "m4a-convert-output.opus"),
  aac: path.join(outputRoot, "aac-convert-output.opus"),
  amr: path.join(outputRoot, "amr-convert-output.opus"),
  mp3: path.join(outputRoot, "mp3-convert-output.opus"),
  flac: path.join(outputRoot, "flac-convert-output.opus"),
  wav: path.join(outputRoot, "wav-convert-output.opus"),
  wma: path.join(outputRoot, "wma-convert-output.opus"),
  aiff: path.join(outputRoot, "aiff-convert-output.opus"),
  ogg: path.join(outputRoot, "ogg-convert-output.opus"),
} as const;
const vorbisTranscodeOutputPaths = {
  m4a: path.join(outputRoot, "m4a-convert-output.ogg"),
  aac: path.join(outputRoot, "aac-convert-output.ogg"),
  amr: path.join(outputRoot, "amr-convert-output.ogg"),
  mp3: path.join(outputRoot, "mp3-convert-output.ogg"),
  flac: path.join(outputRoot, "flac-convert-output.ogg"),
  wav: path.join(outputRoot, "wav-convert-output.ogg"),
  wma: path.join(outputRoot, "wma-convert-output.ogg"),
  aiff: path.join(outputRoot, "aiff-convert-output.ogg"),
  opus: path.join(outputRoot, "opus-convert-output.ogg"),
} as const;
const wmaTranscodeOutputPaths = {
  m4a: path.join(outputRoot, "m4a-convert-output.wma"),
  aac: path.join(outputRoot, "aac-convert-output.wma"),
  mp3: path.join(outputRoot, "mp3-convert-output.wma"),
  aiff: path.join(outputRoot, "aiff-convert-output.wma"),
  ogg: path.join(outputRoot, "ogg-convert-output.wma"),
  opus: path.join(outputRoot, "opus-convert-output.wma"),
} as const;
const containerWmaOutputPaths = {
  mkv: path.join(outputRoot, "mkv-convert-output.wma"),
  mp4: path.join(outputRoot, "mp4-convert-output.wma"),
  mov: path.join(outputRoot, "mov-convert-output.wma"),
  "3gp": path.join(outputRoot, "3gp-convert-output.wma"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-convert-output.wma"),
  flv: path.join(outputRoot, "flv-convert-output.wma"),
  avi: path.join(outputRoot, "avi-convert-output.wma"),
  ogv: path.join(outputRoot, "ogv-convert-output.wma"),
  webm: path.join(outputRoot, "webm-convert-output.wma"),
} as const;
const threeGpAmrOutputPaths = {
  wav: path.join(outputRoot, "3gp-amr-convert-output.wav"),
  flac: path.join(outputRoot, "3gp-amr-convert-output.flac"),
  aiff: path.join(outputRoot, "3gp-amr-convert-output.aiff"),
  mp3: path.join(outputRoot, "3gp-amr-convert-output.mp3"),
  opus: path.join(outputRoot, "3gp-amr-convert-output.opus"),
  ogg: path.join(outputRoot, "3gp-amr-convert-output.ogg"),
} as const;
const mpeg4OutputPath = path.join(outputRoot, "reencode-output.mp4");
const webmOutputPath = path.join(outputRoot, "reencode-output.webm");
const ogvWebmOutputPath = path.join(outputRoot, "ogv-reencode-output.webm");
const vp9WebmOutputPath = path.join(outputRoot, "vp9-reencode-output.webm");
const av1WebmCopyOutputPath = path.join(outputRoot, "av1-copy-output.webm");
const mp3ExtractionOutputPaths = {
  mkv: path.join(outputRoot, "mkv-extract-output.mp3"),
  mp4: path.join(outputRoot, "mp4-extract-output.mp3"),
  mov: path.join(outputRoot, "mov-extract-output.mp3"),
  avi: path.join(outputRoot, "avi-extract-output.mp3"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-extract-output.mp3"),
  flv: path.join(outputRoot, "flv-extract-output.mp3"),
} as const;
const aacExtractionOutputPaths = {
  mkv: path.join(outputRoot, "mkv-extract-output.aac"),
  mp4: path.join(outputRoot, "mp4-extract-output.aac"),
  mov: path.join(outputRoot, "mov-extract-output.aac"),
  "3gp": path.join(outputRoot, "3gp-extract-output.aac"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-extract-output.aac"),
  flv: path.join(outputRoot, "flv-extract-output.aac"),
} as const;
const oggAudioExtractionOutputPaths = {
  "mkv-to-ogg": path.join(outputRoot, "mkv-extract-output.ogg"),
  "webm-to-ogg": path.join(outputRoot, "webm-extract-output.ogg"),
  "ogv-to-ogg": path.join(outputRoot, "ogv-extract-output.ogg"),
  "mkv-to-opus": path.join(outputRoot, "mkv-extract-output.opus"),
  "webm-to-opus": path.join(outputRoot, "webm-extract-output.opus"),
} as const;
const mp4WebmOutputPath = path.join(outputRoot, "mp4-vp8-output.webm");
const mp4Vp9WebmOutputPath = path.join(outputRoot, "mp4-vp9-output.webm");
const movWebmOutputPath = path.join(outputRoot, "mov-vp8-output.webm");
const movVp9WebmOutputPath = path.join(outputRoot, "mov-vp9-output.webm");
const threeGpWebmOutputPath = path.join(outputRoot, "3gp-vp8-output.webm");
const threeGpVp9WebmOutputPath = path.join(outputRoot, "3gp-vp9-output.webm");
const mpegTsWebmOutputPath = path.join(outputRoot, "mpeg-ts-vp8-output.webm");
const mpegTsVp9WebmOutputPath = path.join(outputRoot, "mpeg-ts-vp9-output.webm");
const flvWebmOutputPath = path.join(outputRoot, "flv-vp8-output.webm");
const flvVp9WebmOutputPath = path.join(outputRoot, "flv-vp9-output.webm");
const aviWebmOutputPath = path.join(outputRoot, "avi-vp8-output.webm");
const aviVp9WebmOutputPath = path.join(outputRoot, "avi-vp9-output.webm");
const ogvVp9WebmOutputPath = path.join(outputRoot, "ogv-vp9-reencode-output.webm");
const ogvWavOutputPath = path.join(outputRoot, "ogv-convert-output.wav");
const m2vMpeg4OutputPath = path.join(outputRoot, "m2v-reencode-output.mp4");
const m2vWebmOutputPath = path.join(outputRoot, "m2v-reencode-output.webm");
const m2vVp9WebmOutputPath = path.join(outputRoot, "m2v-vp9-reencode-output.webm");
const m2vMpegTsOutputPath = path.join(outputRoot, "m2v-wrap-output.mpegts");
const m2vExtractionOutputPaths = {
  mkv: path.join(outputRoot, "mkv-extract-output.m2v"),
  mp4: path.join(outputRoot, "mp4-extract-output.m2v"),
  mov: path.join(outputRoot, "mov-extract-output.m2v"),
  avi: path.join(outputRoot, "avi-extract-output.m2v"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-extract-output.m2v"),
} as const;
const m4vMp4OutputPath = path.join(outputRoot, "m4v-wrap-output.mp4");
const m4vExtractionOutputPaths = {
  mkv: path.join(outputRoot, "mkv-extract-output.m4v"),
  mp4: path.join(outputRoot, "mp4-extract-output.m4v"),
  mov: path.join(outputRoot, "mov-extract-output.m4v"),
  avi: path.join(outputRoot, "avi-extract-output.m4v"),
} as const;
const h264WebmOutputPath = path.join(outputRoot, "h264-vp8-output.webm");
const h264Vp9WebmOutputPath = path.join(outputRoot, "h264-vp9-output.webm");
const h264ExtractionOutputPaths = {
  mkv: path.join(outputRoot, "mkv-extract-output.h264"),
  mp4: path.join(outputRoot, "mp4-extract-output.h264"),
  mov: path.join(outputRoot, "mov-extract-output.h264"),
  "3gp": path.join(outputRoot, "3gp-extract-output.h264"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-extract-output.h264"),
  flv: path.join(outputRoot, "flv-extract-output.h264"),
} as const;
const hevcExtractionOutputPaths = {
  mkv: path.join(outputRoot, "mkv-extract-output.hevc"),
  mp4: path.join(outputRoot, "mp4-extract-output.hevc"),
  mov: path.join(outputRoot, "mov-extract-output.hevc"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-extract-output.hevc"),
} as const;
const matroskaOutputPaths = {
  mp4: path.join(outputRoot, "mp4-remux-output.mkv"),
  mov: path.join(outputRoot, "mov-remux-output.mkv"),
  "3gp": path.join(outputRoot, "3gp-remux-output.mkv"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-remux-output.mkv"),
  flv: path.join(outputRoot, "flv-remux-output.mkv"),
  avi: path.join(outputRoot, "avi-remux-output.mkv"),
  webm: path.join(outputRoot, "webm-remux-output.mkv"),
  ogv: path.join(outputRoot, "ogv-remux-output.mkv"),
} as const;
const containerMpegTsOutputPaths = {
  mkv: path.join(outputRoot, "mkv-remux-output.mpegts"),
  mp4: path.join(outputRoot, "mp4-remux-output.mpegts"),
  mov: path.join(outputRoot, "mov-remux-output.mpegts"),
  "3gp": path.join(outputRoot, "3gp-remux-output.mpegts"),
  flv: path.join(outputRoot, "flv-remux-output.mpegts"),
} as const;
const containerThreeGpOutputPaths = {
  mkv: path.join(outputRoot, "mkv-remux-output.3gp"),
  mp4: path.join(outputRoot, "mp4-remux-output.3gp"),
  mov: path.join(outputRoot, "mov-remux-output.3gp"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-remux-output.3gp"),
  flv: path.join(outputRoot, "flv-remux-output.3gp"),
} as const;
const containerMovOutputPaths = {
  mkv: path.join(outputRoot, "mkv-remux-output.mov"),
  mp4: path.join(outputRoot, "mp4-remux-output.mov"),
  "3gp": path.join(outputRoot, "3gp-remux-output.mov"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-remux-output.mov"),
  flv: path.join(outputRoot, "flv-remux-output.mov"),
} as const;
const containerFlvOutputPaths = {
  mkv: path.join(outputRoot, "mkv-remux-output.flv"),
  mp4: path.join(outputRoot, "mp4-remux-output.flv"),
  mov: path.join(outputRoot, "mov-remux-output.flv"),
  "3gp": path.join(outputRoot, "3gp-remux-output.flv"),
  "mpeg-ts": path.join(outputRoot, "mpeg-ts-remux-output.flv"),
} as const;
const complexMp4OutputPath = path.join(outputRoot, "complex-remux-output.mp4");
const complexMatroskaOutputPath = path.join(
  outputRoot,
  "complex-remux-output.mkv",
);
const fixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "remux-source.mkv",
);
const complexFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "complex-remux-source.mkv",
);
const complexMatroskaAsWebmFixturePath = path.join(
  projectRoot,
  "work",
  "complex-remux-source.webm",
);
const corruptFixturePath = path.join(
  projectRoot,
  "work",
  "corrupt-source.mkv",
);
const incompatibleFixturePath = path.join(
  projectRoot,
  "work",
  "incompatible-audio-source.mkv",
);
const multiVideoFixturePath = path.join(
  projectRoot,
  "work",
  "multi-video-source.mkv",
);
const unsupportedMatroskaFixturePath = path.join(
  projectRoot,
  "work",
  "unsupported-matroska-source.avi",
);
const mp4InputFixturePath = path.join(
  projectRoot,
  "work",
  "remux-source.mp4",
);
const movInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "quicktime-source.mov",
);
const threeGpInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "mobile-video-source.3gp",
);
const mpegTsInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "transport-source.mpegts",
);
const flvInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "flash-video-source.flv",
);
const aviInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "legacy-video-source.avi",
);
const audioFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.m4a",
);
const alacFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source-alac.m4a",
);
const wmaFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.wma",
);
const amrFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.amr",
);
const amrWbFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "amr-wb-source.awb",
);
const threeGpAmrFixturePath = path.join(
  projectRoot,
  "work",
  "audio-amr-source.3gp",
);
const aacFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.aac",
);
const mp3FixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.mp3",
);
const flacFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.flac",
);
const wavFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.wav",
);
const aiffFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.aiff",
);
const oggFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.ogg",
);
const opusFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.opus",
);
const ogvFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "theora-video-source.ogv",
);
const m2vFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "mpeg2-video-source.m2v",
);
const m4vFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "mpeg4-video-source.m4v",
);
const av1OpusFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "av1-opus-source.mkv",
);
const av1OpusWebmFixturePath = path.join(
  projectRoot,
  "work",
  "av1-opus-source.webm",
);
const av1VorbisWebmFixturePath = path.join(
  projectRoot,
  "work",
  "av1-vorbis-source.webm",
);
const mp3ContainerFixturePaths = {
  mkv: path.join(projectRoot, "fixtures", "media", "h264-mp3-source.mkv"),
  mp4: path.join(projectRoot, "work", "h264-mp3-source.mp4"),
  mov: path.join(projectRoot, "work", "h264-mp3-source.mov"),
  avi: path.join(projectRoot, "work", "h264-mp3-source.avi"),
  "mpeg-ts": path.join(projectRoot, "work", "h264-mp3-source.mpegts"),
  flv: path.join(projectRoot, "work", "h264-mp3-source.flv"),
} as const;
const aacContainerFixturePaths = {
  mkv: fixturePath,
  mp4: mp4InputFixturePath,
  mov: movInputFixturePath,
  "3gp": threeGpInputFixturePath,
  "mpeg-ts": mpegTsInputFixturePath,
  flv: flvInputFixturePath,
} as const;
const h264FixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "h264-video-source.h264",
);
const protectedHevcSourcePath = path.join(projectRoot, "test.mkv");
const hevcMovFixturePath = path.join(projectRoot, "work", "hevc-source.mov");
const hevcContainerFixturePaths = {
  mkv: path.join(projectRoot, "work", "hevc-source.mkv"),
  mp4: path.join(projectRoot, "work", "hevc-source.mp4"),
  mov: hevcMovFixturePath,
  "mpeg-ts": path.join(projectRoot, "work", "hevc-source.mpegts"),
} as const;
const mpeg2ContainerFixturePaths = {
  mkv: path.join(projectRoot, "work", "mpeg2-source.mkv"),
  mp4: path.join(projectRoot, "work", "mpeg2-source.mp4"),
  mov: path.join(projectRoot, "work", "mpeg2-source.mov"),
  avi: path.join(projectRoot, "work", "mpeg2-source.avi"),
  "mpeg-ts": path.join(projectRoot, "work", "mpeg2-source.mpegts"),
} as const;
const m4vContainerFixturePaths = {
  mkv: path.join(projectRoot, "work", "mpeg4-source.mkv"),
  mp4: path.join(projectRoot, "work", "mpeg4-source.mp4"),
  mov: path.join(projectRoot, "work", "mpeg4-source.mov"),
  avi: path.join(projectRoot, "work", "mpeg4-source.avi"),
} as const;
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath =
  process.env.WITHIN_CHROME_PATH ??
  (existsSync(installedChromePath)
    ? installedChromePath
    : chromium.executablePath());

let context: BrowserContext;
let page: Page;
let validationSink: WriteStream | null = null;

interface ProbeStream {
  codec_name?: string;
  profile?: string;
  codec_type: string;
  width?: number;
  height?: number;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
  tags?: Record<string, string>;
  disposition?: Record<string, number>;
  avg_frame_rate?: string;
  nb_read_frames?: string;
}

interface MediaProbe {
  streams: ProbeStream[];
  chapters?: Array<{ tags?: Record<string, string> }>;
  format: {
    duration?: string;
    format_name?: string;
    tags?: Record<string, string>;
  };
}

interface MediaRouteOptions {
  expectedWarningFragments?: readonly string[];
  expectedDurationSeconds?: number;
  durationToleranceSeconds?: number;
  skipDurationValidation?: boolean;
  validate?: (probe: MediaProbe, outputPath: string) => Promise<void>;
}

function assertProjectLocal(target: string): void {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing a non-project test path: ${target}`);
  }
}

async function currentState() {
  await page.waitForFunction(() => Boolean(window.__WITHIN_TEST__), null, {
    timeout: 15_000,
  });
  return page.evaluate(() => {
    if (!window.__WITHIN_TEST__) throw new Error("Test bridge is unavailable.");
    return window.__WITHIN_TEST__.getState();
  });
}

async function decodedPcmSha256(inputPath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash",
      "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout.trim().split("=")[1];
}

async function expectDecodedPcmMatch(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  expect(await decodedPcmSha256(outputPath)).toBe(
    await decodedPcmSha256(sourcePath),
  );
}

async function mp3PacketSha256(inputPath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-map", "0:a:0", "-c", "copy", "-f", "hash",
      "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout.trim().split("=")[1];
}

async function expectMp3PacketMatch(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  expect(await mp3PacketSha256(outputPath)).toBe(
    await mp3PacketSha256(sourcePath),
  );
}

async function aacAccessUnitSha256(inputPath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-map", "0:a:0", "-c", "copy", "-bsf:a", "aac_adtstoasc",
      "-f", "hash", "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout.trim().split("=")[1];
}

async function expectAacAccessUnitMatch(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  expect(await aacAccessUnitSha256(outputPath)).toBe(
    await aacAccessUnitSha256(sourcePath),
  );
}

async function expectIsoBmffAacPacketMatch(
  sourcePath: string,
  outputPath: string,
  sourceUsesAdts: boolean,
): Promise<void> {
  const sourceHash = sourceUsesAdts
    ? await aacAccessUnitSha256(sourcePath)
    : await mp3PacketSha256(sourcePath);
  expect(await mp3PacketSha256(outputPath)).toBe(sourceHash);
}

async function expectCompressedAudioPacketMatch(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  expect(await mp3PacketSha256(outputPath)).toBe(
    await mp3PacketSha256(sourcePath),
  );
}

async function expectDecodedAudioPsnr(
  sourcePath: string,
  outputPath: string,
  minimumPsnrDb: number,
): Promise<void> {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-i", sourcePath, "-i", outputPath,
      "-filter_complex",
      "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]apsnr[quality]",
      "-map", "[quality]", "-f", "null", "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const psnrValues = [
    ...stderr.matchAll(
      /PSNR ch\d+:\s+(inf|[+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi,
    ),
  ].map((match) =>
    match[1].toLowerCase() === "inf"
      ? Number.POSITIVE_INFINITY
      : Number.parseFloat(match[1]),
  );
  expect(psnrValues.length).toBeGreaterThan(0);
  for (const value of psnrValues) expect(value).toBeGreaterThanOrEqual(minimumPsnrDb);
}

async function decodedVideoSha256(inputPath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-map", "0:v:0", "-pix_fmt", "yuv420p", "-f", "hash",
      "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout.trim().split("=")[1];
}

async function expectDecodedVideoMatch(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  expect(await decodedVideoSha256(outputPath)).toBe(
    await decodedVideoSha256(sourcePath),
  );
}

test.beforeAll(async () => {
  assertProjectLocal(profileRoot);
  assertProjectLocal(mp4OutputPath);
  assertProjectLocal(movMp4OutputPath);
  assertProjectLocal(threeGpMp4OutputPath);
  assertProjectLocal(mpegTsMp4OutputPath);
  assertProjectLocal(flvMp4OutputPath);
  assertProjectLocal(aviMp4OutputPath);
  assertProjectLocal(h264Mp4OutputPath);
  assertProjectLocal(directMp4OutputPath);
  assertProjectLocal(aacM4aOutputPath);
  assertProjectLocal(aacWavOutputPath);
  assertProjectLocal(aacFlacOutputPath);
  assertProjectLocal(m4aOutputPath);
  assertProjectLocal(mp4M4aOutputPath);
  assertProjectLocal(movM4aOutputPath);
  assertProjectLocal(threeGpM4aOutputPath);
  assertProjectLocal(mpegTsM4aOutputPath);
  assertProjectLocal(flvM4aOutputPath);
  assertProjectLocal(wavOutputPath);
  assertProjectLocal(mp4WavOutputPath);
  assertProjectLocal(movWavOutputPath);
  assertProjectLocal(threeGpWavOutputPath);
  assertProjectLocal(mpegTsWavOutputPath);
  assertProjectLocal(flvWavOutputPath);
  assertProjectLocal(aviWavOutputPath);
  assertProjectLocal(standaloneWavOutputPath);
  assertProjectLocal(mp3WavOutputPath);
  assertProjectLocal(flacWavOutputPath);
  assertProjectLocal(m4aFlacOutputPath);
  assertProjectLocal(mkvFlacOutputPath);
  assertProjectLocal(mp4FlacOutputPath);
  assertProjectLocal(movFlacOutputPath);
  assertProjectLocal(threeGpFlacOutputPath);
  assertProjectLocal(mpegTsFlacOutputPath);
  assertProjectLocal(flvFlacOutputPath);
  assertProjectLocal(aviFlacOutputPath);
  assertProjectLocal(ogvFlacOutputPath);
  assertProjectLocal(mp3FlacOutputPath);
  assertProjectLocal(wavFlacOutputPath);
  assertProjectLocal(alacWavOutputPath);
  assertProjectLocal(alacFlacOutputPath);
  assertProjectLocal(wavAlacOutputPath);
  assertProjectLocal(flacAlacOutputPath);
  assertProjectLocal(wmaWavOutputPath);
  assertProjectLocal(wmaFlacOutputPath);
  assertProjectLocal(wavWmaOutputPath);
  assertProjectLocal(flacWmaOutputPath);
  assertProjectLocal(amrWavOutputPath);
  assertProjectLocal(amrFlacOutputPath);
  assertProjectLocal(aiffWavOutputPath);
  assertProjectLocal(oggWavOutputPath);
  assertProjectLocal(opusWavOutputPath);
  assertProjectLocal(aiffFlacOutputPath);
  assertProjectLocal(oggFlacOutputPath);
  assertProjectLocal(opusFlacOutputPath);
  assertProjectLocal(mpeg4OutputPath);
  assertProjectLocal(webmOutputPath);
  assertProjectLocal(ogvWebmOutputPath);
  assertProjectLocal(vp9WebmOutputPath);
  assertProjectLocal(av1WebmCopyOutputPath);
  for (const outputPath of Object.values(mp3ExtractionOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(aacExtractionOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(oggAudioExtractionOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(aiffOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(containerAiffOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(webmAudioOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(amrOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(containerAmrOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(mp3TranscodeOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(aacTranscodeOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(legacyContainerAacOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(containerLossyAudioOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(containerM4aOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  assertProjectLocal(threeGpAmrExtractionOutputPath);
  for (const outputPath of Object.values(opusTranscodeOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(vorbisTranscodeOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(wmaTranscodeOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(containerWmaOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(threeGpAmrOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  assertProjectLocal(threeGpAmrFixturePath);
  assertProjectLocal(mp4WebmOutputPath);
  assertProjectLocal(mp4Vp9WebmOutputPath);
  assertProjectLocal(movWebmOutputPath);
  assertProjectLocal(movVp9WebmOutputPath);
  assertProjectLocal(aviWebmOutputPath);
  assertProjectLocal(aviVp9WebmOutputPath);
  assertProjectLocal(ogvVp9WebmOutputPath);
  assertProjectLocal(ogvWavOutputPath);
  assertProjectLocal(m2vMpeg4OutputPath);
  assertProjectLocal(m2vWebmOutputPath);
  assertProjectLocal(m2vVp9WebmOutputPath);
  assertProjectLocal(m2vMpegTsOutputPath);
  for (const outputPath of Object.values(m2vExtractionOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  assertProjectLocal(m4vMp4OutputPath);
  for (const outputPath of Object.values(m4vExtractionOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  assertProjectLocal(h264WebmOutputPath);
  assertProjectLocal(h264Vp9WebmOutputPath);
  for (const outputPath of Object.values(h264ExtractionOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(hevcExtractionOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(matroskaOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(containerMpegTsOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(containerThreeGpOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(containerMovOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const outputPath of Object.values(containerFlvOutputPaths)) {
    assertProjectLocal(outputPath);
  }
  for (const fixture of Object.values(hevcContainerFixturePaths)) {
    assertProjectLocal(fixture);
  }
  for (const fixture of Object.values(mpeg2ContainerFixturePaths)) {
    assertProjectLocal(fixture);
  }
  for (const fixture of Object.values(m4vContainerFixturePaths)) {
    assertProjectLocal(fixture);
  }
  for (const [input, fixture] of Object.entries(mp3ContainerFixturePaths)) {
    if (input !== "mkv") assertProjectLocal(fixture);
  }
  assertProjectLocal(complexMp4OutputPath);
  assertProjectLocal(complexMatroskaOutputPath);
  assertProjectLocal(complexMatroskaAsWebmFixturePath);
  assertProjectLocal(corruptFixturePath);
  assertProjectLocal(incompatibleFixturePath);
  assertProjectLocal(multiVideoFixturePath);
  assertProjectLocal(unsupportedMatroskaFixturePath);
  assertProjectLocal(mp4InputFixturePath);
  assertProjectLocal(av1OpusWebmFixturePath);
  assertProjectLocal(av1VorbisWebmFixturePath);
  await rm(profileRoot, { recursive: true, force: true });
  await rm(corruptFixturePath, { force: true });
  await rm(incompatibleFixturePath, { force: true });
  await rm(multiVideoFixturePath, { force: true });
  await rm(unsupportedMatroskaFixturePath, { force: true });
  await rm(complexMatroskaAsWebmFixturePath, { force: true });
  await rm(mp4InputFixturePath, { force: true });
  await rm(av1OpusWebmFixturePath, { force: true });
  await rm(av1VorbisWebmFixturePath, { force: true });
  await rm(threeGpAmrFixturePath, { force: true });
  for (const fixture of Object.values(hevcContainerFixturePaths)) {
    await rm(fixture, { force: true });
  }
  for (const fixture of Object.values(mpeg2ContainerFixturePaths)) {
    await rm(fixture, { force: true });
  }
  for (const fixture of Object.values(m4vContainerFixturePaths)) {
    await rm(fixture, { force: true });
  }
  for (const [input, fixture] of Object.entries(mp3ContainerFixturePaths)) {
    if (input !== "mkv") await rm(fixture, { force: true });
  }
  await mkdir(profileRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      threeGpInputFixturePath,
      "-i",
      amrFixturePath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c",
      "copy",
      "-shortest",
      "-f",
      "3gp",
      threeGpAmrFixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await copyFile(complexFixturePath, complexMatroskaAsWebmFixturePath);
  await writeFile(
    corruptFixturePath,
    Buffer.concat([
      Buffer.from("Within deliberately corrupt Matroska fixture.\n", "utf8"),
      Buffer.alloc(4096, 0xa5),
    ]),
  );
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=24:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:sample_rate=48000:duration=2",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "libvorbis",
      "-f",
      "matroska",
      incompatibleFixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=1",
      "-map", "0:v:0", "-c:v", "mjpeg", "-q:v", "4", "-an",
      "-f", "avi", unsupportedMatroskaFixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", protectedHevcSourcePath, "-t", "4",
      "-map", "0:v:0", "-map", "0:a:0", "-c", "copy",
      "-map_metadata", "0", "-f", "mov", hevcMovFixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await Promise.all([
    ...(["mkv", "mp4", "mpeg-ts"] as const).map((input) =>
      execFileAsync(
        "ffmpeg",
        [
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          "-i", hevcMovFixturePath, "-map", "0:v:0", "-map", "0:a:0",
          "-c", "copy", "-map_metadata", "0",
          "-f", input === "mpeg-ts" ? "mpegts" : input === "mkv" ? "matroska" : input,
          hevcContainerFixturePaths[input],
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      ),
    ),
  ]);
  await Promise.all([
    execFileAsync(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", av1OpusFixturePath,
        "-map", "0:v:0", "-map", "0:a:0", "-c", "copy",
        "-map_metadata", "0", "-f", "webm", av1OpusWebmFixturePath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    ),
    execFileAsync(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", av1OpusFixturePath, "-i", oggFixturePath,
        "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-shortest",
        "-map_metadata", "0", "-f", "webm", av1VorbisWebmFixturePath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    ),
  ]);
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-fflags", "+genpts+bitexact", "-r", "24", "-i", m2vFixturePath,
      "-i", audioFixturePath, "-map", "0:v:0", "-map", "1:a:0",
      "-map_metadata", "-1", "-c", "copy", "-shortest", "-f", "matroska",
      mpeg2ContainerFixturePaths.mkv,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await Promise.all(
    ([
      [mpeg2ContainerFixturePaths.mp4, "mp4"],
      [mpeg2ContainerFixturePaths.mov, "mov"],
      [mpeg2ContainerFixturePaths.avi, "avi"],
      [mpeg2ContainerFixturePaths["mpeg-ts"], "mpegts"],
    ] as const).map(([outputPath, format]) =>
      execFileAsync(
        "ffmpeg",
        [
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          "-fflags", "+genpts+bitexact", "-r", "24", "-i", m2vFixturePath,
          "-map", "0:v:0", "-map_metadata", "-1", "-c:v", "copy",
          "-f", format, outputPath,
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      ),
    ),
  );
  await Promise.all(
    (Object.entries(mp3ContainerFixturePaths) as Array<
      [keyof typeof mp3ContainerFixturePaths, string]
    >)
      .filter(([input]) => input !== "mkv")
      .map(([input, outputPath]) =>
        execFileAsync(
          "ffmpeg",
          [
            "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-i", mp3ContainerFixturePaths.mkv,
            "-map", "0:v:0", "-map", "0:a:0", "-map_metadata", "0",
            "-c", "copy",
            ...(input === "avi" ? ["-bsf:v", "h264_mp4toannexb"] : []),
            "-f", input === "mpeg-ts" ? "mpegts" : input,
            outputPath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        ),
      ),
  );
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-fflags", "+genpts+bitexact", "-r", "24", "-i", m4vFixturePath,
      "-i", audioFixturePath, "-map", "0:v:0", "-map", "1:a:0",
      "-map_metadata", "-1", "-c", "copy", "-shortest", "-f", "matroska",
      m4vContainerFixturePaths.mkv,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await Promise.all(
    ([
      [m4vContainerFixturePaths.mp4, "mp4"],
      [m4vContainerFixturePaths.mov, "mov"],
      [m4vContainerFixturePaths.avi, "avi"],
    ] as const).map(([outputPath, format]) =>
      execFileAsync(
        "ffmpeg",
        [
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          "-fflags", "+genpts+bitexact", "-r", "24", "-i", m4vFixturePath,
          "-map", "0:v:0", "-map_metadata", "-1", "-c:v", "copy",
          "-f", format, outputPath,
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      ),
    ),
  );
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=2",
      "-f", "lavfi", "-i", "smptebars=size=320x180:rate=24:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
      "-map", "0:v:0", "-map", "1:v:0", "-map", "2:a:0",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-threads:v:0", "1", "-threads:v:1", "1", "-c:a", "aac",
      "-f", "matroska", multiVideoFixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      fixturePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c",
      "copy",
      "-map_metadata",
      "0",
      "-movflags",
      "+faststart",
      mp4InputFixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );

  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
    acceptDownloads: false,
    baseURL,
  });
  page = context.pages()[0] ?? (await context.newPage());
  await page.exposeBinding(
    "__withinMediaValidationChunk",
    async (_source, base64: string) => {
      if (!validationSink) {
        throw new Error("The project-local validation sink is not open.");
      }
      if (!validationSink.write(Buffer.from(base64, "base64"))) {
        await once(validationSink, "drain");
      }
    },
  );
});

test.afterAll(async () => {
  validationSink?.destroy();
  validationSink = null;
  await context?.close();
  await rm(mp4OutputPath, { force: true });
  await rm(movMp4OutputPath, { force: true });
  await rm(threeGpMp4OutputPath, { force: true });
  await rm(mpegTsMp4OutputPath, { force: true });
  await rm(flvMp4OutputPath, { force: true });
  await rm(aviMp4OutputPath, { force: true });
  await rm(h264Mp4OutputPath, { force: true });
  await rm(directMp4OutputPath, { force: true });
  await rm(directWavOutputPath, { force: true });
  await rm(directM4aOutputPath, { force: true });
  await rm(directFlacOutputPath, { force: true });
  await rm(directAiffOutputPath, { force: true });
  await rm(directAmrOutputPath, { force: true });
  await rm(directMp3OutputPath, { force: true });
  await rm(aacM4aOutputPath, { force: true });
  await rm(aacWavOutputPath, { force: true });
  await rm(aacFlacOutputPath, { force: true });
  await rm(m4aOutputPath, { force: true });
  await rm(mp4M4aOutputPath, { force: true });
  await rm(movM4aOutputPath, { force: true });
  await rm(threeGpM4aOutputPath, { force: true });
  await rm(mpegTsM4aOutputPath, { force: true });
  await rm(flvM4aOutputPath, { force: true });
  await rm(wavOutputPath, { force: true });
  await rm(mp4WavOutputPath, { force: true });
  await rm(movWavOutputPath, { force: true });
  await rm(threeGpWavOutputPath, { force: true });
  await rm(mpegTsWavOutputPath, { force: true });
  await rm(flvWavOutputPath, { force: true });
  await rm(aviWavOutputPath, { force: true });
  await rm(standaloneWavOutputPath, { force: true });
  await rm(mp3WavOutputPath, { force: true });
  await rm(flacWavOutputPath, { force: true });
  await rm(m4aFlacOutputPath, { force: true });
  await rm(mkvFlacOutputPath, { force: true });
  await rm(mp4FlacOutputPath, { force: true });
  await rm(movFlacOutputPath, { force: true });
  await rm(threeGpFlacOutputPath, { force: true });
  await rm(mpegTsFlacOutputPath, { force: true });
  await rm(flvFlacOutputPath, { force: true });
  await rm(aviFlacOutputPath, { force: true });
  await rm(ogvFlacOutputPath, { force: true });
  await rm(mp3FlacOutputPath, { force: true });
  await rm(wavFlacOutputPath, { force: true });
  await rm(alacWavOutputPath, { force: true });
  await rm(alacFlacOutputPath, { force: true });
  await rm(wavAlacOutputPath, { force: true });
  await rm(flacAlacOutputPath, { force: true });
  await rm(wmaWavOutputPath, { force: true });
  await rm(wmaFlacOutputPath, { force: true });
  await rm(wavWmaOutputPath, { force: true });
  await rm(flacWmaOutputPath, { force: true });
  await rm(amrWavOutputPath, { force: true });
  await rm(amrFlacOutputPath, { force: true });
  await rm(aiffWavOutputPath, { force: true });
  await rm(oggWavOutputPath, { force: true });
  await rm(opusWavOutputPath, { force: true });
  await rm(aiffFlacOutputPath, { force: true });
  await rm(oggFlacOutputPath, { force: true });
  await rm(opusFlacOutputPath, { force: true });
  for (const outputPath of Object.values(aiffOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(containerAiffOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(webmAudioOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(amrOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(containerAmrOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(mp3TranscodeOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(aacTranscodeOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(legacyContainerAacOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(containerLossyAudioOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(containerM4aOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  await rm(threeGpAmrExtractionOutputPath, { force: true });
  for (const outputPath of Object.values(opusTranscodeOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(vorbisTranscodeOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(wmaTranscodeOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(containerWmaOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(threeGpAmrOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  await rm(mpeg4OutputPath, { force: true });
  await rm(webmOutputPath, { force: true });
  await rm(ogvWebmOutputPath, { force: true });
  await rm(vp9WebmOutputPath, { force: true });
  await rm(av1WebmCopyOutputPath, { force: true });
  for (const outputPath of Object.values(mp3ExtractionOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(aacExtractionOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(oggAudioExtractionOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  await rm(mp4WebmOutputPath, { force: true });
  await rm(mp4Vp9WebmOutputPath, { force: true });
  await rm(movWebmOutputPath, { force: true });
  await rm(movVp9WebmOutputPath, { force: true });
  await rm(threeGpWebmOutputPath, { force: true });
  await rm(threeGpVp9WebmOutputPath, { force: true });
  await rm(mpegTsWebmOutputPath, { force: true });
  await rm(mpegTsVp9WebmOutputPath, { force: true });
  await rm(flvWebmOutputPath, { force: true });
  await rm(flvVp9WebmOutputPath, { force: true });
  await rm(aviWebmOutputPath, { force: true });
  await rm(aviVp9WebmOutputPath, { force: true });
  await rm(ogvVp9WebmOutputPath, { force: true });
  await rm(ogvWavOutputPath, { force: true });
  await rm(m2vMpeg4OutputPath, { force: true });
  await rm(m2vWebmOutputPath, { force: true });
  await rm(m2vVp9WebmOutputPath, { force: true });
  await rm(m2vMpegTsOutputPath, { force: true });
  for (const outputPath of Object.values(m2vExtractionOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  await rm(m4vMp4OutputPath, { force: true });
  for (const outputPath of Object.values(m4vExtractionOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  await rm(h264WebmOutputPath, { force: true });
  await rm(h264Vp9WebmOutputPath, { force: true });
  for (const outputPath of Object.values(h264ExtractionOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(hevcExtractionOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(matroskaOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(containerMpegTsOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(containerThreeGpOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(containerMovOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  for (const outputPath of Object.values(containerFlvOutputPaths)) {
    await rm(outputPath, { force: true });
  }
  await rm(complexMp4OutputPath, { force: true });
  await rm(complexMatroskaOutputPath, { force: true });
  await rm(corruptFixturePath, { force: true });
  await rm(incompatibleFixturePath, { force: true });
  await rm(multiVideoFixturePath, { force: true });
  await rm(unsupportedMatroskaFixturePath, { force: true });
  await rm(complexMatroskaAsWebmFixturePath, { force: true });
  await rm(mp4InputFixturePath, { force: true });
  await rm(av1OpusWebmFixturePath, { force: true });
  await rm(av1VorbisWebmFixturePath, { force: true });
  await rm(threeGpAmrFixturePath, { force: true });
  for (const fixture of Object.values(hevcContainerFixturePaths)) {
    await rm(fixture, { force: true });
  }
  for (const fixture of Object.values(mpeg2ContainerFixturePaths)) {
    await rm(fixture, { force: true });
  }
  for (const fixture of Object.values(m4vContainerFixturePaths)) {
    await rm(fixture, { force: true });
  }
  for (const [input, fixture] of Object.entries(mp3ContainerFixturePaths)) {
    if (input !== "mkv") await rm(fixture, { force: true });
  }
  await rm(profileRoot, { recursive: true, force: true });
});

async function removeBrowserStorageEntry(name: string): Promise<void> {
  await page.evaluate(async (entryName) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(entryName).catch((error) => {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") {
        throw error;
      }
    });
  }, name);
}

async function copyAndDeleteBrowserStorageEntry(
  name: string,
  outputPath: string,
): Promise<void> {
  const sink = createWriteStream(outputPath, { flags: "w" });
  validationSink = sink;
  try {
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(entryName);
        const file = await handle.getFile();
        const reader = file.stream().getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let offset = 0; offset < value.byteLength; offset += 64 * 1024) {
            const part = value.subarray(
              offset,
              Math.min(offset + 64 * 1024, value.byteLength),
            );
            let binary = "";
            for (let inner = 0; inner < part.byteLength; inner += 16 * 1024) {
              binary += String.fromCharCode(
                ...part.subarray(
                  inner,
                  Math.min(inner + 16 * 1024, part.byteLength),
                ),
              );
            }
            await window.__withinMediaValidationChunk(btoa(binary));
          }
        }
      } finally {
        await root.removeEntry(entryName).catch(() => {});
      }
    }, name);
    sink.end();
    await once(sink, "finish");
  } catch (error) {
    sink.destroy();
    throw error;
  } finally {
    if (validationSink === sink) validationSink = null;
  }
}

async function runMediaRoute(
  profileId:
    | "mkv-to-mp4"
    | "mov-to-mp4"
    | "3gp-to-mp4"
    | "mpeg-ts-to-mp4"
    | "flv-to-mp4"
    | "avi-to-mp4"
    | "h264-to-mp4"
    | "mkv-to-h264"
    | "mp4-to-h264"
    | "mov-to-h264"
    | "3gp-to-h264"
    | "mpeg-ts-to-h264"
    | "flv-to-h264"
    | "mkv-to-hevc"
    | "mp4-to-hevc"
    | "mov-to-hevc"
    | "mpeg-ts-to-hevc"
    | "mp4-to-mkv"
    | "mov-to-mkv"
    | "3gp-to-mkv"
    | "mpeg-ts-to-mkv"
    | "flv-to-mkv"
    | "avi-to-mkv"
    | "webm-to-mkv"
    | "ogv-to-mkv"
    | "mkv-to-mpeg-ts"
    | "mp4-to-mpeg-ts"
    | "mov-to-mpeg-ts"
    | "3gp-to-mpeg-ts"
    | "flv-to-mpeg-ts"
    | "mkv-to-3gp"
    | "mp4-to-3gp"
    | "mov-to-3gp"
    | "mpeg-ts-to-3gp"
    | "flv-to-3gp"
    | "mkv-to-mov"
    | "mp4-to-mov"
    | "3gp-to-mov"
    | "mpeg-ts-to-mov"
    | "flv-to-mov"
    | "mkv-to-flv"
    | "mp4-to-flv"
    | "mov-to-flv"
    | "3gp-to-flv"
    | "mpeg-ts-to-flv"
    | "m2v-to-mpeg-ts"
    | "mkv-to-m2v"
    | "mp4-to-m2v"
    | "mov-to-m2v"
    | "avi-to-m2v"
    | "mpeg-ts-to-m2v"
    | "m4v-to-mp4"
    | "mkv-to-m4v"
    | "mp4-to-m4v"
    | "mov-to-m4v"
    | "avi-to-m4v"
    | "mkv-to-webm-av1"
    | "mkv-to-mp3"
    | "mp4-to-mp3"
    | "mov-to-mp3"
    | "avi-to-mp3"
    | "mpeg-ts-to-mp3"
    | "flv-to-mp3"
    | "mkv-to-aac"
    | "mp4-to-aac"
    | "mov-to-aac"
    | "3gp-to-aac"
    | "3gp-to-aiff"
    | "mkv-to-aiff"
    | "mp4-to-aiff"
    | "mov-to-aiff"
    | "mpeg-ts-to-aiff"
    | "flv-to-aiff"
    | "avi-to-aiff"
    | "ogv-to-aiff"
    | "webm-to-aiff"
    | "webm-to-wav"
    | "webm-to-flac"
    | "webm-to-amr"
    | "webm-to-mp3"
    | "webm-to-aac"
    | "mkv-to-amr"
    | "mp4-to-amr"
    | "mov-to-amr"
    | "mpeg-ts-to-amr"
    | "flv-to-amr"
    | "avi-to-amr"
    | "ogv-to-amr"
    | "avi-to-aac"
    | "ogv-to-aac"
    | "mp4-to-opus"
    | "mov-to-opus"
    | "mpeg-ts-to-opus"
    | "flv-to-opus"
    | "avi-to-opus"
    | "ogv-to-opus"
    | "mp4-to-ogg"
    | "mov-to-ogg"
    | "mpeg-ts-to-ogg"
    | "flv-to-ogg"
    | "avi-to-ogg"
    | "ogv-to-mp3"
    | "3gp-to-mp3"
    | "3gp-to-opus"
    | "3gp-to-ogg"
    | "mpeg-ts-to-aac"
    | "flv-to-aac"
    | "mkv-to-ogg"
    | "webm-to-ogg"
    | "ogv-to-ogg"
    | "mkv-to-opus"
    | "webm-to-opus"
    | "mkv-to-m4a"
    | "mov-to-m4a"
    | "3gp-to-m4a"
    | "mpeg-ts-to-m4a"
    | "flv-to-m4a"
    | "mp4-to-m4a"
    | "aac-to-m4a"
    | "avi-to-m4a"
    | "ogv-to-m4a"
    | "webm-to-m4a"
    | "3gp-to-amr"
    | "mkv-to-wav"
    | "mov-to-wav"
    | "3gp-to-wav"
    | "mpeg-ts-to-wav"
    | "flv-to-wav"
    | "avi-to-wav"
    | "mp4-to-wav"
    | "m4a-to-wav"
    | "aac-to-wav"
    | "mp3-to-wav"
    | "flac-to-wav"
    | "m4a-to-flac"
    | "mkv-to-flac"
    | "mp4-to-flac"
    | "mov-to-flac"
    | "3gp-to-flac"
    | "mpeg-ts-to-flac"
    | "flv-to-flac"
    | "avi-to-flac"
    | "ogv-to-flac"
    | "aac-to-flac"
    | "mp3-to-flac"
    | "wav-to-flac"
    | "wav-to-alac"
    | "flac-to-alac"
    | "wma-to-wav"
    | "wma-to-flac"
    | "wav-to-wma"
    | "flac-to-wma"
    | "m4a-to-wma"
    | "aac-to-wma"
    | "mp3-to-wma"
    | "aiff-to-wma"
    | "ogg-to-wma"
    | "opus-to-wma"
    | "mkv-to-wma"
    | "mp4-to-wma"
    | "mov-to-wma"
    | "3gp-to-wma"
    | "mpeg-ts-to-wma"
    | "flv-to-wma"
    | "avi-to-wma"
    | "ogv-to-wma"
    | "webm-to-wma"
    | "amr-to-wav"
    | "amr-to-flac"
    | "amr-wb-to-wav"
    | "amr-wb-to-flac"
    | "aiff-to-wav"
    | "ogg-to-wav"
    | "opus-to-wav"
    | "aiff-to-flac"
    | "ogg-to-flac"
    | "opus-to-flac"
    | "m4a-to-aiff"
    | "aac-to-aiff"
    | "amr-to-aiff"
    | "mp3-to-aiff"
    | "flac-to-aiff"
    | "wav-to-aiff"
    | "wma-to-aiff"
    | "ogg-to-aiff"
    | "opus-to-aiff"
    | "m4a-to-amr"
    | "aac-to-amr"
    | "mp3-to-amr"
    | "flac-to-amr"
    | "wav-to-amr"
    | "wma-to-amr"
    | "aiff-to-amr"
    | "ogg-to-amr"
    | "opus-to-amr"
    | "m4a-to-mp3"
    | "aac-to-mp3"
    | "amr-to-mp3"
    | "flac-to-mp3"
    | "wav-to-mp3"
    | "wma-to-mp3"
    | "aiff-to-mp3"
    | "ogg-to-mp3"
    | "opus-to-mp3"
    | "m4a-to-aac"
    | "amr-to-aac"
    | "mp3-to-aac"
    | "flac-to-aac"
    | "wav-to-aac"
    | "wma-to-aac"
    | "aiff-to-aac"
    | "ogg-to-aac"
    | "opus-to-aac"
    | "m4a-to-opus"
    | "aac-to-opus"
    | "amr-to-opus"
    | "mp3-to-opus"
    | "flac-to-opus"
    | "wav-to-opus"
    | "wma-to-opus"
    | "aiff-to-opus"
    | "ogg-to-opus"
    | "m4a-to-ogg"
    | "aac-to-ogg"
    | "amr-to-ogg"
    | "mp3-to-ogg"
    | "flac-to-ogg"
    | "wav-to-ogg"
    | "wma-to-ogg"
    | "aiff-to-ogg"
    | "opus-to-ogg"
    | "mkv-to-webm"
    | "mp4-to-webm"
    | "mov-to-webm"
    | "3gp-to-webm"
    | "mpeg-ts-to-webm"
    | "flv-to-webm"
    | "avi-to-webm"
    | "ogv-to-webm"
    | "ogv-to-wav"
    | "m2v-to-mp4-mpeg4"
    | "m2v-to-webm"
    | "h264-to-webm"
    | "mkv-to-webm-vp9"
    | "mp4-to-webm-vp9"
    | "mov-to-webm-vp9"
    | "3gp-to-webm-vp9"
    | "mpeg-ts-to-webm-vp9"
    | "flv-to-webm-vp9"
    | "avi-to-webm-vp9"
    | "ogv-to-webm-vp9"
    | "m2v-to-webm-vp9"
    | "h264-to-webm-vp9"
    | "mkv-to-mp4-mpeg4",
  outputPath: string,
  expectedCodecs: string[],
  minimumBytes: number,
  inputPath = fixturePath,
  options: MediaRouteOptions = {},
) {
  try {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(inputPath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(profileId);
    await page.locator('[data-testid="convert-button"]').click();

    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 60_000 })
      .not.toBe("running");
    const state = await currentState();
    expect(state.jobState, state.error ?? state.phase).toBe("complete");
    expect(state.opfsName).toBeTruthy();
    if (options.expectedWarningFragments) {
      for (const fragment of options.expectedWarningFragments) {
        expect(
          state.warnings.some((warning) => warning.includes(fragment)),
          `Expected a warning containing ${fragment}.`,
        ).toBe(true);
      }
    } else if (
      profileId === "mkv-to-mp4" ||
      profileId === "mov-to-mp4" ||
      profileId === "3gp-to-mp4" ||
      profileId === "mpeg-ts-to-mp4" ||
      profileId === "flv-to-mp4" ||
      profileId === "avi-to-mp4" ||
      profileId === "h264-to-mp4"
    ) {
      expect(state.warnings).toEqual([]);
    } else if (
      profileId === "mkv-to-m4a" ||
      profileId === "mov-to-m4a" ||
      profileId === "3gp-to-m4a" ||
      profileId === "mp4-to-m4a" ||
      profileId === "mkv-to-wav" ||
      profileId === "mov-to-wav" ||
      profileId === "3gp-to-wav" ||
      profileId === "mp4-to-wav"
    ) {
      expect(state.warnings.some((warning) => warning.includes("video stream"))).toBe(
        true,
      );
    } else if (
      profileId === "m4a-to-wav" ||
      profileId === "aac-to-m4a" ||
      profileId === "aac-to-wav" ||
      profileId === "mp3-to-wav" ||
      profileId === "flac-to-wav" ||
      profileId === "m4a-to-flac" ||
      profileId === "aac-to-flac" ||
      profileId === "mp3-to-flac" ||
      profileId === "wav-to-flac" ||
      profileId === "wav-to-alac" ||
      profileId === "flac-to-alac" ||
      profileId === "wma-to-wav" ||
      profileId === "wma-to-flac" ||
      profileId.endsWith("-to-wma") ||
      profileId === "amr-to-wav" ||
      profileId === "amr-to-flac" ||
      profileId === "amr-wb-to-wav" ||
      profileId === "amr-wb-to-flac" ||
      profileId === "aiff-to-wav" ||
      profileId === "ogg-to-wav" ||
      profileId === "opus-to-wav" ||
      profileId === "aiff-to-flac" ||
      profileId === "ogg-to-flac" ||
      profileId === "opus-to-flac"
      || profileId.endsWith("-to-aiff")
      || profileId.endsWith("-to-amr")
      || (profileId.endsWith("-to-mp3") && !profileId.startsWith("mkv-") &&
        !profileId.startsWith("mp4-") && !profileId.startsWith("mov-") &&
        !profileId.startsWith("avi-") && !profileId.startsWith("mpeg-ts-") &&
        !profileId.startsWith("flv-"))
      || (profileId.endsWith("-to-aac") && !profileId.startsWith("mkv-") &&
        !profileId.startsWith("mp4-") && !profileId.startsWith("mov-") &&
        !profileId.startsWith("3gp-") && !profileId.startsWith("mpeg-ts-") &&
        !profileId.startsWith("flv-"))
      || (profileId.endsWith("-to-opus") && !profileId.startsWith("mkv-") &&
        !profileId.startsWith("webm-"))
      || (profileId.endsWith("-to-ogg") && !profileId.startsWith("mkv-") &&
        !profileId.startsWith("webm-") && !profileId.startsWith("ogv-"))
    ) {
      expect(state.warnings).toEqual([]);
    } else {
      expect(state.warnings.some((warning) => warning.includes("audio stream"))).toBe(
        true,
      );
    }
    expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.peakWasmMemoryBytes).toBeLessThanOrEqual(
      128 * 1024 * 1024,
    );
    if (
      profileId === "mkv-to-webm" ||
      profileId === "mp4-to-webm" ||
      profileId === "mov-to-webm" ||
      profileId === "3gp-to-webm" ||
      profileId === "mpeg-ts-to-webm" ||
      profileId === "flv-to-webm" ||
      profileId === "avi-to-webm" ||
      profileId === "ogv-to-webm" ||
      profileId === "m2v-to-webm" ||
      profileId === "h264-to-webm"
    ) {
      expect(state.metrics?.activeWorkerCount).toBe(9);
    } else if (
      profileId === "mkv-to-webm-vp9" ||
      profileId === "mp4-to-webm-vp9" ||
      profileId === "mov-to-webm-vp9" ||
      profileId === "3gp-to-webm-vp9" ||
      profileId === "mpeg-ts-to-webm-vp9" ||
      profileId === "flv-to-webm-vp9" ||
      profileId === "avi-to-webm-vp9" ||
      profileId === "ogv-to-webm-vp9" ||
      profileId === "m2v-to-webm-vp9" ||
      profileId === "h264-to-webm-vp9"
    ) {
      expect(state.metrics?.activeWorkerCount).toBe(9);
    } else if (
      profileId === "mkv-to-mp4-mpeg4" ||
      profileId === "m2v-to-mp4-mpeg4"
    ) {
      expect(state.metrics?.activeWorkerCount).toBe(5);
    }

    await copyAndDeleteBrowserStorageEntry(state.opfsName!, outputPath);

    const { size } = await stat(outputPath);
    expect(size).toBeGreaterThan(minimumBytes);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-show_chapters",
        "-count_frames",
        "-of",
        "json",
        outputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as MediaProbe;
    expect(
      probe.streams.map((stream) => stream.codec_name ?? stream.codec_type),
    ).toEqual(expectedCodecs);
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const [rateNumerator, rateDenominator] = String(
      video?.avg_frame_rate ?? "0/0",
    ).split("/").map(Number);
    const decodedDuration =
      Number(video?.nb_read_frames) * rateDenominator / rateNumerator;
    const probedDuration = Number(probe.format.duration);
    const outputDuration = Number.isFinite(probedDuration)
      ? probedDuration
      : decodedDuration;
    if (options.skipDurationValidation) {
      // Live Matroska intentionally omits duration and some codecs do not
      // expose a reliable average frame rate. Content hashes validate length.
    } else if (options.expectedDurationSeconds == null) {
      expect(outputDuration).toBeGreaterThan(3.9);
      expect(outputDuration).toBeLessThan(4.2);
    } else {
      expect(
        Math.abs(outputDuration - options.expectedDurationSeconds),
      ).toBeLessThanOrEqual(options.durationToleranceSeconds ?? 0.1);
    }
    await options.validate?.(probe, outputPath);
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await rm(outputPath, { force: true });
  }
}

async function validateMpeg2VideoOutput(
  probe: MediaProbe,
  outputPath: string,
): Promise<void> {
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  expect(video?.width).toBe(640);
  expect(video?.height).toBe(360);
  expect(probe.streams).toHaveLength(1);
  expect(probe.chapters ?? []).toEqual([]);

  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin",
      "-ss", "2", "-i", m2vFixturePath,
      "-ss", "2", "-i", outputPath,
      "-filter_complex",
      "[0:v:0]format=yuv420p,setpts=PTS-STARTPTS[source];[1:v:0]format=yuv420p,setpts=PTS-STARTPTS[converted];[source][converted]ssim[quality]",
      "-map", "[quality]", "-frames:v", "1", "-f", "null", "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const similarity = Number.parseFloat(
    stderr.match(/SSIM[^\r\n]*All:([0-9.]+)/)?.[1] ?? "",
  );
  expect(similarity).toBeGreaterThan(0.35);
}

async function validateH264WebmOutput(
  probe: MediaProbe,
  outputPath: string,
): Promise<void> {
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  expect(video?.width).toBe(640);
  expect(video?.height).toBe(360);
  expect(probe.streams).toHaveLength(1);
  expect(probe.chapters ?? []).toEqual([]);

  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin",
      "-i", h264FixturePath,
      "-i", outputPath,
      "-filter_complex",
      "[0:v:0]format=yuv420p,setpts=PTS-STARTPTS[source];[1:v:0]format=yuv420p,setpts=PTS-STARTPTS[converted];[source][converted]ssim[quality]",
      "-map", "[quality]", "-frames:v", "1", "-f", "null", "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const similarity = Number.parseFloat(
    stderr.match(/SSIM[^\r\n]*All:([0-9.]+)/)?.[1] ?? "",
  );
  expect(similarity).toBeGreaterThan(0.35);
}

async function validateContainerWebmOutput(
  probe: MediaProbe,
  outputPath: string,
): Promise<void> {
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  expect(video?.width).toBe(640);
  expect(video?.height).toBe(360);
  expect(probe.streams).toHaveLength(1);
  expect(probe.chapters ?? []).toEqual([]);
  await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-i", outputPath, "-map", "0:v:0", "-f", "null", "NUL"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
}

async function runSmallDirectAudioRoute(
  profileId:
    | "mkv-to-m4a"
    | "mp3-to-flac"
    | "mp3-to-aiff"
    | "mp3-to-amr"
    | "wav-to-mp3",
  inputPath: string,
  outputName: string,
  outputPath: string,
  expectedCodec: "aac" | "flac" | "pcm_s16be" | "amr_nb" | "mp3",
  minimumBytes: number,
): Promise<void> {
  try {
    await page.goto("/?test=1&directory=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(inputPath);
    await page.locator('[data-testid="format-select"]').selectOption(profileId);
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 60_000 })
      .not.toBe("running");

    const state = await currentState();
    expect(state.jobState, state.error ?? state.phase).toBe("complete");
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeGreaterThan(0);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.activeWorkerCount).toBe(2);

    await copyAndDeleteBrowserStorageEntry(outputName, outputPath);
    expect((await stat(outputPath)).size).toBeGreaterThan(minimumBytes);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name:format=duration",
        "-of",
        "json",
        outputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as MediaProbe;
    expect(probe.streams.map((stream) => stream.codec_name)).toEqual([
      expectedCodec,
    ]);
    expect(Number(probe.format.duration)).toBeGreaterThan(3.9);
    expect(Number(probe.format.duration)).toBeLessThan(4.2);
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        outputPath,
        "-f",
        "null",
        "-",
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await removeBrowserStorageEntry(outputName).catch(() => {});
    await rm(outputPath, { force: true });
  }
}

test("browser FFmpeg AVIO remuxes MKV to a valid MP4 with bounded I/O", async () => {
  await runMediaRoute(
    "mkv-to-mp4",
    mp4OutputPath,
    ["h264", "aac"],
    250_000,
  );
});

test("browser FFmpeg AVIO remuxes genuine QuickTime MOV to valid MP4", async () => {
  await runMediaRoute(
    "mov-to-mp4",
    movMp4OutputPath,
    ["h264", "aac"],
    500_000,
    movInputFixturePath,
  );
});

test("browser FFmpeg AVIO remuxes H.264/AAC 3GP to valid MP4", async () => {
  await runMediaRoute(
    "3gp-to-mp4",
    threeGpMp4OutputPath,
    ["h264", "aac"],
    500_000,
    threeGpInputFixturePath,
  );
});

test("browser FFmpeg AVIO remuxes MPEG transport stream to valid MP4", async () => {
  await runMediaRoute(
    "mpeg-ts-to-mp4",
    mpegTsMp4OutputPath,
    ["h264", "aac"],
    500_000,
    mpegTsInputFixturePath,
  );
});

test("browser FFmpeg AVIO remuxes Flash Video to valid MP4", async () => {
  await runMediaRoute(
    "flv-to-mp4",
    flvMp4OutputPath,
    ["h264", "aac"],
    500_000,
    flvInputFixturePath,
  );
});

test("browser FFmpeg AVIO remuxes MPEG-4 Part 2/MP3 AVI to valid MP4", async () => {
  await runMediaRoute(
    "avi-to-mp4",
    aviMp4OutputPath,
    ["mpeg4", "mp3"],
    500_000,
    aviInputFixturePath,
  );
});

test("browser FFmpeg AVIO writes a valid MP4 through the asynchronous direct-save adapter", async () => {
  const outputName = "remux-source.mp4";
  try {
    await page.goto("/?test=1&directory=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("mkv-to-mp4");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 15_000 })
      .not.toBe("idle");
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 60_000 })
      .not.toBe("running");

    const state = await currentState();
    expect(state.jobState, state.error ?? state.phase).toBe("complete");
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(1024 * 1024);
    expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(1024 * 1024);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.activeWorkerCount).toBe(2);
    expect(state.metrics?.sharedArrayBufferBytes).toBeGreaterThan(
      state.metrics?.peakWasmMemoryBytes ?? 0,
    );
    expect(
      (state.metrics?.sharedArrayBufferBytes ?? 0) -
        (state.metrics?.peakWasmMemoryBytes ?? 0),
    ).toBeLessThanOrEqual(1030 * 1024);

    await copyAndDeleteBrowserStorageEntry(outputName, directMp4OutputPath);
    const { size } = await stat(directMp4OutputPath);
    expect(size).toBeGreaterThan(250_000);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name:format=duration",
        "-of",
        "json",
        directMp4OutputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as MediaProbe;
    expect(probe.streams.map((stream) => stream.codec_name)).toEqual([
      "h264",
      "aac",
    ]);
    expect(Number(probe.format.duration)).toBeGreaterThan(3.9);
    expect(Number(probe.format.duration)).toBeLessThan(4.2);
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        directMp4OutputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-f",
        "null",
        "-",
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await removeBrowserStorageEntry(outputName).catch(() => {});
    await rm(directMp4OutputPath, { force: true });
  }
});

test("browser FFmpeg coalesces PCM packets for a bounded direct WAV save", async () => {
  const outputName = "audio-source.wav";
  try {
    await page.goto("/?test=1&directory=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(mp3FixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("mp3-to-wav");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 60_000 })
      .not.toBe("running");

    const state = await currentState();
    expect(state.jobState, state.error ?? state.phase).toBe("complete");
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeGreaterThan(128 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.activeWorkerCount).toBe(2);

    await copyAndDeleteBrowserStorageEntry(outputName, directWavOutputPath);
    const { size } = await stat(directWavOutputPath);
    expect(size).toBeGreaterThan(300_000);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name:format=duration",
        "-of",
        "json",
        directWavOutputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as MediaProbe;
    expect(probe.streams.map((stream) => stream.codec_name)).toEqual([
      "pcm_s16le",
    ]);
    expect(Number(probe.format.duration)).toBeGreaterThan(3.9);
    expect(Number(probe.format.duration)).toBeLessThan(4.2);
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        directWavOutputPath,
        "-f",
        "null",
        "-",
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await removeBrowserStorageEntry(outputName).catch(() => {});
    await rm(directWavOutputPath, { force: true });
  }
});

test("browser FFmpeg flushes a bounded direct M4A save correctly", async () => {
  await runSmallDirectAudioRoute(
    "mkv-to-m4a",
    fixturePath,
    "remux-source.m4a",
    directM4aOutputPath,
    "aac",
    20_000,
  );
});

test("browser FFmpeg flushes a bounded direct FLAC save correctly", async () => {
  await runSmallDirectAudioRoute(
    "mp3-to-flac",
    mp3FixturePath,
    "audio-source.flac",
    directFlacOutputPath,
    "flac",
    20_000,
  );
});

test("browser FFmpeg flushes coalesced AIFF PCM through a bounded direct save", async () => {
  await runSmallDirectAudioRoute(
    "mp3-to-aiff",
    mp3FixturePath,
    "audio-source.aiff",
    directAiffOutputPath,
    "pcm_s16be",
    300_000,
  );
});

test("browser FFmpeg flushes bounded AMR-NB packets through a direct save", async () => {
  await runSmallDirectAudioRoute(
    "mp3-to-amr",
    mp3FixturePath,
    "audio-source.amr",
    directAmrOutputPath,
    "amr_nb",
    1_000,
  );
});

test("browser FFmpeg flushes bounded MP3 packets through a direct save", async () => {
  await runSmallDirectAudioRoute(
    "wav-to-mp3",
    wavFixturePath,
    "audio-source.mp3",
    directMp3OutputPath,
    "mp3",
    1_000,
  );
});

test("direct MP3 save propagates write failure and releases the partial file", async () => {
  const outputName = "audio-source.mp3";
  try {
    await page.goto("/?test=1&directory=1&fault=write");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(wavFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("wav-to-mp3");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");

    const state = await currentState();
    expect(state.error?.toLowerCase()).toContain(
      "destination rejected a bounded write",
    );
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    const abandonedSize = await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(entryName);
        const size = (await handle.getFile()).size;
        await root.removeEntry(entryName);
        return size;
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return null;
        }
        throw error;
      }
    }, outputName);
    expect(abandonedSize === null || abandonedSize === 0).toBe(true);
  } finally {
    await removeBrowserStorageEntry(outputName).catch(() => {});
  }
});

test("direct AMR save propagates write failure and releases the partial file", async () => {
  const outputName = "audio-source.amr";
  try {
    await page.goto("/?test=1&directory=1&fault=write");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(mp3FixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("mp3-to-amr");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");

    const state = await currentState();
    expect(state.error?.toLowerCase()).toContain(
      "destination rejected a bounded write",
    );
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    const abandonedSize = await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(entryName);
        const size = (await handle.getFile()).size;
        await root.removeEntry(entryName);
        return size;
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return null;
        }
        throw error;
      }
    }, outputName);
    expect(abandonedSize === null || abandonedSize === 0).toBe(true);
  } finally {
    await removeBrowserStorageEntry(outputName).catch(() => {});
  }
});

test("direct AIFF coalescing propagates write failure and releases the partial file", async () => {
  const outputName = "audio-source.aiff";
  try {
    await page.goto("/?test=1&directory=1&fault=write");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(mp3FixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("mp3-to-aiff");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");

    const state = await currentState();
    expect(state.error?.toLowerCase()).toContain(
      "destination rejected a bounded write",
    );
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    const abandonedSize = await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(entryName);
        const size = (await handle.getFile()).size;
        await root.removeEntry(entryName);
        return size;
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return null;
        }
        throw error;
      }
    }, outputName);
    expect(abandonedSize === null || abandonedSize === 0).toBe(true);
  } finally {
    await removeBrowserStorageEntry(outputName).catch(() => {});
  }
});

test("direct WAV coalescing propagates write failure and releases the partial file", async () => {
  const outputName = "audio-source.wav";
  try {
    await page.goto("/?test=1&directory=1&fault=write");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(mp3FixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("mp3-to-wav");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");

    const state = await currentState();
    expect(state.error?.toLowerCase()).toContain(
      "destination rejected a bounded write",
    );
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    const abandonedSize = await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(entryName);
        const size = (await handle.getFile()).size;
        await root.removeEntry(entryName);
        return size;
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return null;
        }
        throw error;
      }
    }, outputName);
    expect(abandonedSize === null || abandonedSize === 0).toBe(true);
  } finally {
    await removeBrowserStorageEntry(outputName).catch(() => {});
  }
});

for (const route of [
  ["h264-to-mp4", h264FixturePath],
  ["h264-to-webm", h264FixturePath],
  ["h264-to-webm-vp9", h264FixturePath],
  ["mkv-to-h264", fixturePath],
  ["mp4-to-h264", mp4InputFixturePath],
  ["mov-to-h264", movInputFixturePath],
  ["3gp-to-h264", threeGpInputFixturePath],
  ["mpeg-ts-to-h264", mpegTsInputFixturePath],
  ["flv-to-h264", flvInputFixturePath],
  ["mkv-to-hevc", hevcContainerFixturePaths.mkv],
  ["mp4-to-hevc", hevcContainerFixturePaths.mp4],
  ["mov-to-hevc", hevcContainerFixturePaths.mov],
  ["mpeg-ts-to-hevc", hevcContainerFixturePaths["mpeg-ts"]],
  ["mp4-to-mkv", mp4InputFixturePath],
  ["mov-to-mkv", movInputFixturePath],
  ["3gp-to-mkv", threeGpInputFixturePath],
  ["mpeg-ts-to-mkv", mpegTsInputFixturePath],
  ["flv-to-mkv", flvInputFixturePath],
  ["avi-to-mkv", aviInputFixturePath],
  ["webm-to-mkv", av1OpusWebmFixturePath],
  ["ogv-to-mkv", ogvFixturePath],
  ["mkv-to-mpeg-ts", fixturePath],
  ["mp4-to-mpeg-ts", mp4InputFixturePath],
  ["mov-to-mpeg-ts", movInputFixturePath],
  ["3gp-to-mpeg-ts", threeGpInputFixturePath],
  ["flv-to-mpeg-ts", flvInputFixturePath],
  ["mkv-to-3gp", fixturePath],
  ["mp4-to-3gp", mp4InputFixturePath],
  ["mov-to-3gp", movInputFixturePath],
  ["mpeg-ts-to-3gp", mpegTsInputFixturePath],
  ["flv-to-3gp", flvInputFixturePath],
  ["mkv-to-mov", fixturePath],
  ["mp4-to-mov", mp4InputFixturePath],
  ["3gp-to-mov", threeGpInputFixturePath],
  ["mpeg-ts-to-mov", mpegTsInputFixturePath],
  ["flv-to-mov", flvInputFixturePath],
  ["mkv-to-flv", fixturePath],
  ["mp4-to-flv", mp4InputFixturePath],
  ["mov-to-flv", movInputFixturePath],
  ["3gp-to-flv", threeGpInputFixturePath],
  ["mpeg-ts-to-flv", mpegTsInputFixturePath],
  ["m2v-to-mpeg-ts", m2vFixturePath],
  ["mkv-to-m2v", mpeg2ContainerFixturePaths.mkv],
  ["mp4-to-m2v", mpeg2ContainerFixturePaths.mp4],
  ["mov-to-m2v", mpeg2ContainerFixturePaths.mov],
  ["avi-to-m2v", mpeg2ContainerFixturePaths.avi],
  ["mpeg-ts-to-m2v", mpeg2ContainerFixturePaths["mpeg-ts"]],
  ["m4v-to-mp4", m4vFixturePath],
  ["mkv-to-m4v", m4vContainerFixturePaths.mkv],
  ["mp4-to-m4v", m4vContainerFixturePaths.mp4],
  ["mov-to-m4v", m4vContainerFixturePaths.mov],
  ["avi-to-m4v", m4vContainerFixturePaths.avi],
  ["mkv-to-webm-av1", av1OpusFixturePath],
  ["mkv-to-mp3", mp3ContainerFixturePaths.mkv],
  ["mp4-to-mp3", mp3ContainerFixturePaths.mp4],
  ["mov-to-mp3", mp3ContainerFixturePaths.mov],
  ["avi-to-mp3", mp3ContainerFixturePaths.avi],
  ["mpeg-ts-to-mp3", mp3ContainerFixturePaths["mpeg-ts"]],
  ["flv-to-mp3", mp3ContainerFixturePaths.flv],
  ["mkv-to-aac", aacContainerFixturePaths.mkv],
  ["mp4-to-aac", aacContainerFixturePaths.mp4],
  ["mov-to-aac", aacContainerFixturePaths.mov],
  ["3gp-to-aac", aacContainerFixturePaths["3gp"]],
  ["mpeg-ts-to-aac", aacContainerFixturePaths["mpeg-ts"]],
  ["flv-to-aac", aacContainerFixturePaths.flv],
  ["m4a-to-aac", audioFixturePath],
  ["amr-to-aac", amrFixturePath],
  ["mp3-to-aac", mp3FixturePath],
  ["flac-to-aac", flacFixturePath],
  ["wav-to-aac", wavFixturePath],
  ["wma-to-aac", wmaFixturePath],
  ["aiff-to-aac", aiffFixturePath],
  ["ogg-to-aac", oggFixturePath],
  ["opus-to-aac", opusFixturePath],
  ["m4a-to-opus", audioFixturePath],
  ["aac-to-opus", aacFixturePath],
  ["amr-to-opus", amrFixturePath],
  ["mp3-to-opus", mp3FixturePath],
  ["flac-to-opus", flacFixturePath],
  ["wav-to-opus", wavFixturePath],
  ["wma-to-opus", wmaFixturePath],
  ["aiff-to-opus", aiffFixturePath],
  ["ogg-to-opus", oggFixturePath],
  ["m4a-to-ogg", audioFixturePath],
  ["aac-to-ogg", aacFixturePath],
  ["amr-to-ogg", amrFixturePath],
  ["mp3-to-ogg", mp3FixturePath],
  ["flac-to-ogg", flacFixturePath],
  ["wav-to-ogg", wavFixturePath],
  ["wma-to-ogg", wmaFixturePath],
  ["aiff-to-ogg", aiffFixturePath],
  ["opus-to-ogg", opusFixturePath],
  ["m4a-to-wma", audioFixturePath],
  ["aac-to-wma", aacFixturePath],
  ["mp3-to-wma", mp3FixturePath],
  ["aiff-to-wma", aiffFixturePath],
  ["ogg-to-wma", oggFixturePath],
  ["opus-to-wma", opusFixturePath],
  ["mkv-to-wma", fixturePath],
  ["mp4-to-wma", mp4InputFixturePath],
  ["mov-to-wma", movInputFixturePath],
  ["3gp-to-wma", threeGpInputFixturePath],
  ["mpeg-ts-to-wma", mpegTsInputFixturePath],
  ["flv-to-wma", flvInputFixturePath],
  ["avi-to-wma", aviInputFixturePath],
  ["ogv-to-wma", ogvFixturePath],
  ["webm-to-wma", av1OpusWebmFixturePath],
  ["mkv-to-aiff", fixturePath],
  ["mp4-to-aiff", mp4InputFixturePath],
  ["mov-to-aiff", movInputFixturePath],
  ["mpeg-ts-to-aiff", mpegTsInputFixturePath],
  ["flv-to-aiff", flvInputFixturePath],
  ["avi-to-aiff", aviInputFixturePath],
  ["ogv-to-aiff", ogvFixturePath],
  ["webm-to-aiff", av1OpusWebmFixturePath],
  ["webm-to-wav", av1OpusWebmFixturePath],
  ["webm-to-flac", av1OpusWebmFixturePath],
  ["webm-to-amr", av1OpusWebmFixturePath],
  ["webm-to-mp3", av1OpusWebmFixturePath],
  ["webm-to-aac", av1OpusWebmFixturePath],
  ["mkv-to-amr", fixturePath],
  ["mp4-to-amr", mp4InputFixturePath],
  ["mov-to-amr", movInputFixturePath],
  ["mpeg-ts-to-amr", mpegTsInputFixturePath],
  ["flv-to-amr", flvInputFixturePath],
  ["avi-to-amr", aviInputFixturePath],
  ["ogv-to-amr", ogvFixturePath],
  ["avi-to-aac", aviInputFixturePath],
  ["ogv-to-aac", ogvFixturePath],
  ["mp4-to-opus", mp4InputFixturePath],
  ["mov-to-opus", movInputFixturePath],
  ["mpeg-ts-to-opus", mpegTsInputFixturePath],
  ["flv-to-opus", flvInputFixturePath],
  ["avi-to-opus", aviInputFixturePath],
  ["ogv-to-opus", ogvFixturePath],
  ["mp4-to-ogg", mp4InputFixturePath],
  ["mov-to-ogg", movInputFixturePath],
  ["mpeg-ts-to-ogg", mpegTsInputFixturePath],
  ["flv-to-ogg", flvInputFixturePath],
  ["avi-to-ogg", aviInputFixturePath],
  ["ogv-to-mp3", ogvFixturePath],
  ["avi-to-m4a", aviInputFixturePath],
  ["ogv-to-m4a", ogvFixturePath],
  ["webm-to-m4a", av1OpusWebmFixturePath],
  ["3gp-to-amr", threeGpAmrFixturePath],
  ["3gp-to-aiff", threeGpAmrFixturePath],
  ["3gp-to-mp3", threeGpAmrFixturePath],
  ["3gp-to-opus", threeGpAmrFixturePath],
  ["3gp-to-ogg", threeGpAmrFixturePath],
  ["mkv-to-ogg", incompatibleFixturePath],
  ["webm-to-ogg", av1VorbisWebmFixturePath],
  ["ogv-to-ogg", ogvFixturePath],
  ["mkv-to-opus", av1OpusFixturePath],
  ["webm-to-opus", av1OpusWebmFixturePath],
  ["m2v-to-webm-vp9", m2vFixturePath],
  ["mp4-to-webm", mp4InputFixturePath],
  ["mp4-to-webm-vp9", mp4InputFixturePath],
  ["mov-to-webm", movInputFixturePath],
  ["mov-to-webm-vp9", movInputFixturePath],
  ["3gp-to-webm", threeGpInputFixturePath],
  ["3gp-to-webm-vp9", threeGpInputFixturePath],
  ["mpeg-ts-to-webm", mpegTsInputFixturePath],
  ["mpeg-ts-to-webm-vp9", mpegTsInputFixturePath],
  ["flv-to-webm", flvInputFixturePath],
  ["flv-to-webm-vp9", flvInputFixturePath],
  ["avi-to-webm", aviInputFixturePath],
  ["avi-to-webm-vp9", aviInputFixturePath],
  ["mkv-to-flac", fixturePath],
  ["mp4-to-flac", mp4InputFixturePath],
  ["mov-to-flac", movInputFixturePath],
  ["3gp-to-flac", threeGpInputFixturePath],
  ["mpeg-ts-to-flac", mpegTsInputFixturePath],
  ["flv-to-flac", flvInputFixturePath],
  ["avi-to-flac", aviInputFixturePath],
  ["ogv-to-flac", ogvFixturePath],
] as const) {
  const standaloneAudioMarker =
      /^webm-to-(?:wav|flac|amr|mp3|aac)$/.test(route[0])
      ? "[webm-audio] "
      : /^3gp-to-(?:aiff|mp3|opus|ogg)$/.test(route[0])
      ? "[3gp-amr] "
      : /^(?:m4a|amr|mp3|flac|wav|wma|aiff|ogg|opus)-to-aac$/.test(route[0])
      ? "[standalone-aac] "
      : /^(?:m4a|aac|amr|mp3|flac|wav|wma|aiff|ogg)-to-opus$/.test(route[0])
        ? "[standalone-opus] "
      : /^(?:m4a|aac|amr|mp3|flac|wav|wma|aiff|opus)-to-ogg$/.test(route[0])
        ? "[standalone-vorbis] "
      : /^(?:m4a|aac|mp3|aiff|ogg|opus)-to-wma$/.test(route[0])
        ? "[standalone-wma] "
      : /^(?:mkv|mp4|mov|3gp|mpeg-ts|flv|avi|ogv|webm)-to-wma$/.test(route[0])
        ? "[container-wma] "
      : /^(?:mkv|mp4|mov|mpeg-ts|flv|avi|ogv|webm)-to-aiff$/.test(route[0])
        ? "[container-aiff] "
      : /^(?:mkv|mp4|mov|mpeg-ts|flv|avi|ogv)-to-amr$/.test(route[0]) ||
          /^(?:avi|ogv)-to-aac$/.test(route[0])
        ? "[container-amr-aac] "
      : /^(?:mp4|mov|mpeg-ts|flv|avi|ogv)-to-opus$/.test(route[0]) ||
          /^(?:mp4|mov|mpeg-ts|flv|avi)-to-ogg$/.test(route[0]) ||
          route[0] === "ogv-to-mp3"
        ? "[container-lossy-audio] "
      : /^(?:avi|ogv|webm)-to-m4a$/.test(route[0]) || route[0] === "3gp-to-amr"
        ? "[container-m4a-amr] "
      : "";
  test(`${standaloneAudioMarker}${route[0]} propagates a destination failure and removes partial output`, async () => {
    await page.goto("/?test=1&fault=write");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(route[1]);
    await page.locator('[data-testid="format-select"]').selectOption(route[0]);
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error?.toLowerCase()).toContain(
      "destination rejected a bounded write",
    );
    expect(state.opfsName).toBeNull();
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    const leftovers = await page.evaluate(async (profileId) => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith(`within-test-${profileId}`)) names.push(name);
      }
      return names;
    }, route[0]);
    expect(leftovers).toEqual([]);
  });
}

test("browser remux preserves multiple audio tracks and VFR timing while disclosing exclusions", async () => {
  await runMediaRoute(
    "mkv-to-mp4",
    complexMp4OutputPath,
    ["h264", "aac", "aac"],
    400_000,
    complexFixturePath,
    {
      expectedWarningFragments: ["subtitle", "attachment", "chapter"],
      validate: async (probe, outputPath) => {
        const audio = probe.streams.filter(
          (stream) => stream.codec_type === "audio",
        );
        expect(audio).toHaveLength(2);
        expect(audio.map((stream) => stream.tags?.language)).toEqual([
          "eng",
          "spa",
        ]);
        expect(audio.map((stream) => stream.disposition?.default)).toEqual([
          1,
          0,
        ]);
        expect(probe.chapters ?? []).toEqual([]);
        expect(probe.format.tags?.title).toBe(
          "Within complex remux fixture",
        );

        const { stdout: packetOutput } = await execFileAsync(
          "ffprobe",
          [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "packet=pts_time",
            "-show_packets",
            "-of",
            "json",
            outputPath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
        const packets = JSON.parse(packetOutput) as {
          packets: Array<{ pts_time: string }>;
        };
        const timestamps = packets.packets
          .map((packet) => Number(packet.pts_time))
          .sort((left, right) => left - right);
        const deltasMs = new Set(
          timestamps
            .slice(1)
            .map((timestamp, index) =>
              Math.round((timestamp - timestamps[index]) * 1000),
            ),
        );
        expect([...deltasMs].some((delta) => delta >= 82 && delta <= 84)).toBe(
          true,
        );
        expect([...deltasMs].some((delta) => delta >= 41 && delta <= 43)).toBe(
          true,
        );

        await execFileAsync(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            outputPath,
            "-map",
            "0:v:0",
            "-map",
            "0:a",
            "-f",
            "null",
            "-",
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
      },
    },
  );
});

test("browser FFmpeg rejects corrupt MKV and removes its partial output", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page
    .locator('[data-testid="file-input"]')
    .setInputFiles(corruptFixturePath);
  await page
    .locator('[data-testid="format-select"]')
    .selectOption("mkv-to-mp4");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const failed = await currentState();
  expect(failed.error).toMatch(/input|matroska|invalid data/i);
  expect(failed.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-mkv-to-mp4")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
  await expect
    .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
    .toBe("ready");
});

for (const route of [
  {
    profileId: "mkv-to-mp4",
    title: "MP4",
    expectedError: "Lossless MP4 stream copy accepts AAC audio",
  },
  {
    profileId: "mkv-to-m4a",
    title: "M4A",
    expectedError: "Lossless M4A stream copy accepts AAC audio",
  },
  {
    profileId: "mkv-to-hevc",
    title: "HEVC extraction",
    expectedError: "The first non-attached video stream is not HEVC",
    inputPath: fixturePath,
  },
  {
    profileId: "mkv-to-webm-av1",
    title: "AV1 WebM",
    expectedError: "The first non-attached video stream is not AV1",
  },
  {
    profileId: "mkv-to-mp3",
    title: "MP3 extraction",
    expectedError: "No MP3 audio stream was found",
  },
  {
    profileId: "mkv-to-aac",
    title: "raw AAC extraction",
    expectedError: "No AAC audio stream was found",
  },
  {
    profileId: "mkv-to-ogg",
    title: "Ogg Vorbis extraction",
    expectedError: "No Vorbis audio stream was found",
    inputPath: fixturePath,
  },
  {
    profileId: "mkv-to-opus",
    title: "Ogg Opus extraction",
    expectedError: "No Opus audio stream was found",
  },
] as const) {
  test(`browser planner rejects a codec combination that ${route.title} cannot stream-copy`, async () => {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(
        "inputPath" in route
          ? (route.inputPath ?? incompatibleFixturePath)
          : incompatibleFixturePath,
      );
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(route.profileId);
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const failed = await currentState();
    expect(failed.error).toContain(route.expectedError);
    expect(failed.opfsName).toBeNull();
    const leftovers = await page.evaluate(async (profileId) => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith(`within-test-${profileId}`)) names.push(name);
      }
      return names;
    }, route.profileId);
    expect(leftovers).toEqual([]);
    await expect
      .poll(async () => (await currentState()).workerStatus, {
        timeout: 15_000,
      })
      .toBe("ready");
  });
}

test("browser FFmpeg AVIO extracts MKV audio to valid M4A with bounded I/O", async () => {
  await runMediaRoute("mkv-to-m4a", m4aOutputPath, ["aac"], 20_000);
});

test("browser FFmpeg AVIO extracts MP4 audio to valid M4A with bounded I/O", async () => {
  await runMediaRoute(
    "mp4-to-m4a",
    mp4M4aOutputPath,
    ["aac"],
    20_000,
    mp4InputFixturePath,
  );
});

test("browser FFmpeg losslessly remuxes raw AAC into bounded M4A", async () => {
  await runMediaRoute(
    "aac-to-m4a",
    aacM4aOutputPath,
    ["aac"],
    20_000,
    aacFixturePath,
    {
      expectedWarningFragments: [],
      validate: async (_probe, outputPath) => {
        await execFileAsync(
          "ffmpeg",
          ["-v", "error", "-i", outputPath, "-map", "0:a:0", "-f", "null", "NUL"],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
      },
    },
  );
});

test("browser FFmpeg AVIO extracts QuickTime MOV audio to valid M4A", async () => {
  await runMediaRoute(
    "mov-to-m4a",
    movM4aOutputPath,
    ["aac"],
    20_000,
    movInputFixturePath,
  );
});

test("browser FFmpeg AVIO extracts 3GP audio to valid M4A", async () => {
  await runMediaRoute(
    "3gp-to-m4a",
    threeGpM4aOutputPath,
    ["aac"],
    20_000,
    threeGpInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg AVIO extracts MPEG-TS audio to valid M4A", async () => {
  await runMediaRoute(
    "mpeg-ts-to-m4a",
    mpegTsM4aOutputPath,
    ["aac"],
    20_000,
    mpegTsInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg AVIO extracts Flash Video audio to valid M4A", async () => {
  await runMediaRoute(
    "flv-to-m4a",
    flvM4aOutputPath,
    ["aac"],
    20_000,
    flvInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg decodes AAC and encodes bounded PCM WAV", async () => {
  await runMediaRoute(
    "mkv-to-wav",
    wavOutputPath,
    ["pcm_s16le"],
    300_000,
  );
});

test("browser FFmpeg extracts MP4 audio and encodes bounded PCM WAV", async () => {
  await runMediaRoute(
    "mp4-to-wav",
    mp4WavOutputPath,
    ["pcm_s16le"],
    300_000,
    mp4InputFixturePath,
  );
});

test("browser FFmpeg decodes QuickTime MOV audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "mov-to-wav",
    movWavOutputPath,
    ["pcm_s16le"],
    300_000,
    movInputFixturePath,
  );
});

test("browser FFmpeg decodes 3GP AAC audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "3gp-to-wav",
    threeGpWavOutputPath,
    ["pcm_s16le"],
    300_000,
    threeGpInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg decodes MPEG-TS audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "mpeg-ts-to-wav",
    mpegTsWavOutputPath,
    ["pcm_s16le"],
    300_000,
    mpegTsInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg decodes Flash Video audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "flv-to-wav",
    flvWavOutputPath,
    ["pcm_s16le"],
    300_000,
    flvInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg decodes AVI MP3 audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "avi-to-wav",
    aviWavOutputPath,
    ["pcm_s16le"],
    300_000,
    aviInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg converts a standalone M4A audio file to PCM WAV", async () => {
  await runMediaRoute(
    "m4a-to-wav",
    standaloneWavOutputPath,
    ["pcm_s16le"],
    300_000,
    audioFixturePath,
  );
});

test("browser FFmpeg decodes raw AAC to bounded PCM WAV", async () => {
  await runMediaRoute(
    "aac-to-wav",
    aacWavOutputPath,
    ["pcm_s16le"],
    300_000,
    aacFixturePath,
  );
});

test("browser FFmpeg decodes a standalone MP3 file to PCM WAV", async () => {
  await runMediaRoute(
    "mp3-to-wav",
    mp3WavOutputPath,
    ["pcm_s16le"],
    300_000,
    mp3FixturePath,
  );
});

test("browser FFmpeg decodes a standalone FLAC file to PCM WAV", async () => {
  await runMediaRoute(
    "flac-to-wav",
    flacWavOutputPath,
    ["pcm_s16le"],
    300_000,
    flacFixturePath,
  );
});

test("browser FFmpeg converts standalone M4A audio to FLAC", async () => {
  await runMediaRoute(
    "m4a-to-flac",
    m4aFlacOutputPath,
    ["flac"],
    20_000,
    audioFixturePath,
  );
});

for (const route of [
  ["mkv-to-flac", fixturePath, mkvFlacOutputPath, "AAC"],
  ["mp4-to-flac", mp4InputFixturePath, mp4FlacOutputPath, "AAC"],
  ["mov-to-flac", movInputFixturePath, movFlacOutputPath, "AAC"],
  ["3gp-to-flac", threeGpInputFixturePath, threeGpFlacOutputPath, "AAC"],
  ["mpeg-ts-to-flac", mpegTsInputFixturePath, mpegTsFlacOutputPath, "AAC"],
  ["flv-to-flac", flvInputFixturePath, flvFlacOutputPath, "AAC"],
  ["avi-to-flac", aviInputFixturePath, aviFlacOutputPath, "MP3"],
  ["ogv-to-flac", ogvFixturePath, ogvFlacOutputPath, "Vorbis"],
] as const) {
  test(`browser FFmpeg extracts ${route[0]} ${route[3]} audio to FLAC`, async () => {
    await runMediaRoute(route[0], route[2], ["flac"], 20_000, route[1], {
      expectedWarningFragments: ["video stream"],
      validate: async (_probe, outputPath) =>
        expectDecodedAudioPsnr(route[1], outputPath, 60),
    });
  });
}

test("browser FFmpeg decodes raw AAC and encodes FLAC", async () => {
  await runMediaRoute(
    "aac-to-flac",
    aacFlacOutputPath,
    ["flac"],
    20_000,
    aacFixturePath,
  );
});

test("browser FFmpeg converts standalone MP3 audio to FLAC", async () => {
  await runMediaRoute(
    "mp3-to-flac",
    mp3FlacOutputPath,
    ["flac"],
    20_000,
    mp3FixturePath,
  );
});

test("browser FFmpeg losslessly encodes PCM WAV as FLAC", async () => {
  await runMediaRoute(
    "wav-to-flac",
    wavFlacOutputPath,
    ["flac"],
    20_000,
    wavFixturePath,
  );
});

test("browser FFmpeg decodes ALAC M4A to bounded PCM WAV", async () => {
  await runMediaRoute(
    "m4a-to-wav",
    alacWavOutputPath,
    ["pcm_s16le"],
    700_000,
    alacFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedPcmMatch(alacFixturePath, outputPath) },
  );
});

test("browser FFmpeg converts ALAC M4A to lossless FLAC", async () => {
  await runMediaRoute(
    "m4a-to-flac",
    alacFlacOutputPath,
    ["flac"],
    20_000,
    alacFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedPcmMatch(alacFixturePath, outputPath) },
  );
});

test("browser FFmpeg losslessly encodes PCM WAV as ALAC M4A", async () => {
  await runMediaRoute(
    "wav-to-alac",
    wavAlacOutputPath,
    ["alac"],
    20_000,
    wavFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedPcmMatch(wavFixturePath, outputPath) },
  );
});

test("browser FFmpeg losslessly transcodes FLAC to ALAC M4A", async () => {
  await runMediaRoute(
    "flac-to-alac",
    flacAlacOutputPath,
    ["alac"],
    20_000,
    flacFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedPcmMatch(flacFixturePath, outputPath) },
  );
});

test("browser FFmpeg decodes WMA2 to bounded PCM WAV", async () => {
  await runMediaRoute(
    "wma-to-wav",
    wmaWavOutputPath,
    ["pcm_s16le"],
    700_000,
    wmaFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedAudioPsnr(wmaFixturePath, outputPath, 60) },
  );
});

test("browser FFmpeg converts WMA2 to FLAC", async () => {
  await runMediaRoute(
    "wma-to-flac",
    wmaFlacOutputPath,
    ["flac"],
    20_000,
    wmaFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedAudioPsnr(wmaFixturePath, outputPath, 60) },
  );
});

test("browser FFmpeg encodes PCM WAV as WMA2", async () => {
  await runMediaRoute(
    "wav-to-wma",
    wavWmaOutputPath,
    ["wmav2"],
    20_000,
    wavFixturePath,
    {
      validate: async (probe, outputPath) => {
        expect(probe.streams[0]?.sample_rate).toBe("48000");
        expect(probe.streams[0]?.bit_rate).toBe("320000");
        await expectDecodedAudioPsnr(wavFixturePath, outputPath, 60);
      },
    },
  );
});

test("browser FFmpeg encodes FLAC as WMA2", async () => {
  await runMediaRoute(
    "flac-to-wma",
    flacWmaOutputPath,
    ["wmav2"],
    20_000,
    flacFixturePath,
    {
      validate: async (probe, outputPath) => {
        expect(probe.streams[0]?.sample_rate).toBe("48000");
        expect(probe.streams[0]?.bit_rate).toBe("320000");
        await expectDecodedAudioPsnr(flacFixturePath, outputPath, 60);
      },
    },
  );
});

const standaloneWmaOutputRoutes = [
  ["m4a-to-wma", "m4a", audioFixturePath],
  ["aac-to-wma", "aac", aacFixturePath],
  ["mp3-to-wma", "mp3", mp3FixturePath],
  ["aiff-to-wma", "aiff", aiffFixturePath],
  ["ogg-to-wma", "ogg", oggFixturePath],
  ["opus-to-wma", "opus", opusFixturePath],
] as const;

async function expectWmaTranscodeQuality(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const { stderr } = await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-nostdin",
    "-i",
    inputPath,
    "-i",
    outputPath,
    "-filter_complex",
    "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]asdr[quality]",
    "-map",
    "[quality]",
    "-f",
    "null",
    "NUL",
  ]);
  const channelSdr = [
    ...stderr.matchAll(
      /SDR ch\d+:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi,
    ),
  ].map((match) => Number(match[1]));
  expect(channelSdr.length).toBeGreaterThan(0);
  expect(Math.min(...channelSdr)).toBeGreaterThanOrEqual(-6.5);
}

for (const [route, input, inputPath] of standaloneWmaOutputRoutes) {
  test(`[standalone-wma] browser FFmpeg writes genuine WMA2 for ${input.toUpperCase()} input`, async () => {
    await runMediaRoute(
      route,
      wmaTranscodeOutputPaths[input],
      ["wmav2"],
      1_000,
      inputPath,
      {
        expectedWarningFragments: [],
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("asf");
          expect(probe.streams[0]?.sample_rate).toBe("48000");
          expect(probe.streams[0]?.bit_rate).toBe("320000");
          await expectWmaTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

test("[standalone-wma] browser FFmpeg encodes ALAC M4A as genuine WMA2", async () => {
  await runMediaRoute(
    "m4a-to-wma",
    wmaTranscodeOutputPaths.m4a,
    ["wmav2"],
    1_000,
    alacFixturePath,
    {
      expectedWarningFragments: [],
      validate: async (probe, outputPath) => {
        expect(String(probe.format.format_name).split(",")).toContain("asf");
        expect(probe.streams[0]?.sample_rate).toBe("48000");
        expect(probe.streams[0]?.bit_rate).toBe("320000");
        await expectWmaTranscodeQuality(alacFixturePath, outputPath);
      },
    },
  );
});

const containerWmaOutputRoutes = [
  ["mkv-to-wma", "mkv", fixturePath],
  ["mp4-to-wma", "mp4", mp4InputFixturePath],
  ["mov-to-wma", "mov", movInputFixturePath],
  ["3gp-to-wma", "3gp", threeGpInputFixturePath],
  ["mpeg-ts-to-wma", "mpeg-ts", mpegTsInputFixturePath],
  ["flv-to-wma", "flv", flvInputFixturePath],
  ["avi-to-wma", "avi", aviInputFixturePath],
  ["ogv-to-wma", "ogv", ogvFixturePath],
  ["webm-to-wma", "webm", av1OpusWebmFixturePath],
] as const;

for (const [route, input, inputPath] of containerWmaOutputRoutes) {
  test(`[container-wma] browser FFmpeg writes genuine WMA2 for ${input.toUpperCase()} input`, async () => {
    await runMediaRoute(
      route,
      containerWmaOutputPaths[input],
      ["wmav2"],
      1_000,
      inputPath,
      {
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("asf");
          expect(probe.streams[0]?.sample_rate).toBe("48000");
          expect(probe.streams[0]?.bit_rate).toBe("320000");
          await expectWmaTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

test("browser FFmpeg decodes AMR-NB to bounded PCM WAV", async () => {
  await runMediaRoute(
    "amr-to-wav",
    amrWavOutputPath,
    ["pcm_s16le"],
    50_000,
    amrFixturePath,
    {
      expectedDurationSeconds: 4.02,
      validate: async (_probe, outputPath) =>
        expectDecodedPcmMatch(amrFixturePath, outputPath),
    },
  );
});

test("browser FFmpeg converts AMR-NB to FLAC", async () => {
  await runMediaRoute(
    "amr-to-flac",
    amrFlacOutputPath,
    ["flac"],
    5_000,
    amrFixturePath,
    {
      expectedDurationSeconds: 4.02,
      validate: async (_probe, outputPath) =>
        expectDecodedPcmMatch(amrFixturePath, outputPath),
    },
  );
});

test("[amr-wb] browser FFmpeg decodes AMR-WB to bounded PCM WAV", async () => {
  await runMediaRoute(
    "amr-wb-to-wav",
    amrWbWavOutputPath,
    ["pcm_s16le"],
    100_000,
    amrWbFixturePath,
    {
      expectedDurationSeconds: 10.24,
      validate: async (_probe, outputPath) =>
        expectDecodedAudioPsnr(amrWbFixturePath, outputPath, 60),
    },
  );
});

test("[amr-wb] browser FFmpeg converts AMR-WB to FLAC", async () => {
  await runMediaRoute(
    "amr-wb-to-flac",
    amrWbFlacOutputPath,
    ["flac"],
    10_000,
    amrWbFixturePath,
    {
      expectedDurationSeconds: 10.24,
      validate: async (_probe, outputPath) =>
        expectDecodedAudioPsnr(amrWbFixturePath, outputPath, 60),
    },
  );
});

test("browser FFmpeg converts AIFF PCM to PCM WAV", async () => {
  await runMediaRoute(
    "aiff-to-wav",
    aiffWavOutputPath,
    ["pcm_s16le"],
    300_000,
    aiffFixturePath,
  );
});

test("browser FFmpeg decodes Ogg Vorbis to PCM WAV", async () => {
  await runMediaRoute(
    "ogg-to-wav",
    oggWavOutputPath,
    ["pcm_s16le"],
    300_000,
    oggFixturePath,
  );
});

test("browser FFmpeg decodes Opus to PCM WAV", async () => {
  await runMediaRoute(
    "opus-to-wav",
    opusWavOutputPath,
    ["pcm_s16le"],
    300_000,
    opusFixturePath,
  );
});

test("browser FFmpeg losslessly encodes AIFF PCM as FLAC", async () => {
  await runMediaRoute(
    "aiff-to-flac",
    aiffFlacOutputPath,
    ["flac"],
    20_000,
    aiffFixturePath,
    {
      validate: async (_probe, outputPath) =>
        expectDecodedPcmMatch(aiffFixturePath, outputPath),
    },
  );
});

test("browser FFmpeg converts Ogg Vorbis to FLAC", async () => {
  await runMediaRoute(
    "ogg-to-flac",
    oggFlacOutputPath,
    ["flac"],
    20_000,
    oggFixturePath,
    {
      validate: async (_probe, outputPath) =>
        expectDecodedAudioPsnr(oggFixturePath, outputPath, 60),
    },
  );
});

test("browser FFmpeg converts Opus to FLAC", async () => {
  await runMediaRoute(
    "opus-to-flac",
    opusFlacOutputPath,
    ["flac"],
    20_000,
    opusFixturePath,
    {
      validate: async (_probe, outputPath) =>
        expectDecodedAudioPsnr(opusFixturePath, outputPath, 60),
    },
  );
});

const standaloneAiffRoutes = [
  ["m4a-to-aiff", "m4a", audioFixturePath, false],
  ["aac-to-aiff", "aac", aacFixturePath, false],
  ["amr-to-aiff", "amr", amrFixturePath, true],
  ["mp3-to-aiff", "mp3", mp3FixturePath, false],
  ["flac-to-aiff", "flac", flacFixturePath, true],
  ["wav-to-aiff", "wav", wavFixturePath, true],
  ["wma-to-aiff", "wma", wmaFixturePath, false],
  ["ogg-to-aiff", "ogg", oggFixturePath, false],
  ["opus-to-aiff", "opus", opusFixturePath, false],
] as const;

for (const [route, input, inputPath, losslessPcm] of standaloneAiffRoutes) {
  test(`browser FFmpeg writes genuine AIFF PCM for ${input.toUpperCase()} input`, async () => {
    await runMediaRoute(
      route,
      aiffOutputPaths[input],
      ["pcm_s16be"],
      input === "amr" ? 30_000 : 300_000,
      inputPath,
      {
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("aiff");
          if (losslessPcm) {
            await expectDecodedPcmMatch(inputPath, outputPath);
          } else {
            await expectDecodedAudioPsnr(inputPath, outputPath, 60);
          }
        },
      },
    );
  });
}

test("browser FFmpeg preserves decoded ALAC samples in AIFF", async () => {
  await runMediaRoute(
    "m4a-to-aiff",
    aiffOutputPaths.m4a,
    ["pcm_s16be"],
    300_000,
    alacFixturePath,
    {
      validate: async (_probe, outputPath) =>
        expectDecodedPcmMatch(alacFixturePath, outputPath),
    },
  );
});

const containerAiffRoutes = [
  ["mkv-to-aiff", "mkv", fixturePath],
  ["mp4-to-aiff", "mp4", mp4InputFixturePath],
  ["mov-to-aiff", "mov", movInputFixturePath],
  ["3gp-to-aiff", "3gp", threeGpInputFixturePath],
  ["mpeg-ts-to-aiff", "mpeg-ts", mpegTsInputFixturePath],
  ["flv-to-aiff", "flv", flvInputFixturePath],
  ["avi-to-aiff", "avi", aviInputFixturePath],
  ["ogv-to-aiff", "ogv", ogvFixturePath],
  ["webm-to-aiff", "webm", av1OpusWebmFixturePath],
] as const;

for (const [route, input, inputPath] of containerAiffRoutes) {
  test(`[container-aiff] browser FFmpeg writes genuine AIFF PCM for ${input.toUpperCase()} input`, async () => {
    await runMediaRoute(
      route,
      containerAiffOutputPaths[input],
      ["pcm_s16be"],
      300_000,
      inputPath,
      {
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("aiff");
          await expectDecodedAudioPsnr(inputPath, outputPath, 60);
        },
      },
    );
  });
}

const standaloneAmrOutputRoutes = [
  ["m4a-to-amr", "m4a", audioFixturePath],
  ["aac-to-amr", "aac", aacFixturePath],
  ["mp3-to-amr", "mp3", mp3FixturePath],
  ["flac-to-amr", "flac", flacFixturePath],
  ["wav-to-amr", "wav", wavFixturePath],
  ["wma-to-amr", "wma", wmaFixturePath],
  ["aiff-to-amr", "aiff", aiffFixturePath],
  ["ogg-to-amr", "ogg", oggFixturePath],
  ["opus-to-amr", "opus", opusFixturePath],
] as const;

async function expectAmrTranscodeQuality(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-v",
    "error",
    "-i",
    outputPath,
    "-f",
    "null",
    "-",
  ]);
  const { stderr: qualityLog } = await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-nostdin",
    "-i",
    inputPath,
    "-i",
    outputPath,
    "-filter_complex",
    "[0:a:0]aresample=8000,aformat=sample_fmts=fltp:sample_rates=8000:channel_layouts=mono[source];[1:a:0]aresample=8000,aformat=sample_fmts=fltp:sample_rates=8000:channel_layouts=mono[converted];[source][converted]asdr[quality]",
    "-map",
    "[quality]",
    "-f",
    "null",
    "NUL",
  ]);
  const sdr = qualityLog.match(
    /SDR ch0:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/i,
  );
  expect(Number(sdr?.[1])).toBeGreaterThanOrEqual(-3);
}

for (const [route, input, inputPath] of standaloneAmrOutputRoutes) {
  test(`browser FFmpeg writes genuine 12.2 kb/s AMR-NB for ${input.toUpperCase()} input`, async () => {
    await runMediaRoute(
      route,
      amrOutputPaths[input],
      ["amr_nb"],
      1_000,
      inputPath,
      {
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("amr");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(Number(audio?.sample_rate)).toBe(8_000);
          expect(Number(audio?.channels)).toBe(1);
          // FFprobe includes AMR framing overhead in its average stream rate.
          // A 12.2 kb/s MR122 payload therefore probes as 12.4 kb/s.
          expect(Number(audio?.bit_rate)).toBe(12_400);
          await expectAmrTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

const containerAmrOutputRoutes = [
  ["mkv-to-amr", "mkv", fixturePath],
  ["mp4-to-amr", "mp4", mp4InputFixturePath],
  ["mov-to-amr", "mov", movInputFixturePath],
  ["mpeg-ts-to-amr", "mpeg-ts", mpegTsInputFixturePath],
  ["flv-to-amr", "flv", flvInputFixturePath],
  ["avi-to-amr", "avi", aviInputFixturePath],
  ["ogv-to-amr", "ogv", ogvFixturePath],
] as const;

for (const [route, input, inputPath] of containerAmrOutputRoutes) {
  test(`[container-amr-aac] browser FFmpeg converts ${input.toUpperCase()} audio to genuine 12.2 kb/s AMR-NB`, async () => {
    await runMediaRoute(
      route,
      containerAmrOutputPaths[input],
      ["amr_nb"],
      1_000,
      inputPath,
      {
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("amr");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(Number(audio?.sample_rate)).toBe(8_000);
          expect(Number(audio?.channels)).toBe(1);
          expect(Number(audio?.bit_rate)).toBe(12_400);
          await expectAmrTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

const standaloneMp3OutputRoutes = [
  ["m4a-to-mp3", "m4a", audioFixturePath],
  ["aac-to-mp3", "aac", aacFixturePath],
  ["amr-to-mp3", "amr", amrFixturePath],
  ["flac-to-mp3", "flac", flacFixturePath],
  ["wav-to-mp3", "wav", wavFixturePath],
  ["wma-to-mp3", "wma", wmaFixturePath],
  ["aiff-to-mp3", "aiff", aiffFixturePath],
  ["ogg-to-mp3", "ogg", oggFixturePath],
  ["opus-to-mp3", "opus", opusFixturePath],
] as const;

async function expectMp3TranscodeQuality(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const { stderr } = await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-nostdin",
    "-i",
    inputPath,
    "-i",
    outputPath,
    "-filter_complex",
    "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]asdr[quality]",
    "-map",
    "[quality]",
    "-f",
    "null",
    "NUL",
  ]);
  const channelSdr = [
    ...stderr.matchAll(
      /SDR ch\d+:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi,
    ),
  ].map((match) => Number(match[1]));
  expect(channelSdr.length).toBeGreaterThan(0);
  expect(Math.min(...channelSdr)).toBeGreaterThanOrEqual(-4);
}

for (const [route, input, inputPath] of standaloneMp3OutputRoutes) {
  test(`browser FFmpeg writes genuine MP3 for ${input.toUpperCase()} input`, async () => {
    await runMediaRoute(
      route,
      mp3TranscodeOutputPaths[input],
      ["mp3"],
      1_000,
      inputPath,
      {
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("mp3");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(Number(audio?.channels)).toBeLessThanOrEqual(2);
          expect(Number(audio?.sample_rate)).toBeGreaterThanOrEqual(32_000);
          expect(Number(audio?.sample_rate)).toBeLessThanOrEqual(48_000);
          expect(Number(audio?.bit_rate)).toBeGreaterThanOrEqual(128_000);
          await expectMp3TranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

test("browser FFmpeg encodes ALAC M4A as genuine MP3", async () => {
  await runMediaRoute(
    "m4a-to-mp3",
    mp3TranscodeOutputPaths.m4a,
    ["mp3"],
    1_000,
    alacFixturePath,
    {
      validate: async (_probe, outputPath) =>
        expectMp3TranscodeQuality(alacFixturePath, outputPath),
    },
  );
});

test("[container-lossy-audio] browser FFmpeg converts OGV Vorbis audio to genuine MP3", async () => {
  await runMediaRoute(
    "ogv-to-mp3",
    containerLossyAudioOutputPaths["ogv-to-mp3"],
    ["mp3"],
    1_000,
    ogvFixturePath,
    {
      expectedDurationSeconds: 3.84,
      durationToleranceSeconds: 0.2,
      expectedWarningFragments: ["video stream"],
      validate: async (probe, outputPath) => {
        expect(String(probe.format.format_name).split(",")).toContain("mp3");
        const audio = probe.streams.find(
          (stream: { codec_type?: string }) => stream.codec_type === "audio",
        );
        expect(Number(audio?.channels)).toBe(1);
        expect(Number(audio?.sample_rate)).toBe(48_000);
        expect(Number(audio?.bit_rate)).toBeGreaterThanOrEqual(128_000);
        await expectMp3TranscodeQuality(ogvFixturePath, outputPath);
      },
    },
  );
});

const standaloneAacOutputRoutes = [
  ["m4a-to-aac", "m4a", audioFixturePath],
  ["amr-to-aac", "amr", amrFixturePath],
  ["mp3-to-aac", "mp3", mp3FixturePath],
  ["flac-to-aac", "flac", flacFixturePath],
  ["wav-to-aac", "wav", wavFixturePath],
  ["wma-to-aac", "wma", wmaFixturePath],
  ["aiff-to-aac", "aiff", aiffFixturePath],
  ["ogg-to-aac", "ogg", oggFixturePath],
  ["opus-to-aac", "opus", opusFixturePath],
] as const;

async function expectAacTranscodeQuality(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const { stderr } = await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-nostdin",
    "-i",
    inputPath,
    "-i",
    outputPath,
    "-filter_complex",
    "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]asdr[quality]",
    "-map",
    "[quality]",
    "-f",
    "null",
    "NUL",
  ]);
  const channelSdr = [
    ...stderr.matchAll(
      /SDR ch\d+:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi,
    ),
  ].map((match) => Number(match[1]));
  expect(channelSdr.length).toBeGreaterThan(0);
  expect(Math.min(...channelSdr)).toBeGreaterThanOrEqual(-6.5);
}

for (const [route, input, inputPath] of standaloneAacOutputRoutes) {
  test(`[standalone-aac] browser FFmpeg writes genuine AAC for ${input.toUpperCase()} input`, async () => {
    await runMediaRoute(
      route,
      aacTranscodeOutputPaths[input],
      ["aac"],
      1_000,
      inputPath,
      {
        expectedDurationSeconds: 4,
        durationToleranceSeconds: 0.25,
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("aac");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(audio?.profile).toBe("LC");
          expect(Number(audio?.channels)).toBeLessThanOrEqual(2);
          expect([8_000, 11_025, 12_000, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000])
            .toContain(Number(audio?.sample_rate));
          if (input === "amr") {
            expect(Number(audio?.sample_rate)).toBe(8_000);
          }
          expect(Number(audio?.bit_rate)).toBeGreaterThan(0);
          expect(Number(audio?.bit_rate)).toBeLessThanOrEqual(220_000);
          await expectAacTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

test("[standalone-aac] browser FFmpeg encodes ALAC M4A as genuine AAC", async () => {
  await runMediaRoute(
    "m4a-to-aac",
    aacTranscodeOutputPaths.m4a,
    ["aac"],
    1_000,
    alacFixturePath,
    {
      validate: async (_probe, outputPath) =>
        expectAacTranscodeQuality(alacFixturePath, outputPath),
    },
  );
});

const legacyContainerAacOutputRoutes = [
  ["avi-to-aac", "avi", aviInputFixturePath],
  ["ogv-to-aac", "ogv", ogvFixturePath],
] as const;

for (const [route, input, inputPath] of legacyContainerAacOutputRoutes) {
  test(`[container-amr-aac] browser FFmpeg converts ${input.toUpperCase()} audio to genuine AAC`, async () => {
    await runMediaRoute(
      route,
      legacyContainerAacOutputPaths[input],
      ["aac"],
      1_000,
      inputPath,
      {
        expectedDurationSeconds: input === "ogv" ? 3.84 : 4,
        durationToleranceSeconds: 0.1,
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("aac");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(audio?.profile).toBe("LC");
          expect(Number(audio?.channels)).toBe(1);
          expect(Number(audio?.sample_rate)).toBe(48_000);
          expect(Number(audio?.bit_rate)).toBeGreaterThan(0);
          expect(Number(audio?.bit_rate)).toBeLessThanOrEqual(220_000);
          await expectAacTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

const containerM4aOutputRoutes = [
  ["avi-to-m4a", "avi", aviInputFixturePath],
  ["ogv-to-m4a", "ogv", ogvFixturePath],
  ["webm-to-m4a", "webm", av1OpusWebmFixturePath],
] as const;

for (const [route, input, inputPath] of containerM4aOutputRoutes) {
  test(`[container-m4a-amr] browser FFmpeg converts ${input.toUpperCase()} audio to fragmented AAC M4A`, async () => {
    await runMediaRoute(
      route,
      containerM4aOutputPaths[input],
      ["aac"],
      1_000,
      inputPath,
      {
        expectedDurationSeconds: input === "ogv" ? 4.021333 : 4,
        durationToleranceSeconds: input === "ogv" ? 0.02 : 0.12,
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("mov");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(audio?.profile).toBe("LC");
          expect(Number(audio?.channels)).toBe(1);
          expect(Number(audio?.sample_rate)).toBe(48_000);
          expect(Number(audio?.bit_rate)).toBeGreaterThan(0);
          expect(Number(audio?.bit_rate)).toBeLessThanOrEqual(220_000);
          await expectAacTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

test("[container-m4a-amr] browser FFmpeg losslessly extracts AMR-NB from 3GP", async () => {
  await runMediaRoute(
    "3gp-to-amr",
    threeGpAmrExtractionOutputPath,
    ["amr_nb"],
    1_000,
    threeGpAmrFixturePath,
    {
      expectedDurationSeconds: 4.108375,
      durationToleranceSeconds: 0.02,
      expectedWarningFragments: ["video stream"],
      validate: async (probe, outputPath) => {
        expect(String(probe.format.format_name).split(",")).toContain("amr");
        const audio = probe.streams.find(
          (stream: { codec_type?: string }) => stream.codec_type === "audio",
        );
        expect(Number(audio?.sample_rate)).toBe(8_000);
        expect(Number(audio?.channels)).toBe(1);
        await expectCompressedAudioPacketMatch(threeGpAmrFixturePath, outputPath);
      },
    },
  );
});

const webmAudioOutputRoutes = [
  ["webm-to-wav", "wav", "pcm_s16le"],
  ["webm-to-flac", "flac", "flac"],
  ["webm-to-amr", "amr", "amr_nb"],
  ["webm-to-mp3", "mp3", "mp3"],
  ["webm-to-aac", "aac", "aac"],
] as const;

for (const [route, output, codec] of webmAudioOutputRoutes) {
  test(`[webm-audio] browser FFmpeg converts WebM Opus audio to ${output.toUpperCase()}`, async () => {
    await runMediaRoute(
      route,
      webmAudioOutputPaths[output],
      [codec],
      output === "wav" ? 300_000 : 1_000,
      av1OpusWebmFixturePath,
      {
        expectedDurationSeconds: 4,
        durationToleranceSeconds: output === "amr" ? 0.3 : 0.25,
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(Number(audio?.channels)).toBe(1);
          if (output === "wav") {
            expect(String(probe.format.format_name).split(",")).toContain("wav");
            expect(Number(audio?.sample_rate)).toBe(48_000);
            await expectDecodedAudioPsnr(av1OpusWebmFixturePath, outputPath, 60);
          } else if (output === "flac") {
            expect(String(probe.format.format_name).split(",")).toContain("flac");
            expect(Number(audio?.sample_rate)).toBe(48_000);
            await expectDecodedAudioPsnr(av1OpusWebmFixturePath, outputPath, 60);
          } else if (output === "amr") {
            expect(String(probe.format.format_name).split(",")).toContain("amr");
            expect(Number(audio?.sample_rate)).toBe(8_000);
            expect(Number(audio?.bit_rate)).toBe(12_400);
            await expectAmrTranscodeQuality(av1OpusWebmFixturePath, outputPath);
          } else if (output === "mp3") {
            expect(String(probe.format.format_name).split(",")).toContain("mp3");
            expect(Number(audio?.sample_rate)).toBe(48_000);
            expect(Number(audio?.bit_rate)).toBe(128_000);
            await expectMp3TranscodeQuality(av1OpusWebmFixturePath, outputPath);
          } else {
            expect(String(probe.format.format_name).split(",")).toContain("aac");
            expect(audio?.profile).toBe("LC");
            expect(Number(audio?.sample_rate)).toBe(48_000);
            expect(Number(audio?.bit_rate)).toBeGreaterThan(0);
            expect(Number(audio?.bit_rate)).toBeLessThanOrEqual(220_000);
            await expectAacTranscodeQuality(av1OpusWebmFixturePath, outputPath);
          }
        },
      },
    );
  });
}

const standaloneOpusOutputRoutes = [
  ["m4a-to-opus", "m4a", audioFixturePath],
  ["aac-to-opus", "aac", aacFixturePath],
  ["amr-to-opus", "amr", amrFixturePath],
  ["mp3-to-opus", "mp3", mp3FixturePath],
  ["flac-to-opus", "flac", flacFixturePath],
  ["wav-to-opus", "wav", wavFixturePath],
  ["wma-to-opus", "wma", wmaFixturePath],
  ["aiff-to-opus", "aiff", aiffFixturePath],
  ["ogg-to-opus", "ogg", oggFixturePath],
] as const;

async function expectOpusTranscodeQuality(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const { stderr } = await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-nostdin",
    "-i",
    inputPath,
    "-i",
    outputPath,
    "-filter_complex",
    "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]asdr[quality]",
    "-map",
    "[quality]",
    "-f",
    "null",
    "NUL",
  ]);
  const channelSdr = [
    ...stderr.matchAll(
      /SDR ch\d+:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi,
    ),
  ].map((match) => Number(match[1]));
  expect(channelSdr.length).toBeGreaterThan(0);
  expect(Math.min(...channelSdr)).toBeGreaterThanOrEqual(-6.5);
}

for (const [route, input, inputPath] of standaloneOpusOutputRoutes) {
  test(`[standalone-opus] browser FFmpeg writes genuine Opus for ${input.toUpperCase()} input`, async () => {
    await runMediaRoute(
      route,
      opusTranscodeOutputPaths[input],
      ["opus"],
      1_000,
      inputPath,
      {
        expectedDurationSeconds: 4,
        durationToleranceSeconds: 0.15,
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("ogg");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(Number(audio?.channels)).toBeLessThanOrEqual(2);
          expect(Number(audio?.sample_rate)).toBe(48_000);
          const bitRate = Number(
            (probe.format as { bit_rate?: string }).bit_rate,
          );
          expect(bitRate).toBeGreaterThan(0);
          expect(bitRate).toBeLessThanOrEqual(160_000);
          await expectOpusTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

test("[standalone-opus] browser FFmpeg encodes ALAC M4A as genuine Opus", async () => {
  await runMediaRoute(
    "m4a-to-opus",
    opusTranscodeOutputPaths.m4a,
    ["opus"],
    1_000,
    alacFixturePath,
    {
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.15,
      validate: async (_probe, outputPath) =>
        expectOpusTranscodeQuality(alacFixturePath, outputPath),
    },
  );
});

const containerOpusOutputRoutes = [
  ["mp4-to-opus", mp4InputFixturePath],
  ["mov-to-opus", movInputFixturePath],
  ["mpeg-ts-to-opus", mpegTsInputFixturePath],
  ["flv-to-opus", flvInputFixturePath],
  ["avi-to-opus", aviInputFixturePath],
  ["ogv-to-opus", ogvFixturePath],
] as const;

for (const [route, inputPath] of containerOpusOutputRoutes) {
  test(`[container-lossy-audio] browser FFmpeg converts ${route.split("-to-")[0].toUpperCase()} audio to genuine Opus`, async () => {
    await runMediaRoute(
      route,
      containerLossyAudioOutputPaths[route],
      ["opus"],
      1_000,
      inputPath,
      {
        expectedDurationSeconds: 4,
        durationToleranceSeconds: route === "ogv-to-opus" ? 0.02 : 0.15,
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("ogg");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(Number(audio?.channels)).toBe(1);
          expect(Number(audio?.sample_rate)).toBe(48_000);
          const bitRate = Number((probe.format as { bit_rate?: string }).bit_rate);
          expect(bitRate).toBeGreaterThan(0);
          expect(bitRate).toBeLessThanOrEqual(160_000);
          await expectOpusTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

const standaloneVorbisOutputRoutes = [
  ["m4a-to-ogg", "m4a", audioFixturePath],
  ["aac-to-ogg", "aac", aacFixturePath],
  ["amr-to-ogg", "amr", amrFixturePath],
  ["mp3-to-ogg", "mp3", mp3FixturePath],
  ["flac-to-ogg", "flac", flacFixturePath],
  ["wav-to-ogg", "wav", wavFixturePath],
  ["wma-to-ogg", "wma", wmaFixturePath],
  ["aiff-to-ogg", "aiff", aiffFixturePath],
  ["opus-to-ogg", "opus", opusFixturePath],
] as const;

for (const [route, input, inputPath] of standaloneVorbisOutputRoutes) {
  test(`[standalone-vorbis] browser FFmpeg writes genuine Vorbis for ${input.toUpperCase()} input`, async () => {
    await runMediaRoute(
      route,
      vorbisTranscodeOutputPaths[input],
      ["vorbis"],
      1_000,
      inputPath,
      {
        expectedDurationSeconds: 4,
        durationToleranceSeconds: 0.3,
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("ogg");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(Number(audio?.channels)).toBeLessThanOrEqual(2);
          expect(Number(audio?.sample_rate)).toBeGreaterThan(0);
          expect(Number(audio?.sample_rate)).toBeLessThanOrEqual(48_000);
          if (input === "amr") {
            expect(Number(audio?.sample_rate)).toBe(8_000);
          }
          const bitRate = Number(
            (probe.format as { bit_rate?: string }).bit_rate,
          );
          expect(bitRate).toBeGreaterThan(0);
          expect(bitRate).toBeLessThanOrEqual(220_000);
          await expectOpusTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

test("[standalone-vorbis] browser FFmpeg encodes ALAC M4A as genuine Vorbis", async () => {
  await runMediaRoute(
    "m4a-to-ogg",
    vorbisTranscodeOutputPaths.m4a,
    ["vorbis"],
    1_000,
    alacFixturePath,
    {
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.3,
      validate: async (_probe, outputPath) =>
        expectOpusTranscodeQuality(alacFixturePath, outputPath),
    },
  );
});

const containerVorbisOutputRoutes = [
  ["mp4-to-ogg", mp4InputFixturePath],
  ["mov-to-ogg", movInputFixturePath],
  ["mpeg-ts-to-ogg", mpegTsInputFixturePath],
  ["flv-to-ogg", flvInputFixturePath],
  ["avi-to-ogg", aviInputFixturePath],
] as const;

for (const [route, inputPath] of containerVorbisOutputRoutes) {
  test(`[container-lossy-audio] browser FFmpeg converts ${route.split("-to-")[0].toUpperCase()} audio to genuine Vorbis`, async () => {
    await runMediaRoute(
      route,
      containerLossyAudioOutputPaths[route],
      ["vorbis"],
      1_000,
      inputPath,
      {
        expectedDurationSeconds: 4,
        durationToleranceSeconds: 0.3,
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(String(probe.format.format_name).split(",")).toContain("ogg");
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(Number(audio?.channels)).toBe(1);
          expect(Number(audio?.sample_rate)).toBe(48_000);
          const bitRate = Number((probe.format as { bit_rate?: string }).bit_rate);
          expect(bitRate).toBeGreaterThan(0);
          expect(bitRate).toBeLessThanOrEqual(220_000);
          await expectOpusTranscodeQuality(inputPath, outputPath);
        },
      },
    );
  });
}

const threeGpAmrOutputRoutes = [
  ["3gp-to-wav", "wav", "pcm_s16le"],
  ["3gp-to-flac", "flac", "flac"],
  ["3gp-to-aiff", "aiff", "pcm_s16be"],
  ["3gp-to-mp3", "mp3", "mp3"],
  ["3gp-to-opus", "opus", "opus"],
  ["3gp-to-ogg", "ogg", "vorbis"],
] as const;

for (const [route, output, codec] of threeGpAmrOutputRoutes) {
  test(`[3gp-amr] browser FFmpeg converts AMR-NB in 3GP to ${output.toUpperCase()}`, async () => {
    await runMediaRoute(
      route,
      threeGpAmrOutputPaths[output],
      [codec],
      1_000,
      threeGpAmrFixturePath,
      {
        expectedDurationSeconds: 4.02,
        durationToleranceSeconds: 0.3,
        expectedWarningFragments: [],
        validate: async (probe, outputPath) => {
          const audio = probe.streams.find(
            (stream: { codec_type?: string }) => stream.codec_type === "audio",
          );
          expect(Number(audio?.channels)).toBe(1);
          if (output === "wav") {
            expect(String(probe.format.format_name).split(",")).toContain("wav");
            expect(Number(audio?.sample_rate)).toBe(8_000);
            await expectDecodedPcmMatch(threeGpAmrFixturePath, outputPath);
          } else if (output === "flac") {
            expect(String(probe.format.format_name).split(",")).toContain("flac");
            expect(Number(audio?.sample_rate)).toBe(8_000);
            await expectDecodedPcmMatch(threeGpAmrFixturePath, outputPath);
          } else if (output === "aiff") {
            expect(String(probe.format.format_name).split(",")).toContain("aiff");
            expect(Number(audio?.sample_rate)).toBe(8_000);
            await expectDecodedPcmMatch(threeGpAmrFixturePath, outputPath);
          } else if (output === "mp3") {
            expect(String(probe.format.format_name).split(",")).toContain("mp3");
            expect(Number(audio?.sample_rate)).toBe(32_000);
            await expectMp3TranscodeQuality(threeGpAmrFixturePath, outputPath);
          } else if (output === "opus") {
            expect(String(probe.format.format_name).split(",")).toContain("ogg");
            expect(Number(audio?.sample_rate)).toBe(48_000);
            await expectOpusTranscodeQuality(threeGpAmrFixturePath, outputPath);
          } else {
            expect(String(probe.format.format_name).split(",")).toContain("ogg");
            expect(Number(audio?.sample_rate)).toBe(8_000);
            await expectOpusTranscodeQuality(threeGpAmrFixturePath, outputPath);
          }
        },
      },
    );
  });
}

test("browser FFmpeg performs a genuine bounded video re-encode", async () => {
  await runMediaRoute(
    "mkv-to-mp4-mpeg4",
    mpeg4OutputPath,
    ["mpeg4"],
    100_000,
  );
});

test("browser FFmpeg decodes video and encodes a genuine VP8 WebM", async () => {
  await runMediaRoute(
    "mkv-to-webm",
    webmOutputPath,
    ["vp8"],
    50_000,
  );
});

test("browser FFmpeg decodes video and encodes a genuine VP9 WebM", async () => {
  await runMediaRoute(
    "mkv-to-webm-vp9",
    vp9WebmOutputPath,
    ["vp9"],
    50_000,
  );
});

test("browser FFmpeg losslessly copies AV1 and Opus from Matroska to bounded live WebM", async () => {
  await runMediaRoute(
    "mkv-to-webm-av1",
    av1WebmCopyOutputPath,
    ["av1", "opus"],
    100_000,
    av1OpusFixturePath,
    {
      expectedWarningFragments: [],
      expectedDurationSeconds: 4,
      validate: async (probe, outputPath) => {
        const video = probe.streams.find((stream) => stream.codec_type === "video");
        const audio = probe.streams.find((stream) => stream.codec_type === "audio");
        expect(video?.nb_read_frames).toBe("96");
        expect(audio?.tags?.language).toBe("eng");
        expect(probe.chapters ?? []).toEqual([]);
        await expectDecodedVideoMatch(av1OpusFixturePath, outputPath);
        await expectDecodedPcmMatch(av1OpusFixturePath, outputPath);
      },
    },
  );
});

for (const input of ["mkv", "mp4", "mov", "avi", "mpeg-ts", "flv"] as const) {
  test(`browser FFmpeg losslessly extracts MP3 packets from ${input.toUpperCase()}`, async () => {
    const inputPath = mp3ContainerFixturePaths[input];
    await runMediaRoute(
      `${input}-to-mp3`,
      mp3ExtractionOutputPaths[input],
      ["mp3"],
      20_000,
      inputPath,
      {
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(probe.streams).toHaveLength(1);
          expect(probe.chapters ?? []).toEqual([]);
          await expectMp3PacketMatch(inputPath, outputPath);
        },
      },
    );
  });
}

for (const input of ["mkv", "mp4", "mov", "3gp", "mpeg-ts", "flv"] as const) {
  test(`browser FFmpeg losslessly extracts AAC access units from ${input.toUpperCase()}`, async () => {
    const inputPath = aacContainerFixturePaths[input];
    await runMediaRoute(
      `${input}-to-aac`,
      aacExtractionOutputPaths[input],
      ["aac"],
      20_000,
      inputPath,
      {
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(probe.streams).toHaveLength(1);
          expect(probe.chapters ?? []).toEqual([]);
          await expectAacAccessUnitMatch(inputPath, outputPath);
        },
      },
    );
  });
}

for (const route of [
  ["mkv-to-ogg", incompatibleFixturePath, "vorbis", 5_000],
  ["webm-to-ogg", av1VorbisWebmFixturePath, "vorbis", 10_000],
  ["ogv-to-ogg", ogvFixturePath, "vorbis", 10_000],
  ["mkv-to-opus", av1OpusFixturePath, "opus", 10_000],
  ["webm-to-opus", av1OpusWebmFixturePath, "opus", 10_000],
] as const) {
  test(`browser FFmpeg losslessly extracts ${route[2]} packets with ${route[0]}`, async () => {
    const [profileId, inputPath, codec, minimumBytes] = route;
    await runMediaRoute(
      profileId,
      oggAudioExtractionOutputPaths[profileId],
      [codec],
      minimumBytes,
      inputPath,
      {
        expectedDurationSeconds: profileId === "mkv-to-ogg" ? 2 : undefined,
        expectedWarningFragments: ["video stream"],
        validate: async (probe, outputPath) => {
          expect(probe.streams).toHaveLength(1);
          expect(probe.chapters ?? []).toEqual([]);
          await expectCompressedAudioPacketMatch(inputPath, outputPath);
        },
      },
    );
  });
}

for (const route of [
  ["mp4-to-webm", mp4InputFixturePath, mp4WebmOutputPath, "vp8"],
  ["mp4-to-webm-vp9", mp4InputFixturePath, mp4Vp9WebmOutputPath, "vp9"],
  ["mov-to-webm", movInputFixturePath, movWebmOutputPath, "vp8"],
  ["mov-to-webm-vp9", movInputFixturePath, movVp9WebmOutputPath, "vp9"],
  ["3gp-to-webm", threeGpInputFixturePath, threeGpWebmOutputPath, "vp8"],
  ["3gp-to-webm-vp9", threeGpInputFixturePath, threeGpVp9WebmOutputPath, "vp9"],
  ["mpeg-ts-to-webm", mpegTsInputFixturePath, mpegTsWebmOutputPath, "vp8"],
  ["mpeg-ts-to-webm-vp9", mpegTsInputFixturePath, mpegTsVp9WebmOutputPath, "vp9"],
  ["flv-to-webm", flvInputFixturePath, flvWebmOutputPath, "vp8"],
  ["flv-to-webm-vp9", flvInputFixturePath, flvVp9WebmOutputPath, "vp9"],
  ["avi-to-webm", aviInputFixturePath, aviWebmOutputPath, "vp8"],
  ["avi-to-webm-vp9", aviInputFixturePath, aviVp9WebmOutputPath, "vp9"],
] as const) {
  test(`browser FFmpeg converts ${route[0]} with bounded optimized workers`, async () => {
    await runMediaRoute(route[0], route[2], [route[3]], 50_000, route[1], {
      expectedWarningFragments: ["audio stream"],
      validate: validateContainerWebmOutput,
    });
  });
}

test("browser FFmpeg converts Theora/Vorbis OGV to VP8/Vorbis WebM", async () => {
  await runMediaRoute(
    "ogv-to-webm",
    ogvWebmOutputPath,
    ["vp8", "vorbis"],
    50_000,
    ogvFixturePath,
    {
      expectedWarningFragments: [],
      validate: async (probe, outputPath) => {
        const audio = probe.streams.find(
          (stream) => stream.codec_type === "audio",
        );
        expect(audio?.tags?.language).toBe("eng");
        expect(probe.chapters ?? []).toEqual([]);
        await execFileAsync(
          "ffmpeg",
          [
            "-v", "error", "-i", outputPath,
            "-map", "0:v:0", "-map", "0:a:0",
            "-f", "null", "NUL",
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
      },
    },
  );
});

test("browser FFmpeg converts Theora/Vorbis OGV to VP9/Vorbis WebM", async () => {
  await runMediaRoute(
    "ogv-to-webm-vp9",
    ogvVp9WebmOutputPath,
    ["vp9", "vorbis"],
    50_000,
    ogvFixturePath,
    {
      expectedWarningFragments: [],
      validate: async (probe, outputPath) => {
        const audio = probe.streams.find(
          (stream) => stream.codec_type === "audio",
        );
        expect(audio?.tags?.language).toBe("eng");
        await execFileAsync(
          "ffmpeg",
          ["-v", "error", "-i", outputPath, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "NUL"],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
      },
    },
  );
});

test("browser FFmpeg decodes OGV Vorbis audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "ogv-to-wav",
    ogvWavOutputPath,
    ["pcm_s16le"],
    300_000,
    ogvFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg converts MPEG-2 elementary video to MPEG-4 MP4", async () => {
  await runMediaRoute(
    "m2v-to-mp4-mpeg4",
    m2vMpeg4OutputPath,
    ["mpeg4"],
    100_000,
    m2vFixturePath,
    {
      expectedWarningFragments: [],
      validate: validateMpeg2VideoOutput,
    },
  );
});

test("browser FFmpeg converts MPEG-2 elementary video to VP8 WebM", async () => {
  await runMediaRoute(
    "m2v-to-webm",
    m2vWebmOutputPath,
    ["vp8"],
    50_000,
    m2vFixturePath,
    {
      expectedWarningFragments: [],
      validate: validateMpeg2VideoOutput,
    },
  );
});

test("browser FFmpeg converts MPEG-2 elementary video to VP9 WebM", async () => {
  await runMediaRoute(
    "m2v-to-webm-vp9",
    m2vVp9WebmOutputPath,
    ["vp9"],
    50_000,
    m2vFixturePath,
    {
      expectedWarningFragments: [],
      validate: validateMpeg2VideoOutput,
    },
  );
});

test("browser FFmpeg losslessly wraps MPEG-2 elementary video in MPEG-TS", async () => {
  await runMediaRoute(
    "m2v-to-mpeg-ts",
    m2vMpegTsOutputPath,
    ["mpeg2video"],
    500_000,
    m2vFixturePath,
    {
      expectedWarningFragments: [],
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.1,
      validate: async (probe, outputPath) => {
        expect(probe.streams).toHaveLength(1);
        await expectDecodedVideoMatch(m2vFixturePath, outputPath);
      },
    },
  );
});

for (const route of [
  ["mkv-to-m2v", mpeg2ContainerFixturePaths.mkv, m2vExtractionOutputPaths.mkv, true],
  ["mp4-to-m2v", mpeg2ContainerFixturePaths.mp4, m2vExtractionOutputPaths.mp4, false],
  ["mov-to-m2v", mpeg2ContainerFixturePaths.mov, m2vExtractionOutputPaths.mov, false],
  ["avi-to-m2v", mpeg2ContainerFixturePaths.avi, m2vExtractionOutputPaths.avi, false],
  ["mpeg-ts-to-m2v", mpeg2ContainerFixturePaths["mpeg-ts"], m2vExtractionOutputPaths["mpeg-ts"], false],
] as const) {
  test(`browser FFmpeg losslessly extracts ${route[0]}`, async () => {
    await runMediaRoute(route[0], route[2], ["mpeg2video"], 500_000, route[1], {
      expectedWarningFragments: route[3] ? ["Audio cannot be represented"] : [],
      expectedDurationSeconds: 3.84,
      durationToleranceSeconds: 0.1,
      validate: async (probe, outputPath) => {
        expect(probe.streams).toHaveLength(1);
        await expectDecodedVideoMatch(route[1], outputPath);
      },
    });
  });
}

test("browser FFmpeg losslessly wraps MPEG-4 Part 2 elementary video in MP4", async () => {
  await runMediaRoute(
    "m4v-to-mp4",
    m4vMp4OutputPath,
    ["mpeg4"],
    500_000,
    m4vFixturePath,
    {
      expectedWarningFragments: [],
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.1,
      validate: async (probe, outputPath) => {
        expect(probe.streams).toHaveLength(1);
        await expectDecodedVideoMatch(m4vFixturePath, outputPath);
      },
    },
  );
});

for (const route of [
  ["mkv-to-m4v", m4vContainerFixturePaths.mkv, m4vExtractionOutputPaths.mkv, true],
  ["mp4-to-m4v", m4vContainerFixturePaths.mp4, m4vExtractionOutputPaths.mp4, false],
  ["mov-to-m4v", m4vContainerFixturePaths.mov, m4vExtractionOutputPaths.mov, false],
  ["avi-to-m4v", m4vContainerFixturePaths.avi, m4vExtractionOutputPaths.avi, false],
] as const) {
  test(`browser FFmpeg losslessly extracts ${route[0]}`, async () => {
    await runMediaRoute(route[0], route[2], ["mpeg4"], 500_000, route[1], {
      expectedWarningFragments: route[3] ? ["Audio cannot be represented"] : [],
      expectedDurationSeconds: 3.84,
      durationToleranceSeconds: 0.1,
      validate: async (probe, outputPath) => {
        expect(probe.streams).toHaveLength(1);
        await expectDecodedVideoMatch(route[1], outputPath);
      },
    });
  });
}

test("browser FFmpeg losslessly wraps H.264 elementary video in MP4", async () => {
  await runMediaRoute(
    "h264-to-mp4",
    h264Mp4OutputPath,
    ["h264"],
    500_000,
    h264FixturePath,
    {
      expectedWarningFragments: [],
      expectedDurationSeconds: 3.84,
      durationToleranceSeconds: 0.1,
      validate: async (probe, outputPath) => {
        expect(probe.streams).toHaveLength(1);
        await expectDecodedVideoMatch(h264FixturePath, outputPath);
      },
    },
  );
});

for (const route of [
  ["h264-to-webm", h264WebmOutputPath, "vp8"],
  ["h264-to-webm-vp9", h264Vp9WebmOutputPath, "vp9"],
] as const) {
  test(`browser FFmpeg converts ${route[0]} with bounded optimized workers`, async () => {
    await runMediaRoute(route[0], route[1], [route[2]], 40_000, h264FixturePath, {
      expectedWarningFragments: [],
      expectedDurationSeconds: 3.84,
      durationToleranceSeconds: 0.1,
      validate: validateH264WebmOutput,
    });
  });
}

for (const route of [
  ["mkv-to-h264", fixturePath, h264ExtractionOutputPaths.mkv],
  ["mp4-to-h264", mp4InputFixturePath, h264ExtractionOutputPaths.mp4],
  ["mov-to-h264", movInputFixturePath, h264ExtractionOutputPaths.mov],
  ["3gp-to-h264", threeGpInputFixturePath, h264ExtractionOutputPaths["3gp"]],
  ["mpeg-ts-to-h264", mpegTsInputFixturePath, h264ExtractionOutputPaths["mpeg-ts"]],
  ["flv-to-h264", flvInputFixturePath, h264ExtractionOutputPaths.flv],
] as const) {
  test(`browser FFmpeg losslessly extracts ${route[0]}`, async () => {
    await runMediaRoute(route[0], route[2], ["h264"], 500_000, route[1], {
      expectedWarningFragments: ["Audio cannot be represented"],
      expectedDurationSeconds: 3.84,
      durationToleranceSeconds: 0.1,
      validate: async (probe, outputPath) => {
        expect(probe.streams).toHaveLength(1);
        await expectDecodedVideoMatch(route[1], outputPath);
      },
    });
  });
}

for (const route of [
  ["mkv-to-hevc", hevcContainerFixturePaths.mkv, hevcExtractionOutputPaths.mkv],
  ["mp4-to-hevc", hevcContainerFixturePaths.mp4, hevcExtractionOutputPaths.mp4],
  ["mov-to-hevc", hevcContainerFixturePaths.mov, hevcExtractionOutputPaths.mov],
  [
    "mpeg-ts-to-hevc",
    hevcContainerFixturePaths["mpeg-ts"],
    hevcExtractionOutputPaths["mpeg-ts"],
  ],
] as const) {
  test(`browser FFmpeg losslessly extracts ${route[0]}`, async () => {
    await runMediaRoute(route[0], route[2], ["hevc"], 100_000, route[1], {
      expectedWarningFragments: ["Audio cannot be represented"],
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.15,
      validate: async (probe, outputPath) => {
        expect(probe.streams).toHaveLength(1);
        await expectDecodedVideoMatch(route[1], outputPath);
      },
    });
  });
}

for (const route of [
  ["mp4-to-mkv", mp4InputFixturePath, matroskaOutputPaths.mp4, "h264", "aac"],
  ["mov-to-mkv", movInputFixturePath, matroskaOutputPaths.mov, "h264", "aac"],
  ["3gp-to-mkv", threeGpInputFixturePath, matroskaOutputPaths["3gp"], "h264", "aac"],
  ["mpeg-ts-to-mkv", mpegTsInputFixturePath, matroskaOutputPaths["mpeg-ts"], "h264", "aac"],
  ["flv-to-mkv", flvInputFixturePath, matroskaOutputPaths.flv, "h264", "aac"],
  ["avi-to-mkv", aviInputFixturePath, matroskaOutputPaths.avi, "mpeg4", "mp3"],
  ["webm-to-mkv", av1OpusWebmFixturePath, matroskaOutputPaths.webm, "av1", "opus"],
  ["ogv-to-mkv", ogvFixturePath, matroskaOutputPaths.ogv, "theora", "vorbis"],
] as const) {
  test(`browser FFmpeg losslessly remuxes ${route[0]} with bounded Matroska`, async () => {
    await runMediaRoute(route[0], route[2], [route[3], route[4]], 100_000, route[1], {
      expectedWarningFragments: [],
      skipDurationValidation: route[0] !== "avi-to-mkv",
      validate: async (probe, outputPath) => {
        expect(probe.format.format_name?.split(",")).toContain("matroska");
        expect(probe.streams).toHaveLength(2);
        await expectDecodedVideoMatch(route[1], outputPath);
        if (route[0] === "avi-to-mkv") {
          await expectCompressedAudioPacketMatch(route[1], outputPath);
        } else {
          await expectDecodedPcmMatch(route[1], outputPath);
        }
      },
    });
  });
}

test("Matroska stream copy preserves compatible streams, chapters, and metadata", async () => {
  await runMediaRoute(
    "webm-to-mkv",
    complexMatroskaOutputPath,
    ["h264", "aac", "aac", "subrip", "attachment"],
    400_000,
    complexMatroskaAsWebmFixturePath,
    {
      expectedWarningFragments: [],
      skipDurationValidation: true,
      validate: async (probe, outputPath) => {
        expect(probe.format.format_name?.split(",")).toContain("matroska");
        expect(probe.format.tags?.title).toBe("Within complex remux fixture");
        expect(probe.format.tags?.COMMENT).toBe(
          "Deterministic multi-stream metadata",
        );
        expect(probe.streams.filter((stream) => stream.codec_type === "audio"))
          .toHaveLength(2);
        expect(
          probe.streams
            .filter((stream) => stream.codec_type === "audio")
            .map((stream) => stream.tags?.language),
        ).toEqual(["eng", "spa"]);
        expect(
          probe.streams.find((stream) => stream.codec_type === "subtitle")
            ?.tags?.language,
        ).toBe("fra");
        const attachment = probe.streams.find(
          (stream) => stream.codec_type === "attachment",
        );
        expect(attachment?.tags?.filename).toBe("within-notes.txt");
        expect(attachment?.tags?.mimetype).toBe("text/plain");
        expect(probe.chapters?.map((chapter) => chapter.tags?.title)).toEqual([
          "Opening",
          "Closing",
        ]);
        await expectDecodedVideoMatch(complexFixturePath, outputPath);
        await expectDecodedPcmMatch(complexFixturePath, outputPath);
      },
    },
  );
});

test("Matroska stream copy rejects codecs outside its certified set and cleans up", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page
    .locator('[data-testid="file-input"]')
    .setInputFiles(unsupportedMatroskaFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("avi-to-mkv");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const state = await currentState();
  expect(state.error).toContain(
    "Matroska stream copy received a stream codec outside the certified compatibility set",
  );
  expect(state.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-avi-to-mkv")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

for (const route of [
  ["mkv-to-mpeg-ts", fixturePath, containerMpegTsOutputPaths.mkv],
  ["mp4-to-mpeg-ts", mp4InputFixturePath, containerMpegTsOutputPaths.mp4],
  ["mov-to-mpeg-ts", movInputFixturePath, containerMpegTsOutputPaths.mov],
  ["3gp-to-mpeg-ts", threeGpInputFixturePath, containerMpegTsOutputPaths["3gp"]],
  ["flv-to-mpeg-ts", flvInputFixturePath, containerMpegTsOutputPaths.flv],
] as const) {
  test(`browser FFmpeg losslessly remuxes ${route[0]} with bounded MPEG-TS`, async () => {
    await runMediaRoute(route[0], route[2], ["h264", "aac"], 100_000, route[1], {
      expectedWarningFragments: [],
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.25,
      validate: async (probe, outputPath) => {
        expect(probe.format.format_name?.split(",")).toContain("mpegts");
        expect(probe.streams).toHaveLength(2);
        await expectDecodedVideoMatch(route[1], outputPath);
        await expectAacAccessUnitMatch(route[1], outputPath);
      },
    });
  });
}

test("browser FFmpeg losslessly remuxes HEVC MKV to bounded MPEG-TS", async () => {
  await runMediaRoute(
    "mkv-to-mpeg-ts",
    containerMpegTsOutputPaths.mkv,
    ["hevc", "aac"],
    100_000,
    hevcContainerFixturePaths.mkv,
    {
      expectedWarningFragments: [],
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.3,
      validate: async (probe, outputPath) => {
        expect(probe.format.format_name?.split(",")).toContain("mpegts");
        expect(probe.streams).toHaveLength(2);
        await expectDecodedVideoMatch(hevcContainerFixturePaths.mkv, outputPath);
        await expectAacAccessUnitMatch(hevcContainerFixturePaths.mkv, outputPath);
      },
    },
  );
});

test("MPEG-TS stream copy rejects incompatible audio and cleans up", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page
    .locator('[data-testid="file-input"]')
    .setInputFiles(incompatibleFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mpeg-ts");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const state = await currentState();
  expect(state.error).toContain(
    "MPEG-TS stream copy accepts H.264 or HEVC video with AAC audio",
  );
  expect(state.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-mkv-to-mpeg-ts")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
});

for (const route of [
  ["mkv-to-3gp", fixturePath, containerThreeGpOutputPaths.mkv, false],
  ["mp4-to-3gp", mp4InputFixturePath, containerThreeGpOutputPaths.mp4, false],
  ["mov-to-3gp", movInputFixturePath, containerThreeGpOutputPaths.mov, false],
  ["mpeg-ts-to-3gp", mpegTsInputFixturePath, containerThreeGpOutputPaths["mpeg-ts"], true],
  ["flv-to-3gp", flvInputFixturePath, containerThreeGpOutputPaths.flv, false],
] as const) {
  test(`browser FFmpeg losslessly remuxes ${route[0]} with bounded 3GP`, async () => {
    await runMediaRoute(route[0], route[2], ["h264", "aac"], 100_000, route[1], {
      expectedWarningFragments: [],
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.25,
      validate: async (probe, outputPath) => {
        expect(probe.format.format_name?.split(",")).toContain("3gp");
        expect(probe.format.tags?.major_brand).toBe("3gp6");
        expect(probe.streams).toHaveLength(2);
        await expectDecodedVideoMatch(route[1], outputPath);
        await expectIsoBmffAacPacketMatch(route[1], outputPath, route[3]);
      },
    });
  });
}

for (const rejection of [
  ["incompatible audio", incompatibleFixturePath],
  ["HEVC video", hevcContainerFixturePaths.mkv],
] as const) {
  test(`3GP stream copy rejects ${rejection[0]} and cleans up`, async () => {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(rejection[1]);
    await page.locator('[data-testid="format-select"]').selectOption("mkv-to-3gp");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error).toContain(
      "3GP stream copy accepts H.264 video with AAC audio",
    );
    expect(state.opfsName).toBeNull();
    const leftovers = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-test-mkv-to-3gp")) names.push(name);
      }
      return names;
    });
    expect(leftovers).toEqual([]);
  });
}

for (const route of [
  ["mkv-to-mov", fixturePath, containerMovOutputPaths.mkv, false],
  ["mp4-to-mov", mp4InputFixturePath, containerMovOutputPaths.mp4, false],
  ["3gp-to-mov", threeGpInputFixturePath, containerMovOutputPaths["3gp"], false],
  ["mpeg-ts-to-mov", mpegTsInputFixturePath, containerMovOutputPaths["mpeg-ts"], true],
  ["flv-to-mov", flvInputFixturePath, containerMovOutputPaths.flv, false],
] as const) {
  test(`browser FFmpeg losslessly remuxes ${route[0]} with bounded MOV`, async () => {
    await runMediaRoute(route[0], route[2], ["h264", "aac"], 100_000, route[1], {
      expectedWarningFragments: [],
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.25,
      validate: async (probe, outputPath) => {
        expect(probe.format.format_name?.split(",")).toContain("mov");
        expect(probe.format.tags?.major_brand).toBe("qt  ");
        expect(probe.streams).toHaveLength(2);
        await expectDecodedVideoMatch(route[1], outputPath);
        await expectIsoBmffAacPacketMatch(route[1], outputPath, route[3]);
      },
    });
  });
}

test("browser FFmpeg losslessly remuxes HEVC MKV to bounded MOV", async () => {
  await runMediaRoute(
    "mkv-to-mov",
    containerMovOutputPaths.mkv,
    ["hevc", "aac"],
    100_000,
    hevcContainerFixturePaths.mkv,
    {
      expectedWarningFragments: [],
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.3,
      validate: async (probe, outputPath) => {
        expect(probe.format.format_name?.split(",")).toContain("mov");
        expect(probe.format.tags?.major_brand).toBe("qt  ");
        expect(probe.streams).toHaveLength(2);
        await expectDecodedVideoMatch(hevcContainerFixturePaths.mkv, outputPath);
        await expectIsoBmffAacPacketMatch(
          hevcContainerFixturePaths.mkv,
          outputPath,
          false,
        );
      },
    },
  );
});

for (const rejection of [
  ["incompatible audio", incompatibleFixturePath],
  ["MPEG-4 Part 2 video", m4vContainerFixturePaths.mkv],
] as const) {
  test(`MOV stream copy rejects ${rejection[0]} and cleans up`, async () => {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(rejection[1]);
    await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mov");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error).toContain(
      "MOV stream copy accepts H.264 or HEVC video with AAC audio",
    );
    expect(state.opfsName).toBeNull();
    const leftovers = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-test-mkv-to-mov")) names.push(name);
      }
      return names;
    });
    expect(leftovers).toEqual([]);
  });
}

for (const route of [
  ["mkv-to-flv", fixturePath, containerFlvOutputPaths.mkv],
  ["mp4-to-flv", mp4InputFixturePath, containerFlvOutputPaths.mp4],
  ["mov-to-flv", movInputFixturePath, containerFlvOutputPaths.mov],
  ["3gp-to-flv", threeGpInputFixturePath, containerFlvOutputPaths["3gp"]],
  [
    "mpeg-ts-to-flv",
    mpegTsInputFixturePath,
    containerFlvOutputPaths["mpeg-ts"],
  ],
] as const) {
  test(`browser FFmpeg losslessly remuxes ${route[0]} with bounded FLV`, async () => {
    await runMediaRoute(route[0], route[2], ["h264", "aac"], 100_000, route[1], {
      expectedWarningFragments: ["FLV cannot reliably represent"],
      expectedDurationSeconds: 4,
      durationToleranceSeconds: 0.25,
      validate: async (probe, outputPath) => {
        expect(probe.format.format_name?.split(",")).toContain("flv");
        expect(probe.streams).toHaveLength(2);
        await expectDecodedVideoMatch(route[1], outputPath);
        await expectAacAccessUnitMatch(route[1], outputPath);
      },
    });
  });
}

for (const rejection of [
  ["incompatible audio", incompatibleFixturePath],
  ["MPEG-4 Part 2 video", m4vContainerFixturePaths.mkv],
] as const) {
  test(`FLV stream copy rejects ${rejection[0]} and cleans up`, async () => {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(rejection[1]);
    await page.locator('[data-testid="format-select"]').selectOption("mkv-to-flv");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error).toContain(
      "FLV stream copy accepts H.264 video with AAC audio",
    );
    expect(state.opfsName).toBeNull();
    const leftovers = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-test-mkv-to-flv")) names.push(name);
      }
      return names;
    });
    expect(leftovers).toEqual([]);
  });
}

test("MKV to H.264 extracts only the first video and discloses additional streams", async () => {
  await runMediaRoute(
    "mkv-to-h264",
    h264ExtractionOutputPaths.mkv,
    ["h264"],
    30_000,
    multiVideoFixturePath,
    {
      expectedWarningFragments: [
        "Audio cannot be represented",
        "additional video stream",
      ],
      expectedDurationSeconds: 1.92,
      durationToleranceSeconds: 0.1,
      validate: async (probe, outputPath) => {
        expect(probe.streams).toHaveLength(1);
        await expectDecodedVideoMatch(multiVideoFixturePath, outputPath);
      },
    },
  );
});

declare global {
  interface Window {
    __withinMediaValidationChunk(base64: string): Promise<void>;
  }
}
