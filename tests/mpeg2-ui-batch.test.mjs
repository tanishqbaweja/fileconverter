// DOM/state doubles only; these do not execute codecs or prove browser support.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { runMpeg2UiJob } from "../scripts/lib/mpeg2-ui-job.mjs";
const options = { codec: "automatic", maxWidth: 0, bitRateBps: 0, frameRateFps: 0, quality: "automatic" };
async function sandbox({ count = 2, missingNativeIndex = null, collide = false }, run) {
  const originals = Object.fromEntries(["window", "document", "navigator", "HTMLButtonElement"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let started = false, calls = 0, clicks = 0;
  const values = { "video-codec-select": "automatic", "video-width-select": "0", "video-bitrate-select": "0", "video-frame-rate-select": "0", "video-quality-select": "automatic" };
  class Button { disabled = false; click() { started = true; clicks++; } }
  const button = new Button();
  const state = () => {
    const item = started ? Math.min(calls++, count) : 0, terminal = started && item === count;
    return { selectedProfileId: "mkv-to-mp4-mpeg2", jobState: terminal ? "complete" : started ? "running" : "idle",
      phase: terminal ? `Saved ${count} files` : "Encoding MPEG-2 MP4", workerStatus: "ready", batchTotal: count,
      batchCompleted: item, batchOutputNames: Array.from({ length: count }, (_, i) => collide ? "source.mp4" : `source-${i}.mp4`),
      metrics: { inputBytes: 64, outputBytes: 128, wasmMemoryBytes: terminal || item === missingNativeIndex ? 0 : 50331648 } };
  };
  const root = { getFileHandle: async () => ({ getFile: async () => ({ size: 128 }) }), async *keys() {} };
  const mocks = { window: { __WITHIN_TEST__: { getState: state } }, HTMLButtonElement: Button,
    navigator: { storage: { getDirectory: async () => root } }, document: { querySelector(selector) {
      if (selector.includes("convert-button")) return button;
      return { value: values[/data-testid="([^"]+)"/.exec(selector)?.[1]] };
    } } };
  for (const [key, value] of Object.entries(mocks)) Object.defineProperty(globalThis, key, { configurable: true, value });
  try { await run(() => clicks); }
  finally { for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } }
}
test("one real button action observes each batch native index and two noncolliding outputs", async () => {
  await sandbox({}, async clicks => {
    const r = await runMpeg2UiJob({ batchSize: 2, options });
    assert.equal(clicks(), 1); assert.equal(r.uiEvidence.completedBatchItems, 2);
    assert.equal(r.destinationNames.length, 2); assert.deepEqual(r.nativeBatchItems.map(i => i.index), [0, 1]);
    assert.equal(r.uiEvidence.optionsReadFromActualForm, true); assert.deepEqual(r.stageNames, []);
  });
});
test("batch helper rejects missing native work, collisions and arbitrary batch sizes; single flow still works", async () => {
  await sandbox({ missingNativeIndex: 1 }, async () => { await assert.rejects(runMpeg2UiJob({ batchSize: 2, options }), /every real UI batch item/); });
  await sandbox({ collide: true }, async () => { await assert.rejects(runMpeg2UiJob({ batchSize: 2, options }), /names collide/); });
  await sandbox({ count: 1 }, async clicks => {
    const r = await runMpeg2UiJob(options); assert.equal(clicks(), 1); assert.equal(r.uiEvidence.completedBatchItems, 1);
  });
  await assert.rejects(runMpeg2UiJob({ batchSize: 99, options }), /finite one\/two-file/);
});
test("batch driver sends one actual UI job and independently validates both destination files", async () => {
  const source = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /setInputFiles\(uiBatch \? \[fixture, fixture\] : fixture\)/);
  assert.match(source, /page.evaluate\(runMpeg2UiJob, \{ batchSize: 2, options: selectedUiOptions \}\)/);
  assert.match(source, /for \(const outputNameToValidate of outputNamesToValidate\)/);
  assert.match(source, /outputs.push\(\{ name: outputNameToValidate, \.\.\.report.output \}\)/);
  assert.match(source, /manifests: uiBatch \? 2/);
  assert.match(source, /assert.ok\(ssim >= 0.98/); assert.match(source, /report.memory.incrementalPrivateMiB <= 250/);
});
test("actual two-file button batch has two independent valid outputs, complete memory accounting and verified cleanup", async () => {
  const root = new URL("../", import.meta.url), hash = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T06-18-35.419Z-mpeg2-ui-batch-result.json", root)));
  const packed = await readFile(new URL(receipt.archive.path, root)); assert.equal(hash(packed), receipt.archive.sha256);
  assert.equal(packed.length, receipt.archive.bytes);
  const bytes = gunzipSync(packed, { maxOutputLength: 4 * 1048576 }); assert.equal(hash(bytes), receipt.archive.restoredSha256);
  assert.equal(bytes.length, receipt.archive.restoredBytes);
  const r = JSON.parse(bytes), batch = receipt.uiBatchQualification;
  assert.equal(receipt.head, "15059fc54f6f392bdb41a7bcee130c1178c31092"); assert.equal(receipt.sourcePins, 45);
  assert.equal(receipt.recordedSourcesMatchHistoricalGitHead, true); assert.deepEqual(batch, r.uiBatchQualification);
  assert.equal(batch.completed, true); assert.equal(batch.actualConvertButton, true);
  assert.equal(batch.actualButtonEvidence.completedBatchItems, 2); assert.equal(batch.actualButtonEvidence.finalWorkerReady, true);
  assert.deepEqual(batch.destinationNames, ["source.mp4", "source-2.mp4"]);
  assert.deepEqual(batch.nativeBatchItems.map(i => i.index), [0, 1]);
  for (const item of batch.nativeBatchItems) { assert.ok(item.inputBytes > 0 && item.outputBytes > 0); assert.equal(item.wasmMemoryBytes, 50331648); }
  assert.equal(batch.outputs.length, 2);
  for (const output of batch.outputs) {
    assert.equal(output.sha256, "11a53d672a155d12630bd0bc9fb39f012db05ce1ed4abebfe178a3b679451886");
    assert.equal(output.bytes, 1002730); assert.equal(output.frames, 96); assert.equal(output.fullNativeDecodePassed, true);
    assert.ok(output.ssim >= 0.98); assert.ok(output.videoClocks.maximumVideoPtsErrorSeconds < 0.001);
    assert.equal(output.titlePreserved, true); assert.equal(output.languagePreserved, true);
    assert.equal(output.copiedAudioPacketHash, batch.outputs[0].copiedAudioPacketHash);
  }
  assert.deepEqual(r.staticRequests, { manifests: 2, decoder: 1, encoder: 1 });
  assert.equal(r.diagnosticMemorySamples.length, 424); assert.equal(r.memory.unavailableSamples.length, 0);
  for (const s of r.diagnosticMemorySamples) assert.equal(s.privateBytes, s.processes.reduce((n, p) => n + p.privateBytes, 0));
  const peak = r.diagnosticMemorySamples.filter(s => s.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
  assert.equal((peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, 244.93359375);
  assert.equal(receipt.memory.incrementalPrivateMiB, 244.93359375);
  const visual = receipt.boundedVisualObservation; assert.equal(visual.captures.length, 3); assert.equal(visual.totalBytes, 399224);
  const native = visual.captures.find(c => c.nativeProgressVisuallyInViewport); assert.equal(native.before.selectedProfileId, "mkv-to-mp4-mpeg2");
  assert.equal(visual.captures.at(-1).before.phase, "Saved 2 files"); assert.equal(visual.captures.at(-1).regionInViewport, true);
  for (const c of visual.captures) { const image = await readFile(new URL(c.file, root)); assert.equal(hash(image), c.sha256); assert.equal(image.length, c.bytes); }
  assert.deepEqual(r.forbiddenRequests, []); assert.deepEqual(r.failures, []);
  assert.equal(r.protectedOriginalUnchanged, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
  assert.equal(receipt.cleanup.disposableOutputDeleted, true); assert.equal(receipt.overallGatePassed, true);
  assert.equal(receipt.publicAcceptance, false); assert.equal(batch.nativeOsPickerCovered, false);
});
