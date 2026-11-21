// Distinct fixture preflight, not a production-browser run or a memory result.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { openAsBlob } from "node:fs";
import { lstat, statfs } from "node:fs/promises";
import path from "node:path";
import { inspectMediaSource } from "../lib/media-source-inspection.ts";
import { timedTextTrackChoices } from "../lib/timed-text-qualification.ts";
import { runIsoTimedTextToWebVtt } from "../workers/iso-timed-text-webvtt.ts";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { createTimedTextCancellationFixture, TIMED_TEXT_CANCEL_INPUT_NAME, TIMED_TEXT_CANCEL_OUTPUT_NAME } from "./lib/timed-text-browser-fixture.mjs";

const repo = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 2, "This command only preflights the synthetic fixture");
const disk = await statfs(repo);
assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 2, "Need 32 MiB free on the repository drive for fixture preflight");

async function checkEngine(blob, trackId, cancelAfterPayload = false) {
  // Match the in-page cancellation trigger's cumulative threshold. A single
  // UTF-8 write can be slightly shorter than the chunk capacity.
  const triggerBytes = 65536;
  const hash = createHash("sha256");
  const abort = new DOMException("Preflight stopped after the output threshold", "AbortError");
  const metrics = { readOperations: 0, inputBytes: 0, maxReadChunkBytes: 0, outputBytes: 0, writeOperations: 0,
    maxWriteChunkBytes: 0, peakPendingWrites: 0 };
  let stopped = false, pending = 0;
  const operation = runIsoTimedTextToWebVtt({
    size: blob.size,
    assertActive() { if (stopped) throw abort; },
    warn() {},
    async read(offset, length) {
      assert.ok(length <= 131072);
      const bytes = new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
      metrics.readOperations++;
      metrics.inputBytes += bytes.byteLength;
      metrics.maxReadChunkBytes = Math.max(metrics.maxReadChunkBytes, length);
      return bytes;
    },
    async write(chunk) {
      assert.equal(++pending, 1);
      assert.ok(chunk.byteLength <= 65536);
      metrics.peakPendingWrites = Math.max(metrics.peakPendingWrites, pending);
      metrics.maxWriteChunkBytes = Math.max(metrics.maxWriteChunkBytes, chunk.byteLength);
      metrics.outputBytes += chunk.byteLength;
      metrics.writeOperations++;
      hash.update(chunk);
      await new Promise(resolve => setImmediate(resolve));
      if (cancelAfterPayload && metrics.outputBytes >= triggerBytes) stopped = true;
      pending--;
    },
  }, trackId);
  if (cancelAfterPayload) {
    await assert.rejects(operation, error => error === abort);
    assert.equal(pending, 0);
    assert.ok(metrics.writeOperations === 1 || metrics.writeOperations === 2);
    assert.ok(metrics.outputBytes >= triggerBytes && metrics.outputBytes < triggerBytes + 65536);
    return { stoppedAtFirstThresholdCrossing: true, triggerBytes, ...metrics };
  }
  const selected = await operation;
  assert.equal(pending, 0);
  return { ...selected, sha256: hash.digest("hex"), ...metrics };
}

const scratch = await createOwnedRuntimeScratch("timed-text-browser-fixture-");
let result;
try {
  const { input, ...fixture } = await createTimedTextCancellationFixture(scratch, path.join(repo, "fixtures/media/quicktime-source.mov"));
  const blob = await openAsBlob(input);
  assert.equal(blob.size, fixture.inputBytes);
  const choices = timedTextTrackChoices((await inspectMediaSource(blob, "mp4"))?.streams ?? []);
  assert.deepEqual(choices.map(choice => choice.id), fixture.trackIds);
  const decoy = await checkEngine(blob, fixture.trackIds[0]);
  assert.deepEqual([decoy.cues, decoy.outputBytes, decoy.sha256], [fixture.decoyOracle.cues, fixture.decoyOracle.bytes, fixture.decoyOracle.sha256]);
  const success = await checkEngine(blob, fixture.selectedTrackId);
  assert.deepEqual([success.cues, success.outputBytes, success.sha256], [fixture.expected.cues, fixture.expected.bytes, fixture.expected.sha256]);
  assert.equal(success.samples, fixture.selectedPacketCount);
  assert.ok(success.writeOperations > 16);
  const cancellation = await checkEngine(blob, fixture.selectedTrackId, true);
  assert.ok(cancellation.inputBytes < success.inputBytes);
  result = { fixture: { ...fixture, inputName: TIMED_TEXT_CANCEL_INPUT_NAME, outputName: TIMED_TEXT_CANCEL_OUTPUT_NAME },
    offeredTrackIds: choices.map(choice => choice.id), nodeEnginePreflight: { success, decoy, cancellation } };
} finally {
  await scratch.close();
}
await assert.rejects(lstat(scratch.directory), { code: "ENOENT" });
console.log(JSON.stringify({ ...result, scratchRemoved: true, browserLaunched: false, browserQualification: false,
  browserMemoryMeasured: false, protectedOriginalRead: false }, null, 2));
