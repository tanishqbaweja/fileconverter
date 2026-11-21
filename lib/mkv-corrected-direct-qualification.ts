// Explicit private route variation. The affected public profile stays withheld.
export const CORRECTED_DIRECT_MKV_QUERY = "mkv-direct";
export const CORRECTED_DIRECT_MKV_PROFILE = "mkv-to-mp4";
export const CORRECTED_DIRECT_MKV_CORE = Object.freeze({
  module: "/engines/remux-qualification/mkv-header-41c4a075.mjs",
  wasm: "/engines/remux-qualification/mkv-header-41c4a075.wasm",
});
export const CORRECTED_DIRECT_MKV_WRITE_BYTES = 1024 * 1024;

export function requireCorrectedDirectMkvQualification(
  requested: unknown, hostname: string, profileId: string, destinationMode: string,
): boolean {
  if (requested === undefined) return false;
  if (requested !== true || !["127.0.0.1", "localhost", "[::1]"].includes(hostname) ||
      profileId !== CORRECTED_DIRECT_MKV_PROFILE || destinationMode !== "handle") {
    throw new Error("Corrected direct MKV qualification requires localhost, MKV to MP4, and a selected file handle.");
  }
  return true;
}
