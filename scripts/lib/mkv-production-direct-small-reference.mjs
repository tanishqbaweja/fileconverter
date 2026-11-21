import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";

export const productionDirectSmallReference = Object.freeze({
  file: "evidence/2026-11-21T18-11-17-379Z-mkv-hevc-header-core-production-direct-small.json",
  sha256: "e60193130080011dd1b91c5fa5d3f11a79f3d55d5640c0a3c7c33365eccc2d22",
});

export function readProductionDirectSmallReference(bytes, currentTools, currentSourcePins) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), productionDirectSmallReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(r.status, "passed-unmodified-production-direct-small-not-public-or-scale-acceptance");
  assertSameMkvNativeBuild(r.candidateBuild, currentTools);
  for (const file of ["app/converter/ConverterApp.tsx", "lib/mkv-corrected-direct-qualification.ts", "workers/conversion.worker.ts",
    "workers/media-remux.ts", "workers/mkv-corrected-direct-output.ts", "workers/random-access-destination.ts"]) {
    assert.match(currentSourcePins[file] ?? "", /^[a-f0-9]{64}$/);
    assert.equal(currentSourcePins[file], r.sourcePins[file], `Small browser evidence does not cover changed production source: ${file}`);
  }
  assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "complete", "error", "complete"]);
  assert.ok(a.cases[1].cancellationBefore.outputBytes >= 65536);
  assert.match(a.cases[3].error, /destination rejected a bounded write/);
  assert.equal(a.workerResponses, 0); assert.equal(a.releaseWorker.overrides, false);
  assert.equal(a.productionWorkerBinding.sha256, a.releaseWorker.sha256);
  assert.equal(a.productionWorkerBinding.applicationSourcesPatched, false);
  assert.ok(a.memory.incrementalPrivateMiB <= 250 && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
  assert.deepEqual(a.forbiddenRequests, []);
  assert.ok(a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved && a.cases.every(c => c.outputRemoved));
  return { ...productionDirectSmallReference, workerSha256: a.releaseWorker.sha256, sameProductionSourcesAndNativeCore: true,
    recoveryScope: "small real handles, positive-payload cancellation and injected write rejection; not full-original adverse cases" };
}
