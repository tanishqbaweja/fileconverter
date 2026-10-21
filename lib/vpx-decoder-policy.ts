import type { MediaSourceInspection } from "./media-source-inspection";
import { DEFAULT_AUDIO_CONVERSION_OPTIONS, validateVideoConversionOptions, type AudioConversionOptions, type VideoConversionOptions } from "./media-conversion-options";

export const VPX_JOB_PROFILES = ["mkv-vp8-to-mp4-mpeg4", "mkv-vp9-to-mp4-mpeg4"] as const;
export type VpxDecoderProfile = typeof VPX_JOB_PROFILES[number];
export type VpxSourceCodec = "VP8" | "VP9";
export function isVpxDecoderProfile(profileId: string): profileId is VpxDecoderProfile {
  return (VPX_JOB_PROFILES as readonly string[]).includes(profileId);
}
export function vpxCodecForProfile(profileId: string): VpxSourceCodec | null {
  return profileId === VPX_JOB_PROFILES[0] ? "VP8" : profileId === VPX_JOB_PROFILES[1] ? "VP9" : null;
}
export function validateVpxVideoOptions(audio?: AudioConversionOptions, video?: VideoConversionOptions): VideoConversionOptions {
  if (audio && Object.entries(DEFAULT_AUDIO_CONVERSION_OPTIONS).some(([key, value]) => audio[key as keyof AudioConversionOptions] !== value)) {
    throw new Error("The private VPX video route does not accept audio encoding options.");
  }
  return validateVideoConversionOptions({ engine: "ffmpeg-video", output: "mp4-mpeg4" }, video);
}
export function assertVpxSource(profileId: string, inspection: MediaSourceInspection | null): VpxSourceCodec {
  const expected = vpxCodecForProfile(profileId);
  const video = inspection?.streams?.find(stream => stream.mediaType === "video");
  if (!expected || (video?.codec ?? inspection?.codec) !== expected) {
    throw new Error("The private VPX route requires its matching VP8 or VP9 video source from bounded inspection.");
  }
  return expected;
}
export function estimateVpxStageBytes(sourceBytes: number, durationSeconds: number | null, video: VideoConversionOptions): number {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0 || durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("VPX staging requires a valid source size and inspected duration.");
  }
  const options = validateVpxVideoOptions(undefined, video);
  const bytes = Math.ceil(sourceBytes + durationSeconds * (options.bitRateBps || 4_000_000) / 8 * 1.25 + 16 * 1024 * 1024);
  if (!Number.isSafeInteger(bytes) || bytes < sourceBytes) throw new Error("VPX staging estimate exceeds safe integer bounds.");
  return bytes;
}
