import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = JSON.parse(await read("evidence/streaming-audio-validator-controls-2026-10-07.json"));
test("Real native audio validator controls reject clock/content changes and never certify a browser conversion", () => {
  assert.equal(proof.status, "passed-validator-controls"); assert.ok(proof.positive.source.frames > 0);
  assert.deepEqual(proof.positive.source, proof.positive.output); assert.equal(proof.positive.retainedFrameRows, 0);
  assert.equal(proof.positive.canonicalCodec, "pcm_s32le"); assert.equal(proof.positive.clockToleranceSeconds, 0.001);
  assert.deepEqual(proof.negative.map(row => row.kind), ["shifted-clock", "changed-content"]);
  for (const row of proof.negative) assert.equal(row.status, "rejected-as-required");
  assert.equal(proof.nativeSpawnFailureRejected, true); assert.equal(proof.ownedScratchAndFixturesRemoved, true);
  assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.originalFullAudioValidation, false);
  assert.equal(proof.completeChromiumMemoryAcceptance, false);
});
test("Native controls preserve executed source pins and bounded streaming validation, not PCM/frame arrays", async () => {
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest, file);
  const source = (await read("scripts/lib/streaming-copied-audio-validation.mjs")).toString();
  for (const anchor of ['for await (const chunk of child.stdout)', 'controller.abort()', 'readers.map(reader => reader.return())', '"-copyts"', '"-xerror"', '"framehash"', '"pcm_s32le"']) assert.ok(source.includes(anchor));
  assert.ok(!source.includes('"-t"')); assert.ok(!source.includes('"-frames:a"'));
  assert.ok(!source.includes('frames.push')); assert.ok(!source.includes('readFile('));
  assert.equal(proof.positive.limits.chunkBytes, 65536); assert.equal(proof.positive.limits.lineBytes, 4096);
});
