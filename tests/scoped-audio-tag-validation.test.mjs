import assert from "node:assert/strict";
import test from "node:test";
import { validateScopedAudioTags as validate } from "../scripts/lib/scoped-audio-tag-validation.mjs";

const expected = { title: "Titre café — 音楽", artist: "Émile / कलाकार" };

test("audio metadata uses the explicitly selected FFprobe scope, with no fallback", () => {
  const probe = { format: { tags: expected }, streams: [{ index: 0, codec_type: "audio" }] };
  assert.equal(validate(probe, expected, { scope: "format" }).status, "passed");
  const stream = validate(probe, expected, { scope: "audio-stream" });
  assert.equal(stream.status, "failed");
  assert.ok(stream.fields.every(field => field.actualValue === null && field.status === "missing"));
  assert.throws(() => validate(probe, expected), /Explicit metadata scope/);
});

test("Vorbis-style uppercase names preserve exact Unicode values, not normalized approximations", () => {
  const probe = { streams: [{ index: 2, codec_type: "audio", tags: { TITLE: expected.title, ARTIST: expected.artist } }] };
  const result = validate(probe, expected, { scope: "audio-stream" });
  assert.equal(result.status, "passed"); assert.equal(result.streamIndex, 2);
  assert.equal(result.fields[0].actualKey, "TITLE");
  probe.streams[0].tags.TITLE = expected.title.normalize("NFD");
  assert.equal(validate(probe, expected, { scope: "audio-stream" }).fields[0].status, "changed");
});

test("audio ordinals select the requested audio track, never the video or other audio tags", () => {
  const probe = { streams: [{ index: 0, codec_type: "video", tags: expected },
    { index: 3, codec_type: "audio", tags: expected }, { index: 7, codec_type: "audio", tags: { title: "Other" } }] };
  const result = validate(probe, expected, { scope: "audio-stream", audioOrdinal: 1 });
  assert.equal(result.streamIndex, 7); assert.equal(result.status, "failed");
  assert.equal(result.fields[0].status, "changed"); assert.equal(result.fields[1].status, "missing");
  assert.throws(() => validate(probe, expected, { scope: "audio-stream", audioOrdinal: 2 }), /unavailable/);
});

test("ambiguous aliases, malformed/unavailable scope and nontext tags cannot pass", () => {
  for (const tags of [null, [], { title: 0 }, { title: "one", TITLE: "one" }])
    assert.throws(() => validate({ format: { tags } }, expected, { scope: "format" }));
  assert.throws(() => validate({}, expected, { scope: "format" }), /unavailable/);
  assert.throws(() => validate({ streams: [{ codec_type: "audio", tags: expected }] }, expected,
    { scope: "audio-stream" }), /index/);
  assert.throws(() => validate({ format: {} }, {}, { scope: "format" }), /At least one/);
});

test("metadata and stream counts, key/value lengths and ordinals have fixed bounds", () => {
  const many = count => Object.fromEntries(Array.from({ length: count }, (_, i) => [`tag${i}`, "x"]));
  assert.throws(() => validate({ format: {} }, many(33), { scope: "format" }), /count/);
  assert.throws(() => validate({ format: { tags: many(129) } }, expected, { scope: "format" }), /count/);
  assert.throws(() => validate({ format: {} }, { ["x".repeat(129)]: "x" }, { scope: "format" }), /key/);
  assert.throws(() => validate({ format: {} }, { title: "x".repeat(4097) }, { scope: "format" }), /bounded text/);
  assert.throws(() => validate({ streams: Array(65).fill({}) }, expected, { scope: "audio-stream" }), /stream bound/);
  for (const audioOrdinal of [-1, 64, 0.5, Infinity])
    assert.throws(() => validate({}, expected, { scope: "audio-stream", audioOrdinal }), /ordinal/);
  assert.throws(() => validate({ format: {} }, expected, { scope: "format", audioOrdinal: 1 }), /not applicable/);
});
