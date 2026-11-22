import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";

export const mkvStaticSmallReference = Object.freeze({
  file: "evidence/2026-11-22T07-47-59-120Z-mkv-hevc-header-core-production-static-small.json",
  sha256: "2a062b2a11260cda9a2d3aeac6ceedf7d0814f7f4b610022429ab9c3a15b4c0d",
});

export function readMkvStaticSmallReference(bytes, tools, workerSha256) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), mkvStaticSmallReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(r.status, "passed-production-static-small-not-public-or-scale-acceptance");
  assert.equal(r.staticDelivery.responseBodiesOverridden, false);
  assertSameMkvNativeBuild(r.candidateBuild, tools);
  assert.equal(a.releaseWorker.sha256, workerSha256);
  assert.equal(a.staticPackage.browserResponseBodiesOverridden, 0);
  assert.deepEqual(a.engineResponses, { module: 5, wasm: 5 });
  assert.deepEqual(a.engineResponses, a.directEngineRequests);
  assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "complete", "error", "complete"]);
  assert.ok(a.cases[1].cancellationBefore.outputBytes >= 65536);
  assert.match(a.cases[3].error, /destination rejected a bounded write/);
  assert.ok(a.cases.every(c => c.outputRemoved) && a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved);
  assert.ok(a.memory.incrementalPrivateMiB <= 250 && Number.isFinite(a.memory.cleanupAboveIdleMiB) && a.memory.cleanupAboveIdleMiB <= 96);
  return { ...mkvStaticSmallReference, workerSha256, sameStaticCoreAndWorker: true, recoveryScope: "small served-layout recovery only" };
}
