import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { makeVp9TemporalCUnitSource, runVp9TemporalCUnit } from "../media/ffmpeg/vp9-temporal-c-unit.mjs";
const audit = JSON.parse(await readFile(new URL("../evidence/2026-11-06-vp9-temporal-filter-source-audit.json", import.meta.url)));
test("C allocator control source embeds exact original/candidate functions and rejects drift", () => {
  const source = makeVp9TemporalCUnitSource(audit.allocation.exactSource);
  assert.ok(source.includes(audit.allocation.exactSource.replace("static void alloc_raw_frame_buffers", "static void original_alloc_raw_frame_buffers")));
  assert.ok(source.includes('printf("{\\"pairs\\":48'));
  assert.throws(() => makeVp9TemporalCUnitSource(audit.allocation.exactSource + " "), /exact archive-authenticated/);
});
test("real host C compilation exercises both high-bit-depth variants, failures and mode transitions", { timeout: 120000 }, async () => {
  const result = await runVp9TemporalCUnit();
  assert.equal(result.totalFunctionCalls, 198);
  assert.equal(result.variants.length, 2);
  for (const variant of result.variants) {
    assert.equal(variant.pairs, 48);
    assert.equal(variant.modeTransitionCalls, 3);
    assert.equal(variant.allocationsAvoided, 6);
    assert.equal(variant.injectedTemporalErrorsAvoided, 3);
  }
  assert.equal(result.nativeCodecConversion, false);
  assert.equal(result.publicAcceptance, false);
});
