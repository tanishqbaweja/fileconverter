/** Unpublished route policy, not registry publication or memory acceptance. */
export const MPEG2_JOB_PROFILE = "mkv-to-mp4-mpeg2" as const;
export const MPEG2_VIDEO_BIT_RATE_BPS = 4_000_000;

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
