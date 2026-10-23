/** Unpublished route policy, not registry publication or memory acceptance. */
import type { AudioConversionOptions, VideoConversionOptions } from "./media-conversion-options";
export const MPEG2_JOB_PROFILE = "mkv-to-mp4-mpeg2" as const;
export const MPEG2_VIDEO_BIT_RATE_BPS = 4_000_000;

// Shared by preflight planning and the native runtime; never silently discard
// a setting the currently qualified native pair cannot honor.
export function assertMpeg2Options(audio?: AudioConversionOptions, video?: VideoConversionOptions): void {
  if (audio && (audio.codec !== "automatic" || audio.compression !== "automatic" ||
      audio.bitRateBps !== 0 || audio.sampleRateHz !== 0 || audio.channels !== 0 || audio.quality !== "automatic")) {
    throw new Error("MPEG-2 currently copies compatible audio; audio re-encoding settings are not implemented for this route.");
  }
  if (video && (video.codec !== "automatic" || video.maxWidth !== 0 ||
      (video.bitRateBps !== 0 && video.bitRateBps !== MPEG2_VIDEO_BIT_RATE_BPS) || video.frameRateFps !== 0 || video.quality !== "automatic")) {
    throw new Error("MPEG-2 currently requires source dimensions/timing, 4 Mbps and automatic quality; other settings are not yet qualified.");
  }
}

export function estimateMpeg2StageBytes(sourceBytes: number, durationSeconds: number | null): number {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0 ||
      durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("MPEG-2 staging requires a valid source size and a duration from bounded source inspection.");
  }
  // Source bytes conservatively cover all copied streams/attachments. Add the
  // selected video bitrate with25% planning headroom plus bounded mux metadata.
  // This is a quota estimate, NOT an encoder output-size cap or quality change.
  const bytes = Math.ceil(sourceBytes + durationSeconds * MPEG2_VIDEO_BIT_RATE_BPS / 8 * 1.25 + 16 * 1024 * 1024);
  if (!Number.isSafeInteger(bytes) || bytes < sourceBytes) throw new Error("MPEG-2 staging estimate exceeds safe integer bounds.");
  return bytes;
}
