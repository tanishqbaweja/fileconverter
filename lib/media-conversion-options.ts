export const MP3_BIT_RATES_BPS = [
  64_000,
  96_000,
  128_000,
  192_000,
  256_000,
  320_000,
] as const;

export const MP3_SAMPLE_RATES_HZ = [32_000, 44_100, 48_000] as const;

export type Mp3BitRateBps = 0 | (typeof MP3_BIT_RATES_BPS)[number];
export type Mp3SampleRateHz = 0 | (typeof MP3_SAMPLE_RATES_HZ)[number];
export type AudioChannelCount = 0 | 1 | 2;

export interface AudioConversionOptions {
  /** Zero retains the route's certified automatic policy. */
  bitRateBps: Mp3BitRateBps;
  /** Zero retains the route's certified automatic policy. */
  sampleRateHz: Mp3SampleRateHz;
  /** Zero retains the source up to the route's certified stereo ceiling. */
  channels: AudioChannelCount;
}

export const DEFAULT_AUDIO_CONVERSION_OPTIONS: AudioConversionOptions = {
  bitRateBps: 0,
  sampleRateHz: 0,
  channels: 0,
};

const MP3_BIT_RATE_SET = new Set<number>(MP3_BIT_RATES_BPS);
const MP3_SAMPLE_RATE_SET = new Set<number>(MP3_SAMPLE_RATES_HZ);

export function supportsMp3EncodingOptions(
  profile: { engine: string; output: string } | null,
): boolean {
  return profile?.engine === "ffmpeg-audio" && profile.output === "mp3";
}

export function validateAudioConversionOptions(
  profile: { engine: string; output: string },
  options?: AudioConversionOptions,
): AudioConversionOptions {
  if (!options) return DEFAULT_AUDIO_CONVERSION_OPTIONS;
  if (!supportsMp3EncodingOptions(profile)) {
    throw new Error("Audio encoding options are not supported by this profile.");
  }
  if (
    options.bitRateBps !== 0 &&
    !MP3_BIT_RATE_SET.has(options.bitRateBps)
  ) {
    throw new Error("MP3 bitrate must be automatic or 64-320 kb/s.");
  }
  if (
    options.sampleRateHz !== 0 &&
    !MP3_SAMPLE_RATE_SET.has(options.sampleRateHz)
  ) {
    throw new Error("MP3 sample rate must be automatic, 32, 44.1, or 48 kHz.");
  }
  if (options.channels !== 0 && options.channels !== 1 && options.channels !== 2) {
    throw new Error("MP3 channel layout must be automatic, mono, or stereo.");
  }
  return {
    bitRateBps: options.bitRateBps,
    sampleRateHz: options.sampleRateHz,
    channels: options.channels,
  };
}
