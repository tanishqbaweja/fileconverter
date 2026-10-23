/** Unpublished route policy, not registry publication or memory acceptance. */
import type { AudioConversionOptions, VideoConversionOptions } from "./media-conversion-options";
import { VIDEO_MAX_WIDTHS, VIDEO_BIT_RATES_BPS, VIDEO_FRAME_RATES_FPS, VIDEO_QUALITIES } from "./media-conversion-options.ts";
export const MPEG2_JOB_PROFILE = "mkv-to-mp4-mpeg2" as const;
export const MPEG2_VIDEO_BIT_RATE_BPS = 4_000_000;

// Shared by preflight planning and the native runtime; never silently discard
// a setting the currently qualified native pair cannot honor.
export function assertMpeg2Options(audio?: AudioConversionOptions, video?: VideoConversionOptions): void {
  if (audio && (audio.codec !== "automatic" || audio.compression !== "automatic" ||
      audio.bitRateBps !== 0 || audio.sampleRateHz !== 0 || audio.channels !== 0 || audio.quality !== "automatic")) {
    throw new Error("MPEG-2 currently copies compatible audio; audio re-encoding settings are not implemented for this route.");
  }
  if (video && (video.codec !== "automatic" ||
      (video.maxWidth !== 0 && !VIDEO_MAX_WIDTHS.includes(video.maxWidth)) ||
      (video.bitRateBps !== 0 && !VIDEO_BIT_RATES_BPS.includes(video.bitRateBps)) ||
      (video.frameRateFps !== 0 && !VIDEO_FRAME_RATES_FPS.includes(video.frameRateFps)) || !VIDEO_QUALITIES.includes(video.quality))) {
    throw new Error("Unsupported private MPEG-2 video options; use an allowlisted width, bitrate, frame-rate cap and quality with the automatic MPEG-2 codec.");
  }
}

export function mpeg2QuantizerBounds(quality: VideoConversionOptions["quality"]): readonly [number, number] {
  if (!VIDEO_QUALITIES.includes(quality)) throw new Error("Unsupported private MPEG-2 quality");
  return quality === "smaller" ? [8, 31] : quality === "higher" ? [2, 12] : [4, 20];
}

/** Preserve the qualified automatic4Mbps policy; only requested controls vary.
 * Audio conversion and codec substitution remain unavailable to this kernel. */
export function mapMpeg2NativeArguments(args: readonly number[]): number[] {
  if (!Array.isArray(args) || args.length !== 12 || args[0] !== 40 ||
      Array.from(args).some((value, index) => !Number.isSafeInteger(value) || (index > 0 && index < 8 && value !== 0)) ||
      args[11] < 0 || args[11] >= VIDEO_QUALITIES.length)
    throw new Error("MPEG-2 requires explicit profile 40 and its twelve supported arguments.");
  const video = { codec: "automatic", maxWidth: args[8], bitRateBps: args[9], frameRateFps: args[10],
    quality: VIDEO_QUALITIES[args[11]] } as VideoConversionOptions;
  assertMpeg2Options(undefined, video);
  const mapped = [...args]; mapped[0] = 6; mapped[9] ||= MPEG2_VIDEO_BIT_RATE_BPS; return mapped;
}

export function estimateMpeg2StageBytes(sourceBytes: number, durationSeconds: number | null, bitRateBps = 0): number {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0 ||
      durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("MPEG-2 staging requires a valid source size and a duration from bounded source inspection.");
  }
  if (bitRateBps !== 0 && !(VIDEO_BIT_RATES_BPS as readonly number[]).includes(bitRateBps)) throw new Error("Invalid MPEG-2 staging bitrate");
  // Source bytes conservatively cover all copied streams/attachments. Add the
  // selected video bitrate with25% planning headroom plus bounded mux metadata.
  // This is a quota estimate, NOT an encoder output-size cap or quality change.
  const bytes = Math.ceil(sourceBytes + durationSeconds * (bitRateBps || MPEG2_VIDEO_BIT_RATE_BPS) / 8 * 1.25 + 16 * 1024 * 1024);
  if (!Number.isSafeInteger(bytes) || bytes < sourceBytes) throw new Error("MPEG-2 staging estimate exceeds safe integer bounds.");
  return bytes;
}
