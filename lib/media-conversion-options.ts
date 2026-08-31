export const MP3_BIT_RATES_BPS = [
  64_000,
  96_000,
  128_000,
  192_000,
  256_000,
  320_000,
] as const;

export const MP3_SAMPLE_RATES_HZ = [32_000, 44_100, 48_000] as const;

export const OPUS_SAMPLE_RATES_HZ = [24_000, 48_000] as const;
export const AUDIO_CODECS = [
  "automatic",
  "mp3",
  "aac",
  "opus",
  "vorbis",
  "wma",
  "amr",
  "flac",
  "alac",
  "pcm",
] as const;
export const AUDIO_QUALITIES = [
  "automatic",
  "smaller",
  "balanced",
  "higher",
] as const;
export const AUDIO_COMPRESSION_MODES = [
  "automatic",
  "lossy",
  "lossless",
] as const;

export type Mp3BitRateBps = 0 | (typeof MP3_BIT_RATES_BPS)[number];
export type Mp3SampleRateHz = 0 | (typeof MP3_SAMPLE_RATES_HZ)[number];
export type AudioSampleRateHz =
  | Mp3SampleRateHz
  | (typeof OPUS_SAMPLE_RATES_HZ)[number];
export type AudioChannelCount = 0 | 1 | 2;
export type AudioCodec = (typeof AUDIO_CODECS)[number];
export type AudioQuality = (typeof AUDIO_QUALITIES)[number];
export type AudioCompressionMode = (typeof AUDIO_COMPRESSION_MODES)[number];

export interface AudioConversionOptions {
  /** Automatic retains the selected route's certified codec. */
  codec: AudioCodec;
  /** Automatic retains the selected route's certified compression class. */
  compression: AudioCompressionMode;
  /** Zero retains the route's certified automatic policy. */
  bitRateBps: Mp3BitRateBps;
  /** Zero retains the route's certified automatic policy. */
  sampleRateHz: AudioSampleRateHz;
  /** Zero retains the source up to the route's certified stereo ceiling. */
  channels: AudioChannelCount;
  /** Automatic retains the route's fastest certified quality policy. */
  quality: AudioQuality;
}

export const VIDEO_MAX_WIDTHS = [320, 480, 640] as const;
export const VIDEO_BIT_RATES_BPS = [
  300_000,
  600_000,
  1_000_000,
  2_000_000,
  4_000_000,
] as const;
export const VIDEO_FRAME_RATES_FPS = [15, 24, 25, 30] as const;
export const VIDEO_CODECS = ["automatic", "vp8", "vp9", "mpeg4"] as const;
export const VIDEO_QUALITIES = [
  "automatic",
  "smaller",
  "balanced",
  "higher",
] as const;

export type VideoMaxWidth = 0 | (typeof VIDEO_MAX_WIDTHS)[number];
export type VideoBitRateBps = 0 | (typeof VIDEO_BIT_RATES_BPS)[number];
export type VideoFrameRateFps = 0 | (typeof VIDEO_FRAME_RATES_FPS)[number];
export type VideoCodec = (typeof VIDEO_CODECS)[number];
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];

export interface VideoConversionOptions {
  /** Automatic retains the selected route's certified encoder. */
  codec: VideoCodec;
  /** Zero retains the route policy. A custom value is a no-upscale width cap. */
  maxWidth: VideoMaxWidth;
  /** Zero retains the route's certified bitrate. */
  bitRateBps: VideoBitRateBps;
  /** Zero retains source-average timing. A custom value is a no-upconvert cap. */
  frameRateFps: VideoFrameRateFps;
  /** Automatic retains the route's fastest certified quality policy. */
  quality: VideoQuality;
}

export const DEFAULT_AUDIO_CONVERSION_OPTIONS: AudioConversionOptions = {
  codec: "automatic",
  compression: "automatic",
  bitRateBps: 0,
  sampleRateHz: 0,
  channels: 0,
  quality: "automatic",
};

