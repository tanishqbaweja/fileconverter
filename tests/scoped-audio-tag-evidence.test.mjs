import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateScopedAudioTags } from "../scripts/lib/scoped-audio-tag-validation.mjs";

const file = new URL("../evidence/scoped-audio-tag-controls-2026-10-07.json", import.meta.url);
const bytes = await readFile(file);
const evidence = JSON.parse(bytes);

test("actual native metadata controls bind five tiny fixtures and exact scope-specific positive/negative results", () => {
  assert.equal(evidence.status, "passed-native-validator-controls");
  assert.ok(bytes.length < 65536);
  assert.deepEqual(evidence.cases.map(row => row.id), ["wav", "flac", "opus", "ogg", "aiff"]);
  let preservedFields = 0;
  for (const row of evidence.cases) {
    assert.ok(row.bytes > 0 && row.bytes < 65536);
    assert.match(row.sha256, /^[0-9a-f]{64}$/);
    assert.equal(row.positive.status, "passed");
    const expected = Object.fromEntries(row.positive.fields.map(field => [field.field, field.expectedValue]));
    assert.deepEqual(validateScopedAudioTags(row.probe, expected, { scope: row.positive.scope }), row.positive);
    assert.deepEqual(validateScopedAudioTags(row.probe, { title: "Changed title" },
      { scope: row.positive.scope }), row.changed);
    assert.equal(row.changed.status, "failed"); assert.equal(row.changed.fields[0].status, "changed");
    preservedFields += row.positive.fields.length;
    if (row.id === "opus" || row.id === "ogg") {
      assert.equal(row.positive.scope, "audio-stream");
      assert.deepEqual(validateScopedAudioTags(row.probe, expected, { scope: "format" }), row.wrongScope);
      assert.equal(row.wrongScope.status, "failed");
      assert.ok(row.wrongScope.fields.every(field => field.status === "missing" && field.actualValue === null));
    } else { assert.equal(row.positive.scope, "format"); assert.equal(row.wrongScope, null); }
  }
  assert.equal(preservedFields, 32);
});

test("actual metadata fixture proof pins executable sources and claims no browser, memory, or public acceptance", async () => {
  assert.equal(Object.keys(evidence.sourcePins).length, 3);
  for (const [relative, hash] of Object.entries(evidence.sourcePins)) {
    assert.match(relative, /^(scripts|tests)\/[a-z0-9/.-]+\.mjs$/);
    assert.ok(!relative.includes(".."));
    const source = await readFile(new URL(`../${relative}`, import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"), hash);
  }
  assert.equal(evidence.ownedScratchAndFixturesRemoved, true);
  assert.equal(evidence.browserConversionsPerformed, 0);
  assert.equal(evidence.protectedSourceRead, false);
  assert.equal(evidence.completeChromiumMemoryAcceptance, false);
  assert.equal(evidence.publicAcceptance, false);
  assert.ok(evidence.limitations.some(text => text.includes("No audio-engine")));
  assert.ok(evidence.limitations.some(text => text.includes("No alias policy")));
});
