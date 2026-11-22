import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";
import { productionDirectSmallReference, readProductionDirectSmallReference } from "./mkv-production-direct-small-reference.mjs";

export const currentMkvProductionRecovery = Object.freeze({
  file: "evidence/2026-11-22T08-27-44-808Z-mkv-hevc-header-core-production-static-small.json",
  sha256: "704a5869f93e7c9b0bcb87f022a918389037c8a3e39746f86b5054eefef424b0",
});

const hashPattern = /^[a-f0-9]{64}$/;
export function readCurrentMkvProductionRecovery(bytes, currentTools, currentSourcePins) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), currentMkvProductionRecovery.sha256);
  const r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(r.arms.length, 1);
  assert.equal(r.status, "passed-production-static-small-not-public-or-scale-acceptance");
  for (const key of ["headed", "browserServicesDisabled", "productionFilesReplaced", "nativeConversionUsed", "publicAcceptance"])
    assert.equal(r[key], false);
  assert.equal(r.peakLimitMiB, 250); assert.equal(r.cleanupLimitMiB, 96);
  assertSameMkvNativeBuild(r.candidateBuild, currentTools);
  for (const file of ["app/converter/ConverterApp.tsx", "lib/opfs-activity.ts", "lib/mkv-corrected-direct-qualification.ts",
    "workers/conversion.worker.ts", "workers/media-remux.ts", "workers/mkv-corrected-direct-output.ts", "workers/random-access-destination.ts"]) {
    assert.match(currentSourcePins[file] ?? "", hashPattern);
    assert.equal(currentSourcePins[file], r.sourcePins[file], `Small browser evidence does not cover changed production source: ${file}`);
  }
  const page = a.productionPageBinding;
  assert.equal(page.securityHeadersVerified, true); assert.ok(page.browserResponses > 0);
  assert.match(page.relative, /^assets\/ConverterApp-[\w-]+\.js$/);
  assert.match(page.sha256, hashPattern);
  assert.ok(Number.isSafeInteger(page.bytes) && page.bytes > 0 && page.bytes <= 1048576);
  assert.equal(a.workerResponses, 0); assert.equal(a.releaseWorker.overrides, false);
  assert.match(a.releaseWorker.sha256, hashPattern);
  assert.equal(a.productionWorkerBinding.sha256, a.releaseWorker.sha256);
  assert.equal(a.productionWorkerBinding.applicationSourcesPatched, false);
  assert.equal(r.staticDelivery.responseBodiesOverridden, false);
  assert.equal(a.staticPackage.browserResponseBodiesOverridden, 0);
  assert.deepEqual(a.engineResponses, { module: 5, wasm: 5 });
  assert.deepEqual(a.engineResponses, a.directEngineRequests);
  assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "complete", "error", "complete"]);
  const completed = a.cases.filter(c => c.state === "complete");
  for (const c of completed) assert.ok(c.validation.candidateGate.passed && c.validation.outputSha256 === completed[0].validation.outputSha256);
  assert.ok(a.cases[1].cancellationBefore.outputBytes >= 65536);
  assert.match(a.cases[3].error, /destination rejected a bounded write/);
  assert.ok(a.memory.validSamples > 0 && a.memory.incrementalPrivateMiB <= 250 && Number.isFinite(a.memory.cleanupAboveIdleMiB) && a.memory.cleanupAboveIdleMiB <= 96);
  assert.deepEqual(a.forbiddenRequests, []);
  assert.deepEqual(r.originalAfter, r.originalBefore);
  assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved && a.cases.every(c => c.outputRemoved));
  return { ...currentMkvProductionRecovery, workerSha256: a.releaseWorker.sha256,
    page: { relative: page.relative, sha256: page.sha256, bytes: page.bytes },
    sameProductionSourcesAndNativeCore: true, sameStaticCoreAndWorker: true,
    recoveryScope: "small real served-code handles, positive-payload cancellation and injected write rejection; not full-original adverse cases" };
}

/** Both early build-file binding and the live HTTP binding use this identity. */
export function assertMkvRecoveryPage(binding, recovery) {
  for (const key of ["relative", "bytes", "sha256"]) {
    assert.equal(binding?.[key], recovery.page[key], `Converter page bundle does not match small recovery: ${key}`);
  }
}

/** Historical reports may resolve only one of the two named, hash-pinned receipts. */
export async function replayMkvProductionRecovery(report, read) {
  const { file } = report.productionDirectRecoveryReference;
  if (file === currentMkvProductionRecovery.file) {
    return readCurrentMkvProductionRecovery(await read(file), report.candidateBuild, report.sourcePins);
  }
  assert.equal(file, productionDirectSmallReference.file, "Unrecognized recovery receipt");
  return readProductionDirectSmallReference(await read(file), report.candidateBuild, report.sourcePins);
}
