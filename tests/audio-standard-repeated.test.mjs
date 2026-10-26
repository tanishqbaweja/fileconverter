import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { STANDARD_AUDIO_REPEAT_FIELDS, STANDARD_AUDIO_SCALAR_TAGS, STANDARD_AUDIO_REPEAT_CASES,
  makeStandardRepeatedAudioFixture, validateStandardRepeatedAudioComments } from "../scripts/lib/audio-standard-repeated-fixture.mjs";
const entries = () => STANDARD_AUDIO_REPEAT_FIELDS.flatMap(field => field.values.map((value, index) => `${field.aliases[index]}=${value}`));
test("four standard alias families retain both real values, separate entries and literal semicolons, not folded probe text", () => {
  assert.equal(Object.keys(STANDARD_AUDIO_SCALAR_TAGS).length, 21); assert.equal(STANDARD_AUDIO_REPEAT_CASES.length, 6);
  assert.equal(new Set(STANDARD_AUDIO_REPEAT_CASES.map(value => `${value.source}-to-${value.destination}`)).size, 6);
  const result = validateStandardRepeatedAudioComments({ entries: entries() }); assert.equal(result.status, "passed");
  assert.equal(result.fields.length, 4); assert.equal(result.semicolonSplittingUsed, false);
  assert.equal(validateStandardRepeatedAudioComments({ entries: entries().map(value => value.replace(/^[^=]+/, key => key.toUpperCase())) }).status, "passed");
  for (const failure of [entries().slice(1), entries().toReversed(), [...entries(), entries()[0]],
    STANDARD_AUDIO_REPEAT_FIELDS.map(field => `${field.aliases[0]}=${field.values.join(";")}`),
    entries().map(value => value.replace("5/12", "5/13"))])
    assert.equal(validateStandardRepeatedAudioComments({ entries: failure }).status, "failed");
});
test("standard-repeat input and inspector reject invalid format, oversized generated data, malformed and unbounded metadata", () => {
  assert.throws(() => makeStandardRepeatedAudioFixture(Buffer.alloc(1048577), "flac"));
  assert.throws(() => makeStandardRepeatedAudioFixture(Buffer.from("fixture"), "mp3"));
  for (const malformed of [null, { entries: ["missing separator"] }, { entries: ["key=bad\0data"] },
    { entries: ["key=" + "x".repeat(4096)] }, { entries: Array(129).fill("key=value") }, { entries: [42] }])
    assert.throws(() => validateStandardRepeatedAudioComments(malformed));
});
test("new browser scope requires all21 scalar plus four repeated fields, full PCM and physical output binding without changing native settings", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--standard-repeated-audio/); assert.match(source, /STANDARD_AUDIO_REPEAT_CASES/);
  assert.match(source, /validateStandardRepeatedAudioComments\(comments\)/);
  assert.match(source, /standardRepeated \? STANDARD_AUDIO_SCALAR_TAGS/);
  assert.match(source, /standardRepeatedValidation.status !== "passed"/);
  assert.match(source, /sourcePcmUnchanged: await compareNativeAudioPcm\(original, file/);
  assert.match(source, /compareNativeAudioPcm\(input, output/); assert.match(source, /physicalValidation = .*standardRepeatedAudio/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
});
