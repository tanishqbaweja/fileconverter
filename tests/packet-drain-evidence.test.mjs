import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("actual candidate retains all107 parent sources in116 and changes only packet handler among15 typed controls", async () => {
  const native = JSON.parse(await read("evidence/packet-drain-native-38673138419.json"));
  const build = JSON.parse(await read(native.proof.path));
  assert.equal(sha(await read(native.proof.path)), native.proof.sha256);
  assert.equal(build.run.conclusion, "success"); assert.equal(build.run.headSha, "6f18b41e05cbd2550b9d7db92825e576773cb125");
  assert.equal(native.sourceCount, 116); assert.deepEqual(native.sourcePins, build.manifest.sources);
  const parentBuild = JSON.parse(await read("evidence/mpeg2-packet-interleave-build-38671160915.json"));
  for (const file of Object.keys(parentBuild.manifest.sources)) assert.ok(file in native.sourcePins, file);
  const archive = await read(native.archive.path); assert.equal(sha(archive), native.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 2097152 }); assert.equal(sha(raw), native.archive.restoredSha256);
  const sources = JSON.parse(raw); assert.deepEqual(native.currentSourcePins, native.postSourcePins);
  for (const [file, hash] of Object.entries(native.sourcePins)) {
    assert.equal(sha(Buffer.from(sources.sourcePreimages[file].data, "base64")), hash);
    assert.equal(sha(await read(file)), native.currentSourcePins[file], file);
  }
  const parent = JSON.parse(await read("evidence/mvf-arena-native-38643550000.json"));
  assert.deepEqual(native.decoder.memories, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.equal(native.decoder.sha256, "b65cc5991e9a74486066a9b442b1c0036d04f7e5a925bcb951971e0f060df152");
  assert.equal(native.functions.length, 15);
  const changed = native.functions.filter(row => row.bodySha256 !== parent.functions.find(old => old.name === row.name).bodySha256);
  assert.deepEqual(changed.map(row => row.name), ["mpeg2_packets"]);
  assert.equal(build.manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.equal(native.actualPacketDrain.onlyQueueDrainAdded, true);
  assert.equal(native.runtimeBrowserHookQualified, false); assert.equal(native.publicAcceptance, false);
});
test("actual headless current-Chrome control preserves native binary except exports and cleans11 owned births", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-15T03-05-18-782Z-packet-drain-browser-control.json"));
  const receipt = JSON.parse(await read("evidence/2026-10-15T03-05-18-782Z-packet-drain-browser-control-executed-sources.json"));
  assert.equal(proof.status, "passed-synthetic-abort-control"); assert.equal(proof.browserVersion, "155.0.8059.40");
  assert.equal(receipt.failure, null); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  assert.deepEqual(receipt.nativeEnvelope, receipt.nativeEnvelopePost);
  assert.equal(receipt.sourceSealScopes.native.actualFiles, 116); assert.equal(receipt.sourceSealScopes.browser.actualFiles, 41);
  assert.equal(receipt.sourceSealScopes.distinctTotalFiles, 155);
  const zipped = await read(receipt.archive.path); assert.equal(sha(zipped), receipt.archive.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const source = JSON.parse(raw);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(Buffer.from(source.preimages[file], "base64")), hash);
    assert.equal(sha(await read(file)), hash, file);
  }
  assert.equal(proof.exportOnlyControl.onlyExportSectionChanged, true);
  assert.equal(proof.exportOnlyControl.allCodeDataTypesImportsTablesMemoryExact, true);
  assert.equal(proof.exportOnlyControl.usableForMediaOrAcceptance, false);
  assert.equal(proof.result.terminal.originalCalls, 1); assert.equal(proof.result.terminal.converterInvoked, false);
  assert.equal(proof.cleanup.checkedNativeIdentities, 11); assert.equal(proof.cleanup.allSampledNativeBirthsAbsent, true);
  assert.equal(proof.cleanup.runtimeProfileRemoved, true); assert.equal(receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch, true);
  await assert.rejects(access(receipt.ownedCaller), { code: "ENOENT" });
  await assert.rejects(access(proof.runtimeDirectory), { code: "ENOENT" });
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.protectedSourceRead, false);
});
test("hosted duplicate is removed only after all20 local tools and actual native evidence are verified", async () => {
  const proof = JSON.parse(await read("evidence/packet-drain-hosted-artifact-cleanup-38673138419.json"));
  assert.equal(proof.remainingHostedArtifacts, 0); assert.equal(proof.deletedArtifact.id, 11944892861);
  assert.equal(proof.allTwentyLocalToolsVerifiedAndRetained, true); assert.equal(proof.localToolBytes, 9740577);
  assert.equal(proof.ownedRuntimeAbsent, true);
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256);
});
