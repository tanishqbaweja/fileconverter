import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidence = JSON.parse(await readFile(new URL(
  "../evidence/mpeg2-artwork-passed-protected-oom-2026-10-05.json", import.meta.url), "utf8"));

test("changed MPEG2 proof separates small artwork/safety success from full original heap failure", () => {
  assert.equal(evidence.build.conclusion, "success");
  assert.equal(evidence.build.conversionSpeed, false);
  assert.equal(evidence.artwork.testsPassed, 3);
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.primaryMemoryAcceptance, false);
  assert.equal(evidence.speedGainClaim, null);
  assert.deepEqual(evidence.actualWasmMemories,
    [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  const art = evidence.artwork.rows.find((row) => row.kind === "attached-picture-preservation");
  assert.equal(art.inputArt.codec_name, "png");
  assert.equal(art.outputArt.codec_name, "png");
  assert.equal(art.outputArt.width, 250); assert.equal(art.outputArt.height, 140);
  assert.match(art.compressedArtworkHash, /^SHA256=[a-f0-9]{64}$/);
  const cancel = evidence.artwork.rows.find((row) => row.kind === "cancel-after-direct-output");
  assert.ok(cancel.beforeCancel.outputBytes > 32768);
  assert.equal(cancel.terminalState, "cancelled");
  assert.equal(cancel.metrics.queuedBytes, 0); assert.equal(cancel.metrics.pendingOperations, 0);
  assert.deepEqual(cancel.partialBytes, []);
  assert.equal(evidence.protected.source.bytes, 2958573265);
  assert.equal(evidence.protected.source.sha256,
    "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(evidence.protected.completedRuns, 0);
  assert.equal(evidence.protected.run.metrics.inputBytes, 353857);
  assert.equal(evidence.protected.run.metrics.outputBytes, 0);
  assert.equal(evidence.protected.run.independentValidation, null);
  assert.match(evidence.protected.failure.message, /34794192.*OOM.*33554432/);
  assert.equal(evidence.protected.run.nativeUnavailableSamples, 0);
  assert.notEqual(evidence.protected.blankBaseline.privateBytes, evidence.protected.loadedIdle.privateBytes);
  assert.ok(Object.values(evidence.protected.cleanup).every((value) => value === true));
  assert.ok(Object.values(evidence.protected.cleanupIndependentlyChecked).every((value) => value === true));
  assert.equal(evidence.hostedArtifacts.remainingVerified, 0);
  assert.equal(evidence.hostedArtifacts.sourceBundleDownloaded, false);
});
