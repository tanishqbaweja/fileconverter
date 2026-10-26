/** Keep the measured small-file synchronous path unchanged. Above this fixed
 * ceiling, this exact private route uses the existing seekable BYOB reader so
 * transient slice allocations cannot scale with its input size. No codec,
 * quality, output, read-size or Wasm-memory policy is changed here.
 */
export const VORBIS_SYNCHRONOUS_INPUT_CEILING_BYTES = 8 * 1024 * 1024;
export function requiresPersistentVorbisInput(profileId: string, nativeProfile: number, bytes: number): boolean {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new TypeError("Invalid bounded audio source size.");
  return profileId === "opus-to-ogg" && nativeProfile === 33 && bytes > VORBIS_SYNCHRONOUS_INPUT_CEILING_BYTES;
}