export const DEFAULT_VIDEO_CONVERSION_OPTIONS: VideoConversionOptions = {
  codec: "automatic",
  maxWidth: 0,
  bitRateBps: 0,
  frameRateFps: 0,
  quality: "automatic",
};

export const VIDEO_PROFILE_DEFAULT_CODEC_BY_ID = {
  "mkv-to-webm": "vp8",
  "mp4-to-webm": "vp8",
  "mov-to-webm": "vp8",
  "3gp-to-webm": "vp8",
  "mpeg-ts-to-webm": "vp8",
  "flv-to-webm": "vp8",
  "avi-to-webm": "vp8",
  "ogv-to-webm": "vp8",
  "m2v-to-webm": "vp8",
  "h264-to-webm": "vp8",
  "mkv-to-webm-vp9": "vp9",
  "mp4-to-webm-vp9": "vp9",
  "mov-to-webm-vp9": "vp9",
  "3gp-to-webm-vp9": "vp9",
  "mpeg-ts-to-webm-vp9": "vp9",
  "flv-to-webm-vp9": "vp9",
  "avi-to-webm-vp9": "vp9",
  "ogv-to-webm-vp9": "vp9",
  "m2v-to-webm-vp9": "vp9",
  "h264-to-webm-vp9": "vp9",
  "mkv-to-mp4-mpeg4": "mpeg4",
  "m2v-to-mp4-mpeg4": "mpeg4",
} as const satisfies Readonly<Record<string, Exclude<VideoCodec, "automatic">>>;

const MP3_BIT_RATE_SET = new Set<number>(MP3_BIT_RATES_BPS);
const MP3_SAMPLE_RATE_SET = new Set<number>(MP3_SAMPLE_RATES_HZ);
const OPUS_SAMPLE_RATE_SET = new Set<number>(OPUS_SAMPLE_RATES_HZ);
const AUDIO_CODEC_SET = new Set<string>(AUDIO_CODECS);
const AUDIO_QUALITY_SET = new Set<string>(AUDIO_QUALITIES);
const AUDIO_COMPRESSION_SET = new Set<string>(AUDIO_COMPRESSION_MODES);
const VIDEO_MAX_WIDTH_SET = new Set<number>(VIDEO_MAX_WIDTHS);
const VIDEO_BIT_RATE_SET = new Set<number>(VIDEO_BIT_RATES_BPS);
const VIDEO_FRAME_RATE_SET = new Set<number>(VIDEO_FRAME_RATES_FPS);
const VIDEO_QUALITY_SET = new Set<string>(VIDEO_QUALITIES);

export function supportsMp3EncodingOptions(
  profile: { engine: string; output: string } | null,
): boolean {
  return profile?.engine === "ffmpeg-audio" && profile.output === "mp3";
}

type AudioOptionProfile = {
  engine: string;
  output: string;
  id?: string;
};

const AUDIO_CODEC_BY_OUTPUT = {
  mp3: "mp3",
  aac: "aac",
  m4a: "aac",
  opus: "opus",
  ogg: "vorbis",
  wma: "wma",
  amr: "amr",
  flac: "flac",
  alac: "alac",
  wav: "pcm",
  aiff: "pcm",
} as const satisfies Readonly<Record<string, Exclude<AudioCodec, "automatic">>>;

const LOSSLESS_AUDIO_CODECS = new Set<AudioCodec>(["flac", "alac", "pcm"]);
const QUALITY_AUDIO_CODECS = new Set<AudioCodec>([
  "mp3",
  "aac",
  "opus",
  "vorbis",
  "wma",
]);
const BIT_RATE_AUDIO_CODECS = new Set<AudioCodec>([
  "mp3",
  "aac",
  "opus",
  "wma",
]);

export function audioCodecForProfile(
  profile: AudioOptionProfile | null,
): Exclude<AudioCodec, "automatic"> | null {
  if (profile?.engine !== "ffmpeg-audio") return null;
  return (
    AUDIO_CODEC_BY_OUTPUT[
      profile.output as keyof typeof AUDIO_CODEC_BY_OUTPUT
    ] ?? null
  );
}

