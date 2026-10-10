import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { verifyEncoderPlaneBuildEvidence, verifyEncoderPlaneGoldenReport } from "../scripts/lib/encoder-plane-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const buildBytes = await read("evidence/mpeg2-encoder-plane-build-38044000567.json"), build = JSON.parse(buildBytes);
const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
const golden = JSON.parse(await read("evidence/2026-10-10T10-17-44-886Z-encoder-plane-browser-goldens.json"));
async function restore(row) {
  const compressed = await read(row.path); assert.equal(compressed.length, row.bytes); assert.equal(sha(compressed), row.sha256);
  const restored = gunzipSync(compressed, { maxOutputLength: 8388608 }); assert.equal(restored.length, row.restoredBytes);
  assert.equal(sha(restored), row.restoredSha256); return restored;
}
test("Actual changed encoder Wasm lifecycle succeeds with real fixed memory/source reversal/80 selectors/200000 reuses, not browser-memory acceptance", async () => {
  verifyEncoderPlaneBuildEvidence(build, branch);
  assert.equal(build.encoderManifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(build.encoderManifest.artifacts["split-encoder.mjs"], "00c0d1b4435e9294c6784e9ccaf196f171caa3c9cc3d4c7a4aab1a47c6d8bb5e");
  assert.equal(build.reusableToolBytes, 7922905); assert.equal(build.encoderManifest.decoderBuilt, false);
  assert.equal(build.manifest.scope, "verified-component-assembly-not-one-build-or-browser-acceptance");
  assert.equal(build.collectorSourceSha256, sha(await read("scripts/collect-mpeg2-encoder-plane-build.mjs")));
  for (const field of ["originalRead", "originalOomResolved", "speedImprovementProven", "publicAcceptance"]) assert.equal(build[field], false);
});
test("Actual production-browser three conversions match prior pixel/output/audio/clock goldens and two adverse recoveries; protected original/source pins/cleanup unchanged", async () => {
  assert.equal(golden.status, "five-headless-goldens-byte-exact-and-recovery-passed"); assert.equal(golden.failure, null);
  assert.equal(golden.build.sha256, sha(buildBytes));
  const archived = JSON.parse(await restore(golden.generatedArchive));
  const raw = JSON.parse(await restore(golden.report.archive));
  const prior = JSON.parse(await read("evidence/mpeg2-late-abort-goldens-2026-10-08.json"));
  const analysis = verifyEncoderPlaneGoldenReport(raw, prior.reports[0].report, build);
  assert.deepEqual(analysis, golden.analysis); assert.equal(analysis.genuineConversions, 3); assert.equal(analysis.adverseRecoveryCases, 2);
  for (const [file, hash] of Object.entries(golden.sourcePins)) { assert.equal(golden.postSourcePins[file], hash); assert.equal(sha(await read(file)), hash); }
  assert.deepEqual(archived.sourcePins, golden.sourcePins);
  assert.deepEqual(golden.protectedPre, golden.protectedPost); assert.equal(golden.protectedPost.bytes, 2958573265);
  assert.equal(golden.protectedPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(golden.cleanup.normalAppAndCssUnchanged, true); assert.equal(golden.cleanup.privateAdditionsAbsent, true);
  assert.equal(golden.cleanup.ownedWrapperAbsent, true); assert.deepEqual(golden.cleanup.newFixtureDirsRemaining, []);
  await assert.rejects(access(golden.cleanup.ownedWrapper), { code: "ENOENT" });
  await assert.rejects(access(golden.cleanup.helpers.runtime), { code: "ENOENT" });
  for (const row of golden.cleanup.helpers.launchRecords) assert.equal(row.absence.status, "owned-identity-absent");
  for (const field of ["completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance"]) assert.equal(golden[field], false);
});
test("Only exact redundant compiled-tool archive removed after local hash verification; pinned tools remain recoverable for full stress", async () => {
  const cleanup = JSON.parse(await read("evidence/mpeg2-encoder-plane-hosted-cleanup-38044000567.json"));
  assert.equal(cleanup.buildProofSha256, sha(buildBytes)); assert.equal(cleanup.exactArtifactId, build.artifact.id);
  assert.equal(cleanup.after.total_count, 0); assert.equal(cleanup.localToolsVerified, true);
  assert.equal(cleanup.localToolsRetainedForBrowserStress, true); assert.equal(cleanup.recoverableFromVerifiedLocalToolsAndPinnedRebuild, true);
  assert.equal(cleanup.ownedRuntimeRemoved, true); assert.equal(cleanup.originalReadOrChanged, false);
  assert.equal(cleanup.sourceSha256, sha(await read("scripts/cleanup-encoder-plane-hosted-artifact.mjs")));
});
test("One redundant raw browser report removed only after byte-exact lossless recovery; original evidence unchanged and compact archive available", async () => {
  const compact = JSON.parse(await read("evidence/mpeg2-encoder-plane-golden-compaction-2026-10-10.json"));
  assert.equal(compact.exactByteRecoveryVerifiedBeforeRemoval, true); assert.equal(compact.rawRemoved.sha256, golden.report.sha256);
  assert.deepEqual(compact.retained, golden.report.archive); await restore(compact.retained);
  await assert.rejects(access(path.join(root, compact.rawRemoved.path)), { code: "ENOENT" });
  assert.equal(compact.protectedOriginalTouched, false);
  assert.equal(compact.sourceSha256, sha(await read("scripts/compact-encoder-plane-golden-report.mjs")));
});
