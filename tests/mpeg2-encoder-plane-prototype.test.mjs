import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { applyPlaneFactoryPrototype, reversePlaneFactoryPrototype, PRIVATE_PLANE_FACTORY_DECLARATION } from "../media/ffmpeg/mpeg2-encoder-plane-prototype-source.mjs";
import { makeSingleIdleEncoderPlaneRecipe } from "../media/ffmpeg/mpeg2-encoder-plane-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const sha = value => createHash("sha256").update(value).digest("hex");
const proof = JSON.parse(await read("evidence/mpeg2-encoder-plane-build-failure-38043483415.json"));
async function restore(row) {
  const compressed = await read(row.path); assert.equal(compressed.length, row.bytes); assert.equal(sha(compressed), row.sha256);
  const restored = gunzipSync(compressed, { maxOutputLength: 4194304 }); assert.equal(restored.length, row.restoredBytes);
  assert.equal(sha(restored), row.restoredSha256); return restored;
}
test("Actual compiler failure stays failed with full exact log/Git source preimage, not an optional configure-probe or pool-runtime failure", async () => {
  assert.equal(proof.run.databaseId, 38043483415); assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "failure");
  assert.equal(proof.run.headSha, "a446deb25583b8b22de4da216222da91991ab4fd");
  assert.equal(proof.failureRemainsFailed, true); assert.equal(proof.compiledLifecycleExecuted, false); assert.equal(proof.compiledEncoderProduced, false);
  const logs = (await restore(proof.archives.failedStepLogs)).toString();
  assert.match(logs, /libavutil\/buffer\.c:265:15: error: no previous prototype/);
  assert.ok(logs.indexOf("License: LGPL version 2.1 or later") < logs.indexOf("no previous prototype"));
  assert.equal(proof.optionalStdbitConfigureProbeNotCause, true); assert.equal(proof.hostedCleanupStepPassed, true);
  const frozen = JSON.parse(await restore(proof.archives.executedSources));
  assert.equal(frozen.commit, proof.run.headSha);
  for (const [file, digest] of Object.entries(proof.executedSourcePins)) assert.equal(sha(frozen.sources[file]), digest);
  for (const file of ["media/ffmpeg/build-mpeg2-encoder-planes.mjs", "media/ffmpeg/mpeg2-encoder-plane-recipe.mjs"])
    assert.notEqual(sha(await read(file)), proof.executedSourcePins[file], "Changed files must not silently repin the actual failed execution");
  assert.equal(proof.collectorSha256, sha(await read("scripts/collect-encoder-plane-build-failure.mjs")));
});
test("Private declaration is the only source correction, fully reversible to actual failed plane policy; repeats or changed source rejected", async () => {
  const old = JSON.parse(gunzipSync(await read("outputs/reports/mpeg2-encoder-plane-source-preflight-2026-10-10.json.gz"))).changedBuffer;
  const fixed = applyPlaneFactoryPrototype(old);
  assert.equal(fixed.replace(PRIVATE_PLANE_FACTORY_DECLARATION, ""), old);
  assert.equal(reversePlaneFactoryPrototype(fixed), old);
  assert.equal(sha(fixed), "76fcae1c9409074b9b287d77d189ba06ab84e680e818a7649c56a6ad43db081a");
  assert.throws(() => applyPlaneFactoryPrototype(fixed)); assert.throws(() => applyPlaneFactoryPrototype(old + "\n"));
  assert.throws(() => reversePlaneFactoryPrototype(fixed + "\n"));
});
test("Changed private recipe applies declaration before configure, keeps strict compiler/settings/heaps and actual compiled lifecycle gate", async () => {
  const { generated } = makeSingleIdleEncoderPlaneRecipe((await read("media/ffmpeg/build-mpeg2-split-encoder.sh")).toString());
  assert.ok(generated.indexOf("patch-mpeg2-encoder-plane-prototype.mjs") < generated.indexOf("emconfigure ./configure"));
  assert.ok(generated.includes("76fcae1c9409074b9b287d77d189ba06ab84e680e818a7649c56a6ad43db081a libavutil/buffer.c"));
  assert.equal((generated.match(/-sINITIAL_MEMORY=16777216/g) ?? []).length, 3);
  assert.ok(!generated.includes("-Wno-missing-prototypes") && !generated.includes("-Wno-error"));
  assert.ok(generated.includes("encoder-plane-smoke.c"));
  const builder = (await read("media/ffmpeg/build-mpeg2-encoder-planes.mjs")).toString();
  assert.ok(builder.includes("reverseSingleIdlePlaneBuffer(reversePlaneFactoryPrototype(patchedBuffer))"));
  assert.ok(builder.includes("completeChromiumMemoryAcceptance: false"));
  await assert.rejects(access(path.join(root, "work/mpeg2-split-encoder-build")), { code: "ENOENT" });
});
