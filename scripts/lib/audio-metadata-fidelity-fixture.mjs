// Deterministic, small diagnostic fixture policy; never a user-file converter.
export const AUDIO_METADATA_TAGS = Object.freeze({
  title: "Titre café — 音楽", artist: "Émile / कलाकार", album: "Album naïf", genre: "Essai",
  date: "2026", track: "3/9", comment: "αβγ & <texte>", composer: "作曲者 Émile",
  album_artist: "Artiste collectif", performer: "Violon — 藝術家", disc: "2/3", copyright: "© 2026 Example",
  publisher: "Éditions locales", language: "fra", isrc: "FR9ZZ2600001", encoded_by: "Deterministic fixture",
  lyrics: "Un vers\n第二行", license: "Licence d’essai", contact: "Contact local", location: "Montréal",
  organization: "Atelier α", custom_field: "Valeur libre 音楽", replaygain_track_gain: "-5.25 dB",
  replaygain_track_peak: "0.800000", replaygain_album_gain: "-4.00 dB",
});
export const AUDIO_METADATA_FIDELITY_CASES = Object.freeze([
  { source: "flac", destination: "ogg" }, { source: "flac", destination: "opus" },
  { source: "ogg", destination: "opus" }, { source: "opus", destination: "ogg" },
  { source: "ogg", destination: "flac" }, { source: "opus", destination: "flac" },
  { source: "flac", destination: "ogg", repeated: true },
].map(Object.freeze));
export const AUDIO_REPEATED_COMMENTS = Object.freeze(["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
export function audioMetadataFixtureArguments(source, target) {
  const codecs = { flac: "flac", ogg: "libvorbis", opus: "libopus" };
  if (!Object.hasOwn(codecs, source)) throw new TypeError("Unknown diagnostic fixture source");
  return ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=2",
    "-c:a", codecs[source], "-threads", "1", ...Object.entries(AUDIO_METADATA_TAGS).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
    "-fflags", "+bitexact", "-flags:a", "+bitexact", target];
}
