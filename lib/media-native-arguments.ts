export type MediaNativeAbi = "general-12" | "legacy-specialist-9";
/** Keep the three advanced audio arguments out of legacy specialist calls,
 * and present in every call to a general core, including video jobs. */
export function mediaNativeArguments(profile: number, audio: readonly number[], advancedAudio: readonly number[], video: readonly number[], abi: MediaNativeAbi): number[] {
  if (!Number.isInteger(profile) || profile < 1 || profile > 40 || audio.length !== 3 || advancedAudio.length !== 3 || video.length !== 5 ||
      [...audio, ...advancedAudio, ...video].some(value => !Number.isInteger(value) || value < 0 || value > 0x7fffffff) ||
      (abi !== "general-12" && abi !== "legacy-specialist-9")) throw new TypeError("Invalid native media arguments or ABI.");
  if (abi === "legacy-specialist-9" && advancedAudio.some(value => value !== 0)) throw new Error("Legacy video specialists cannot accept advanced audio options.");
  return [profile, ...audio, ...(abi === "general-12" ? advancedAudio : []), ...video];
}
