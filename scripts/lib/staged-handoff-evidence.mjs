import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";

// Lifecycle observations are NOT evidence of physical OS memory reclamation.
export function verifyHandoffBuildAndEvents(build, generated, report) {
  assert.deepEqual(build.sourcePins, build.postSourcePins);
  assert.equal(build.forBrowser, true); assert.equal(build.normalSourcesEdited, false);
  for (const key of ["codecParametersChanged", "nativeWasmChanged", "copyLoopChanged", "publicAcceptance", "primaryMemoryAcceptance"])
    assert.equal(build[key], false, key);
  assert.equal(build.fixedCopyBufferBytes, 524288);
  assert.equal(generated.handoffLifecycle.buildProofPath.endsWith("-staged-worker-handoff-build.json"), true);
  assert.equal(generated.handoffLifecycle.nativeSettingsUnchanged, true);
  assert.equal(generated.handoffLifecycle.nativePeakWasmGateUnchanged, true);
  assert.equal(report.manifest.aggregateWasmMemoryBytes, 50331648);
  assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"], "e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e");
  assert.equal(report.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.ok(generated.spec.includes("expect(state.metrics?.peakWasmMemoryBytes).toBe(expectedMemoryBytes)"));
  assert.ok(generated.spec.includes("expect(state.metrics?.wasmMemoryBytes).toBe(0)"));
  const assets = Object.fromEntries(build.assets.map(row => [row.role, row]));
  assert.equal(Object.keys(assets).length, 3); assert.ok(assets["save-worker"].bytes < 32768);
  const lifecycle = report.rows.filter(row => row.kind === "actual-staged-worker-handoff-lifecycle");
  assert.equal(lifecycle.length, 4);
  let saveWorkersObserved = 0;
  for (const row of lifecycle) {
    assert.equal(row.observedEventsNotPhysicalMemoryReleaseProof, true);
    assert.equal(row.publicAcceptance, false); assert.ok(row.events.length > 0 && row.events.length <= 32);
    let active = null, closedCodec = false, saves = 0;
    for (const event of row.events) {
      assert.ok(["codec", "save"].includes(event.role)); assert.ok(Number.isSafeInteger(event.observedAt));
      const url = new URL(event.url); assert.equal(url.hostname, "127.0.0.1");
      assert.equal(url.pathname, assets[event.role === "codec" ? "codec-worker" : "save-worker"].url);
      if (event.event === "created") {
        assert.equal(active, null, "No concurrently observed codec/save workers");
        if (event.role === "save") { assert.equal(closedCodec, true); closedCodec = false; saves++; }
        active = event.role;
      } else {
        assert.equal(event.event, "closed"); assert.equal(active, event.role); active = null;
        if (event.role === "codec") closedCodec = true;
      }
    }
    assert.ok(saves >= 1); assert.notEqual(active, "save", "Save worker must be observed retired");
    saveWorkersObserved += saves;
  }
  assert.equal(saveWorkersObserved, 5, "Four successes and one genuine final-write failure");
  return { lifecycleRows: 4, saveWorkersObserved, observedWorkerUrlsMatchCompiledBuild: true,
    eventDigest: sha(JSON.stringify(lifecycle)), nativeAndCopySettingsUnchanged: true,
    actualAppResponseBytesHashed: false, physicalReleaseBeforeCopyProven: false,
    primaryMemoryAcceptance: false, fullOriginalAcceptance: false, publicAcceptance: false, speedGainProven: false };
}
