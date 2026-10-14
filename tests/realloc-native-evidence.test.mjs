// Actual compiled controls/static ABI/cleanup, NOT browser/full-file acceptance.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
import { verifyReallocNativeEnvelope } from "../scripts/lib/realloc-native-envelope.mjs";
const root = path.resolve(import.meta.dirname, ".."), runId = "38526781934", read = file => readFile(path.join(root, file));
const buildBytes = await read(`evidence/mpeg2-realloc-attempt-build-${runId}.json`), build = JSON.parse(buildBytes);
const branch = JSON.parse(await read("evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json"));
const layout = JSON.parse(await read(`evidence/realloc-native-layout-${runId}.json`));
test("actual corrected exact-head no-Docker build passes10 dispatch and6 real-libavutil alias/content/constructor controls", () => {
  assert.equal(build.run.databaseId, 38526781934); assert.equal(build.run.headSha, "dd169b15703045092b8477f4b744aa6dabf94afe");
  assert.equal(build.run.headSha, branch.commit); assert.equal(build.run.status, "completed"); assert.equal(build.run.conclusion, "success");
  assert.equal(build.hostedCleanupStepPassed, true); assert.equal(build.downloadRuntimeRemoved, true);
  const row = build.manifest.reallocAttempt;
  assert.equal(row.slotBytes, 64); assert.equal(row.maximumSlots, 1);
  assert.equal(row.actualWasmSyntheticDispatch.passed, 10); assert.equal(row.actualWasmSyntheticDispatch.outerMetadataPreservedAcrossRecursion, true);
  assert.equal(row.actualWasmLibavutil.passed, 6); assert.equal(row.actualWasmLibavutil.aliasContentPreserved, true);
  assert.equal(row.actualWasmLibavutil.constructorBindingVerified, true);
  assert.deepEqual(JSON.parse(row.actualExactSource), row.actualWasmLibavutil); assert.equal(sha(row.actualExactSource), row.actualSha256);
  assert.deepEqual(JSON.parse(row.dispatchExactSource), row.actualWasmSyntheticDispatch); assert.equal(sha(row.dispatchExactSource), row.dispatchSha256);
  for (const flag of ["allocatorPolicyChanged", "bufferReferenceOwnershipChanged", "codecSettingsChanged", "heapLimitsChanged", "actualOriginalFailedRequestProven",
    "browserFailurePathQualified", "fullOriginalCompleted", "completeChromiumMemoryAcceptance", "speedGainProven", "publicAcceptance"]) assert.equal(row[flag], false);
});
test("all86 compiled native executed/current/post preimages join without changing source-envelope limits", async () => {
  const envelope = await verifyReallocNativeEnvelope(root, build, buildBytes, branch);
  assert.deepEqual(layout.nativeEnvelope, envelope); assert.equal(envelope.sourceCount, 86); assert.equal(envelope.unchanged128File2MiBEnvelopeCaps, true);
  await assert.rejects(verifyReallocNativeEnvelope(root, build, Buffer.from("wrong build bytes"), branch));
  await assert.rejects(verifyReallocNativeEnvelope(root, build, buildBytes, { ...branch, commit: "0".repeat(40) }));
  assert.equal(sha(await read("scripts/retain-mpeg2-realloc-native-sources.mjs")), JSON.parse(await read(envelope.path)).ownSource.sha256);
});
test("actual decoder fixed memory/map/typed bodies/constructor byte linkage verified, but decoder runtime binding remains false", async () => {
  const binary = await read(layout.binary.path); assert.equal(sha(binary), layout.binary.sha256);
  assert.equal(layout.binary.sha256, "eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c");
  assert.deepEqual(readWasmMemoryLimits(binary), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.equal(layout.layout.within_realloc_attempt_words.address, 1918912); assert.equal(layout.layout.within_realloc_attempt_words.bytes, 64);
  assert.equal(layout.layout._gm_.address, 1786760); assert.equal(layout.functions.length, 9);
  const actual = readWasmFunctionMetadata(binary, new Set(layout.functions.map(row => row.name)));
  for (const row of actual) assert.deepEqual(layout.functions.find(x => x.name === row.name), { ...row, bodySha256: sha(binary.subarray(row.bodyStart, row.bodyEnd)) });
  assert.equal(layout.constructor.typedBodySlotCallVerified, true); assert.equal(layout.constructor.glueModuleFieldsVerified, true);
  assert.equal(layout.constructor.runtimeDecoderBindingVerified, false); assert.equal(layout.browserFailurePathQualified, false);
  assert.equal(layout.fullOriginalAcceptance, false); assert.equal(layout.publicAcceptance, false);
  assert.equal(sha(await read(layout.ownSource.path)), layout.ownSource.sha256); assert.equal(sha(Buffer.from(layout.ownSource.preimage, "base64")), layout.ownSource.sha256);
});
test("all20 reusable local tools remain verified; exact redundant hosted archive deleted under unchanged ownership gates", async () => {
  assert.equal(build.files.length, 20); assert.equal(build.reusableToolBytes, 9727491);
  for (const row of build.files) { const bytes = await readFile(path.join(build.reusableToolDirectory, row.file)); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256); }
  const cleanup = JSON.parse(await read(`evidence/mpeg2-realloc-attempt-hosted-cleanup-${runId}.json`));
  assert.equal(cleanup.artifactBefore.id, 11876364236); assert.equal(cleanup.artifactBefore.workflow_run.head_sha, build.run.headSha);
  assert.equal(cleanup.artifactBefore.digest, build.artifact.digest); assert.equal(cleanup.artifactCountAfter, 0);
  assert.equal(cleanup.proofSha256, sha(buildBytes)); assert.equal(cleanup.localToolBytes, 9727491); assert.equal(cleanup.ownedRuntimeRemoved, true);
  const witness = JSON.parse(await read(`evidence/realloc-cleanup-executed-source-${runId}.json`));
  let reversed = witness.generatedSource;
  for (const [before, after] of witness.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(sha(reversed), witness.sourceSha256); assert.equal(sha(await read(witness.sourcePath)), witness.sourceSha256);
  assert.equal(witness.reverseExact, true); assert.equal(witness.ownedRuntimeRemoved, true);
  const collector = JSON.parse(await read(`evidence/realloc-recursive-build-collector-${runId}.json`));
  assert.equal(collector.failure, null); assert.deepEqual(collector.sourcePins, collector.postSourcePins); assert.equal(collector.ownedRuntimeRemoved, true);
  for (const [file, hash] of Object.entries(collector.sourcePins)) { assert.equal(sha(await read(file)), hash); assert.equal(sha(Buffer.from(collector.preimages[file], "base64")), hash); }
  await access(build.reusableToolDirectory);
});
