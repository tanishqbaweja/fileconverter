import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, root), "utf8");
const section = (source, begin, end) => {
  assert.ok(source.includes(begin) && source.includes(end));
  return source.slice(source.indexOf(begin), source.indexOf(end, source.indexOf(begin)));
};

test("Executed split browser proof preserves golden genuine outputs and conservative acceptance scope", async () => {
  const proof = JSON.parse(await read("evidence/mpeg2-split-pipeline-small-passed-2026-10-06.json"));
  assert.equal(proof.build.conclusion, "success"); assert.equal(proof.build.conversionTime, false);
  assert.equal(proof.browser.testsPassed, 4); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.browser.completeChromiumMemoryAcceptance, false);
  assert.equal(proof.browser.stableBlankBaselineCertified, false);
  assert.equal(proof.browser.elapsedTimesAreNotIdenticalInputSpeedComparison, true);
  assert.equal(proof.manifest.aggregateWasmMemoryBytes, 50331648);
  assert.deepEqual(proof.browser.conversions.map(row => [row.sourceCodec, row.outputCodec, row.frames, row.outputBytes, row.outputSha256]), [
    ["mpeg4", "mpeg2video", "48", 321692, "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94"],
    ["hevc", "mpeg2video", "96", 652521, "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32"],
  ]);
  for (const row of proof.browser.nativeOwnership) {
    assert.equal(row.closed, true); assert.equal(row.activePackets, 0);
    assert.equal(row.queuedFrames, 0); assert.equal(row.queuedPackets, 0);
    assert.equal(row.additionalPixelBufferBytes, 0); assert.equal(row.additionalJsPacketBufferBytes, 0);
  }
  assert.equal(proof.browser.writeFailure.status, "passed"); assert.deepEqual(proof.browser.writeFailure.partialBytes, []);
  assert.equal(proof.browser.cancelled.terminalState, "cancelled"); assert.ok(proof.browser.cancelled.beforeCancel.outputBytes > 32768);
  assert.deepEqual(proof.browser.cancelled.partialBytes, []);
  for (const [file, hash] of Object.entries(proof.executedSources))
    assert.equal(createHash("sha256").update(await read(file)).digest("hex"), hash, file);
  assert.equal(proof.cleanup.originalRead, false); assert.equal(proof.cleanup.originalModified, false);
  assert.equal(proof.build.remainingRunArtifacts, 0); assert.equal(proof.build.artifactDeleted, true);
});

test("Separate original-source stress driver retains full validators, memory formula, three repeats and cleanup", async () => {
  const original = (await read("scripts/mpeg2-protected-memory.mjs")).replaceAll("\r\n", "\n");
  const split = (await read("scripts/mpeg2-split-protected-memory.mjs")).replaceAll("\r\n", "\n");
  for (const [begin, end] of [
    ["async function verifySource()", "const manifest ="],
    ['const video = after.streams.find', 'const inputTimes = await frameTimes(source)'],
    ['for (let i = 0; i < inputTimes.length;', 'run.independentValidation ='],
  ]) assert.equal(section(split, begin, end), section(original, begin, end));
  assert.ok(split.includes('assert.ok(run.incrementalPrivateMiB <= 250'));
  assert.ok(split.includes('(run.peakPrivateBytes - blankBaseline.privateBytes) / MiB'));
  assert.ok(split.includes('for (let number = 1; number <= 3; number++)'));
  assert.ok(split.includes('32 * 1024 ** 3'));
  assert.ok(split.includes('assert.equal(metrics.peakWasmMemoryBytes, 48 * MiB)'));
  assert.ok(split.includes('assert.equal(ownership.frames, outputTimes.length)'));
  assert.ok(split.includes('assert.equal(ownership.activePackets, 0)'));
  assert.ok(split.includes('await verifySource(); cleanup.protectedFixtureUnchanged = true'));
  assert.ok(split.includes('await runtime.close()'));
  assert.ok(split.includes('await emptyOpfs()'));
  assert.ok(split.includes('"scripts/stage-mpeg2-split-pipeline.mjs", "restore"'));
  assert.ok(!split.includes('"scripts/stage-mpeg2-large-candidate.mjs", "stage"'));
});
