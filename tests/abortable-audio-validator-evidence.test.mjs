import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeAbortableAudioValidator } from "../scripts/lib/abortable-audio-validator-recipe.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = JSON.parse(await read("evidence/abortable-audio-validator-controls-2026-10-07.json"));
test("Actual cancellation controls close active native readers and retain executed source/generation pins", async () => {
  assert.equal(proof.status, "passed-native-cancellation-controls-only");
  assert.deepEqual(proof.positive.source, proof.positive.output);
  assert.match(proof.shiftedClockRejected, /Decoded audio (pts|dts) changed/);
  assert.match(proof.activeReadersCancelled, /cancelled\/deadline|abort/i);
  assert.match(proof.preAbortedSignalRejected, /abort/i);
  assert.equal(proof.ownedNativeChildrenAbsent, true); assert.equal(proof.ownedScratchAndFixturesRemoved, true);
  assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.originalFullAudioValidation, false);
  assert.equal(proof.completeChromiumMemoryAcceptance, false);
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  const source = (await read("scripts/lib/streaming-copied-audio-validation.mjs")).toString();
  assert.equal(sha(makeAbortableAudioValidator(source, proof.sourcePins["scripts/lib/streaming-copied-audio-validation.mjs"])), proof.generatedValidatorSha256);
});
test("First actually executed control retains its old exact source instead of silently repinning history", async () => {
  const initial = JSON.parse(await read("evidence/abortable-audio-validator-controls-2026-10-07-initial.json"));
  const file = "scripts/check-abortable-audio-validator.mjs";
  assert.equal(sha(initial.preservation.executedSourceSnapshots[file]), initial.sourcePins[file]);
  assert.notEqual(initial.sourcePins[file], proof.sourcePins[file]);
  for (const [key, digest] of Object.entries(initial.sourcePins)) {
    if (key !== file) assert.equal(sha(await read(key)), digest, key);
  }
  assert.equal(initial.generatedValidatorSha256, proof.generatedValidatorSha256);
});
test("Read-only full-audio supplement cannot start a converter, change engine assets or delete browser outputs", async () => {
  const source = (await read("scripts/watch-original-audio-supplement.mjs")).toString();
  for (const anchor of ['driver.bornUtc, driverBornUtc', 'closedOutputProbe(child.commandLine)',
    'isFinalOutputDecode(entry.commandLine, output)', 'signal: controller.signal', 'await guard',
    'assert.deepEqual(run.after, before)', 'ordinal < sourceAudioCount', 'await hashFile(output, controller.signal)',
    'await verifySource()', 'await runtime.close()', 'ownedNativeReadersAbsent', 'generatedMediaCopies: 0']) assert.ok(source.includes(anchor), anchor);
  for (const prohibited of ['chromium.launch', 'connectOverCDP', 'page.evaluate', 'stage-mpeg2', 'emptyOpfs(', 'rm(', 'unlink(', 'copyFile(', '"-c", "copy"'])
    assert.ok(!source.includes(prohibited), prohibited);
  assert.ok(source.includes('applicationOrEngineChanged: false'));
  assert.ok(source.includes('publicAcceptance: false'));
});
