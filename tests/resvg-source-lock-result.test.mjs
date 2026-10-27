import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pins, sha, inspectCandidateLock, pinCargoManifest } from "../images/resvg-source/source-pins.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
const proof = JSON.parse(await read("evidence/2026-10-27-svg-source-lock-terminal.json"));
test("one actual hosted SVG lock result matches its dispatch and bounded artifact without claiming compilation", async () => {
  const dispatch = JSON.parse(await read("evidence/2026-10-27-svg-source-lock-dispatch.json"));
  assert.equal(proof.runId, dispatch.runId); assert.equal(proof.headSha, dispatch.headSha);
  assert.equal(proof.status, "completed"); assert.equal(proof.conclusion, "success");
  assert.ok(Date.parse(proof.observedAt) >= Date.parse(dispatch.nextStatusCheckNotBefore));
  assert.equal(proof.duplicateDispatchUsed, false); assert.equal(proof.otherJobsSkippedNotPassed, true);
  assert.equal(proof.artifact.bytes, 10942); assert.match(proof.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal(proof.artifactDigestAndThreeEntryAllowlistVerified, true);
  assert.equal(proof.ownedResolverScratchCleanupExitSuccessful, true); assert.equal(proof.publicEngineUnchangedCheckPassed, true);
  for (const field of ["sourceCompilationAttempted", "compilerCompatibilityVerified", "byteExactPublicationReproduction", "historicalDependencyGraphRecovered", "conversionOrMemoryAcceptance", "originalGoalComplete"])
    assert.equal(proof[field], false, field);
});
test("retained real lock has 151 crate checksums, six exact Git pins and exact bindgen family with provenance hashes", async () => {
  const text = await read(proof.retainedLockPath), summary = inspectCandidateLock(text);
  const provenance = JSON.parse(await read(proof.retainedProvenancePath));
  assert.equal(Buffer.byteLength(text), proof.lockBytes); assert.equal(sha(text), proof.lockSha256);
  assert.deepEqual(summary, provenance.lock); assert.deepEqual(provenance.pins, pins);
  assert.equal(summary.packages, 158); assert.equal(summary.registryPackages, 151); assert.equal(summary.gitPackages, 6);
  assert.match(text, /^version = 3$/m);
  assert.equal(provenance.patchedCargoSha256, sha(pinCargoManifest(await read("fixtures/source/resvg-2.6.2-Cargo.toml"))));
  assert.equal(provenance.cargoVersion, proof.cargoVersion);
  assert.equal(provenance.compilerCompatibilityVerified, false);
  assert.equal(provenance.historicalDependencyGraphRecovered, false);
});
