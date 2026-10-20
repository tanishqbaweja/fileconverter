import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("actual changed native build passed real arena lifetime controls without quality or heap changes", async () => {
  const build = JSON.parse(await read("evidence/mpeg2-mvf-arena-build-38643550000.json"));
  assert.equal(build.run.status, "completed"); assert.equal(build.run.conclusion, "success");
  assert.equal(build.run.headSha, "adb0c50b54564e351c0316e6b3bfb4e935b0ddb2");
  const mvf = build.manifest.mvfArena, smoke = mvf.actualWasmLifecycle;
  assert.equal(sha(mvf.exactSource), mvf.sha256); assert.deepEqual(JSON.parse(mvf.exactSource), smoke);
  assert.equal(smoke.scope, "actual-wasm32-mvf-arena-refstruct-not-conversion"); assert.equal(smoke.status, "passed");
  assert.equal(smoke.sequentialReuses, 200000); assert.equal(smoke.measuredReservedBytes, 6981216);
  assert.equal(smoke.constructorFailureCases, 2); assert.equal(smoke.initErrorFlagCases, 4);
  for (const field of ["overflowPreserved", "liveAliasesPreserved", "deferredClosePassed", "zeroEveryTimePassed", "nonselectedAndOversizeUnchanged", "ownedAllocationsBalanced"])
    assert.equal(smoke[field], true);
  for (const field of ["liveReferencesChanged", "idleObjectAdmissionChanged", "codecSettingsChanged", "heapLimitsChanged", "browserFidelityVerified", "fullOriginalCompleted", "completeChromiumMemoryAcceptance", "conversionSpeedGainProven", "publicAcceptance"])
    assert.equal(mvf[field], false);
  assert.equal(build.files.length, 20); assert.equal(build.reusableToolBytes, 9739246);
  assert.equal(build.manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
});
test("archived 99-source seal retains all93 parent paths/preimages within unchanged caps, not current-release identity", async () => {
  const proof = JSON.parse(await read("evidence/mvf-arena-native-38643550000.json"));
  const parent = JSON.parse(await read("evidence/ebml-reuse-native-38608791023.json"));
  const build = JSON.parse(await read(proof.proof.path));
  assert.equal(sha(await read(proof.proof.path)), proof.proof.sha256);
  assert.equal(proof.sourceCount, 99); assert.ok(proof.sourceCount <= 128);
  assert.deepEqual(proof.sourcePins, build.manifest.sources); assert.deepEqual(proof.currentSourcePins, proof.postSourcePins);
  for (const file of Object.keys(parent.sourcePins)) assert.ok(Object.hasOwn(proof.sourcePins, file), file);
  const zipped = await read(proof.archive.path); assert.equal(sha(zipped), proof.archive.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(raw), proof.archive.restoredSha256);
  const archive = JSON.parse(raw); assert.deepEqual(archive.sourcePins, proof.sourcePins);
  assert.deepEqual(Object.keys(archive.sourcePreimages).sort(), Object.keys(proof.sourcePins).sort());
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    const preimage = archive.sourcePreimages[file]; assert.equal(preimage.encoding, "base64");
    assert.equal(sha(Buffer.from(preimage.data, "base64")), hash);
    if (file !== ".github/workflows/reproduce-ffmpeg-nondocker.yml") assert.equal(hash, proof.currentSourcePins[file]);
  }
  assert.equal(proof.decoder.sha256, "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576");
  assert.deepEqual(proof.decoder.memories, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.equal(proof.layout.within_refstruct_abort_words.address, 1919120);
  assert.equal(proof.functions.find(row => row.name === "sbrk").functionIndex, 4444);
  assert.equal(proof.runtimeBrowserHookQualified, false); assert.equal(proof.publicAcceptance, false);
});
test("successful collector/qualifier preserve their exact executed derivatives and source pins", async () => {
  for (const file of ["evidence/mvf-arena-build-collector-38643550000.json", "evidence/mvf-arena-native-qualifier-38643550000.json"]) {
    const proof = JSON.parse(await read(file)); assert.equal(proof.failure, null); assert.equal(proof.ownedRuntimeAbsent, true);
    assert.equal(sha(proof.recipe.generated), proof.recipe.generatedSha256);
    assert.deepEqual(proof.sourcePins, proof.postSourcePins);
    for (const [name, hash] of Object.entries(proof.sourcePins)) {
      assert.equal(sha(Buffer.from(proof.sourcePreimages[name], "base64")), hash);
      assert.equal(sha(await read(name)), hash, name);
    }
  }
});
