// Small deterministic INPUT fixtures and independent raw-entry validation only.
// Unlike a probe dictionary, this must distinguish two entries from one joined
// value, even when a real tag itself contains a semicolon. No audio is encoded.
import assert from "node:assert/strict";
import { AUDIO_METADATA_TAGS } from "./audio-metadata-fidelity-fixture.mjs";
import { appendFlacFixtureComments } from "./audio-comment-validation.mjs";
import { appendOggFixtureComments } from "./audio-repeated-comment-fixture.mjs";
export const STANDARD_AUDIO_REPEAT_FIELDS = Object.freeze([
  { field: "track", aliases: ["track", "tracknumber"], added: "track=5/12", values: [AUDIO_METADATA_TAGS.track, "5/12"] },
  { field: "comment", aliases: ["comment", "description"], added: "comment=Deuxième; literal — टिप्पणी", values: [AUDIO_METADATA_TAGS.comment, "Deuxième; literal — टिप्पणी"] },
  { field: "album_artist", aliases: ["album_artist", "albumartist"], added: "album_artist=Second ensemble 音楽", values: [AUDIO_METADATA_TAGS.album_artist, "Second ensemble 音楽"] },
  { field: "disc", aliases: ["disc", "discnumber"], added: "disc=4/5", values: [AUDIO_METADATA_TAGS.disc, "4/5"] },
].map(value => Object.freeze({ ...value, aliases: Object.freeze(value.aliases), values: Object.freeze(value.values) })));
export const STANDARD_AUDIO_SCALAR_TAGS = Object.freeze(Object.fromEntries(Object.entries(AUDIO_METADATA_TAGS)
  .filter(([key]) => !STANDARD_AUDIO_REPEAT_FIELDS.some(value => value.field === key))));
export const STANDARD_AUDIO_REPEAT_CASES = Object.freeze([
  { source: "flac", destination: "ogg" }, { source: "flac", destination: "opus" },
  { source: "ogg", destination: "opus" }, { source: "opus", destination: "ogg" },
  { source: "ogg", destination: "flac" }, { source: "opus", destination: "flac" },
].map(value => Object.freeze({ ...value, standardRepeated: true })));
export function makeStandardRepeatedAudioFixture(bytes, format) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 1048576);
  assert.ok(["flac", "ogg", "opus"].includes(format));
  const comments = STANDARD_AUDIO_REPEAT_FIELDS.map(value => value.added);
  return format === "flac" ? appendFlacFixtureComments(bytes, comments) : appendOggFixtureComments(bytes, format, comments);
}
export function validateStandardRepeatedAudioComments(comments) {
  assert.ok(comments && Array.isArray(comments.entries) && comments.entries.length <= 128);
  const values = new Map(STANDARD_AUDIO_REPEAT_FIELDS.map(value => [value.field, []]));
  for (const entry of comments.entries) {
    assert.equal(typeof entry, "string"); assert.ok(Buffer.byteLength(entry) <= 4096 && !entry.includes("\0"));
    const at = entry.indexOf("="); assert.ok(at > 0);
    const key = entry.slice(0, at).toLowerCase(), field = STANDARD_AUDIO_REPEAT_FIELDS.find(value => value.aliases.includes(key));
    if (field) values.get(field.field).push({ key: entry.slice(0, at), value: entry.slice(at + 1) });
  }
  const fields = STANDARD_AUDIO_REPEAT_FIELDS.map(field => {
    const observed = values.get(field.field), actual = observed.map(value => value.value);
    return { field: field.field, expectedValues: [...field.values], entries: observed,
      status: actual.length === field.values.length && actual.every((value, index) => value === field.values[index]) ? "preserved" : "lost-changed-folded-or-reordered" };
  });
  return { status: fields.every(value => value.status === "preserved") ? "passed" : "failed", fields,
    rawEntriesInspected: true, dictionarySummaryInsufficient: true, semicolonSplittingUsed: false,
    publicAcceptance: false };
}