export function audioCompressionForCodec(
  codec: AudioCodec,
): Exclude<AudioCompressionMode, "automatic"> | null {
  if (codec === "automatic") return null;
  return LOSSLESS_AUDIO_CODECS.has(codec) ? "lossless" : "lossy";
}

export function supportsAudioEncodingOptions(
  profile: AudioOptionProfile | null,
): boolean {
  return audioCodecForProfile(profile) !== null;
}

export function audioBitRatesForCodec(codec: AudioCodec): readonly Mp3BitRateBps[] {
  return BIT_RATE_AUDIO_CODECS.has(codec) ? MP3_BIT_RATES_BPS : [];
}

export function audioSampleRatesForCodec(
  codec: AudioCodec,
): readonly number[] {
  if (codec === "amr") return [];
  return codec === "opus" ? OPUS_SAMPLE_RATES_HZ : MP3_SAMPLE_RATES_HZ;
}

export function supportsVideoEncodingOptions(
  profile: { engine: string; output: string } | null,
): boolean {
  return (
    profile?.engine === "ffmpeg-video" &&
    (profile.output === "webm" ||
      profile.output === "webm-vp9" ||
      profile.output === "mp4-mpeg4")
  );
}

export function videoOptionProfileForId(
  profileId: string,
): { engine: string; output: string } | null {
  const codec =
    VIDEO_PROFILE_DEFAULT_CODEC_BY_ID[
      profileId as keyof typeof VIDEO_PROFILE_DEFAULT_CODEC_BY_ID
    ];
  if (!codec) return null;
  return {
    engine: "ffmpeg-video",
    output:
      codec === "mpeg4" ? "mp4-mpeg4" : codec === "vp9" ? "webm-vp9" : "webm",
  };
}

export function validateVideoConversionOptions(
  profile: { engine: string; output: string },
  options?: VideoConversionOptions,
): VideoConversionOptions {
  if (!options) return DEFAULT_VIDEO_CONVERSION_OPTIONS;
  if (!supportsVideoEncodingOptions(profile)) {
    throw new Error("Video encoding options are not supported by this profile.");
  }
  const webm = profile.output === "webm" || profile.output === "webm-vp9";
  if (
    options.codec !== "automatic" &&
    ((webm && options.codec !== "vp8" && options.codec !== "vp9") ||
      (!webm && options.codec !== "mpeg4"))
  ) {
    throw new Error(
      webm
        ? "WebM codec must be automatic, VP8, or VP9."
        : "MP4 MPEG-4 codec must be automatic or MPEG-4 Part 2.",
    );
  }
  if (options.maxWidth !== 0 && !VIDEO_MAX_WIDTH_SET.has(options.maxWidth)) {
    throw new Error("Video width must be automatic or capped at 320, 480, or 640 pixels.");
  }
  if (
    options.bitRateBps !== 0 &&
    !VIDEO_BIT_RATE_SET.has(options.bitRateBps)
  ) {
    throw new Error("Video bitrate must be automatic or 300-4,000 kb/s.");
  }
  if (
    options.frameRateFps !== 0 &&
    !VIDEO_FRAME_RATE_SET.has(options.frameRateFps)
  ) {
    throw new Error("Video frame-rate cap must be automatic, 15, 24, 25, or 30 fps.");
  }
  if (!VIDEO_QUALITY_SET.has(options.quality)) {
    throw new Error("Video quality must be automatic, smaller, balanced, or higher.");
  }
  return {
    codec: options.codec,
    maxWidth: options.maxWidth,
    bitRateBps: options.bitRateBps,
    frameRateFps: options.frameRateFps,
    quality: options.quality,
  };
}

export function videoCodecCode(codec: VideoCodec): number {
  return codec === "vp8" ? 1 : codec === "vp9" ? 2 : codec === "mpeg4" ? 3 : 0;
}

