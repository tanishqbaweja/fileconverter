import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { provenSourceSha } from "./helpers/nondocker-workflow-provenance.mjs";

const root = path.resolve(import.meta.dirname, "..");
const evidence = JSON.parse(await readFile(path.join(root,
  "evidence/mpeg2-encoder-small-browser-2026-10-04.json"), "utf8"));

test("MPEG2 private proof binds a successful native compile and genuine small browser encode without memory/speed acceptance", async () => {
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.primaryMemoryAcceptance, false);
  assert.equal(evidence.speedGainClaim, null);
  assert.equal(evidence.run.conclusion, "success");
  assert.equal(evidence.run.headSha, "4a92f2b4f957d5a14954bd264aae5700f6a7b6d8");
  assert.deepEqual(evidence.actualWasmMemories,
    [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(evidence.manifest.enabledEncoders, ["mpeg2video"]);
  const outputs = evidence.browserPassedRows.filter((row) => row.outputCodec);
  assert.equal(outputs.length, 2);
  for (const row of outputs) {
    assert.equal(row.sourceCodec, "mpeg4"); assert.equal(row.outputCodec, "mpeg2video");
    assert.equal(row.frames, "48"); assert.equal(row.audioTracks, 2);
    assert.ok(row.ssim >= 0.98); assert.ok(row.outputBytes > 300000);
    assert.equal(row.metrics.wasmMemoryBytes, 33554432);
    assert.ok(row.metrics.maxReadChunkBytes <= 262144);
    assert.ok(row.metrics.peakQueuedBytes <= 262144);
    assert.ok(row.metrics.peakPendingOperations <= 1);
    assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
  }
  for (const row of evidence.fidelity) {
    assert.ok(row.maxFrameTimestampErrorSeconds <= 0.001);
    assert.equal(row.sourceFrameCount, row.outputFrameCount);
    assert.equal(row.sourceTitle, row.outputTitle);
    assert.equal(row.sourceChapters[0].tags.title, row.outputChapters[0].tags.title);
  }
  for (const [file, hash] of Object.entries(evidence.currentSources)) {
    assert.equal(provenSourceSha(file, await readFile(path.join(root, file)), hash), hash, file);
  }
});

test("MPEG2 cleanup proof distinguishes removed media, restored assets, fixed ordering and policy-blocked scratch", () => {
  assert.equal(evidence.browserPassedRows.find((row) => row.kind === "direct-write-failure").status, "passed");
  assert.equal(evidence.remainingHostedArtifacts, 0);
  assert.equal(evidence.sourceBundleDownloaded, false);
  assert.equal(evidence.cleanup.newSmokeRuntimeAbsent, true);
  assert.equal(evidence.cleanup.privateAdapterAbsent, true);
  assert.equal(evidence.cleanup.recreatedRuntimeScratch.bytes, 7972);
  assert.match(evidence.cleanup.recreatedRuntimeScratch.reason, /policy-blocked/);
  assert.match(evidence.cleanup.orderingFix, /Restoration child now awaited before close/);
  assert.ok(evidence.manifest.requiredUnpassedGates.includes("three repeats and multi-gigabyte scaling"));
  assert.ok(evidence.manifest.requiredUnpassedGates.includes("legal deployment review"));
});
