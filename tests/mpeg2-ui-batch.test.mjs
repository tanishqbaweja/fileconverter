// DOM/state doubles only; these do not execute codecs or prove browser support.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