export function videoQualityCode(quality: VideoQuality): number {
  return quality === "smaller" ? 1 : quality === "balanced" ? 2 : quality === "higher" ? 3 : 0;
}

export function validateAudioConversionOptions(
  profile: AudioOptionProfile,
  options?: AudioConversionOptions,
): AudioConversionOptions {
  if (!options) return DEFAULT_AUDIO_CONVERSION_OPTIONS;
  const profileCodec = audioCodecForProfile(profile);
  if (!profileCodec) {
    throw new Error("Audio encoding options are not supported by this profile.");
  }
  if (!AUDIO_CODEC_SET.has(options.codec)) {
    throw new Error("Audio codec is outside the bounded allowlist.");
  }
  if (options.codec !== "automatic" && options.codec !== profileCodec) {
    throw new Error(`Selected audio codec does not match the ${profileCodec} output profile.`);
  }
  if (!AUDIO_COMPRESSION_SET.has(options.compression)) {
    throw new Error("Audio compression must be automatic, lossy, or lossless.");
  }
  const profileCompression = audioCompressionForCodec(profileCodec);
  if (
    options.compression !== "automatic" &&
    options.compression !== profileCompression
  ) {
    throw new Error(
      `Selected ${options.compression} compression does not match the ${profileCodec} codec.`,
    );
  }
  if (!AUDIO_QUALITY_SET.has(options.quality)) {
    throw new Error("Audio quality must be automatic, smaller, balanced, or higher.");
  }
  if (
    options.quality !== "automatic" &&
    !QUALITY_AUDIO_CODECS.has(profileCodec)
  ) {
    throw new Error(`${profileCodec} does not expose a lossy quality policy.`);
  }
  if (
    options.bitRateBps !== 0 &&
    (!BIT_RATE_AUDIO_CODECS.has(profileCodec) ||
      !MP3_BIT_RATE_SET.has(options.bitRateBps))
  ) {
    throw new Error(
      `${profileCodec} bitrate must be automatic or an allowlisted 64-320 kb/s value.`,
    );
  }
  if (
    options.sampleRateHz !== 0 &&
    (profileCodec === "amr" ||
      !(profileCodec === "opus" ? OPUS_SAMPLE_RATE_SET : MP3_SAMPLE_RATE_SET).has(
        options.sampleRateHz,
      ))
  ) {
    throw new Error(
      profileCodec === "opus"
        ? "Opus sample rate must be automatic, 24, or 48 kHz."
        : `${profileCodec} sample rate must be automatic, 32, 44.1, or 48 kHz.`,
    );
  }
  if (
    options.channels !== 0 &&
    (profileCodec === "amr" ||
      (options.channels !== 1 && options.channels !== 2))
  ) {
    throw new Error(
      `${profileCodec} channel layout must be automatic${profileCodec === "amr" ? " (fixed mono)" : ", mono, or stereo"}.`,
    );
  }
  return {
    codec: options.codec,
    compression: options.compression,
    bitRateBps: options.bitRateBps,
    sampleRateHz: options.sampleRateHz,
    channels: options.channels,
    quality: options.quality,
  };
}

export function audioCodecCode(codec: AudioCodec): number {
  return codec === "mp3"
    ? 1
    : codec === "aac"
      ? 2
      : codec === "opus"
        ? 3
        : codec === "vorbis"
          ? 4
          : codec === "flac"
            ? 5
            : codec === "alac"
              ? 6
              : codec === "pcm"
                ? 7
                : codec === "wma"
                  ? 8
                  : codec === "amr"
                    ? 9
                    : 0;
}

export function audioQualityCode(quality: AudioQuality): number {
  return quality === "smaller"
    ? 1
    : quality === "balanced"
      ? 2
      : quality === "higher"
        ? 3
        : 0;
}

export function audioCompressionCode(compression: AudioCompressionMode): number {
  return compression === "lossy" ? 1 : compression === "lossless" ? 2 : 0;
}
