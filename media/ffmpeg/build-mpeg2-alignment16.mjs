// Private hosted Linux candidate, no Docker/public mutation. SDK source override
// is restored BEFORE separate encoder compilation and again in finally.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { patchAlignment16Sdk, restoreAlignment16Sdk } from "./mpeg2-alignment16-sdk.mjs";
import { makeAlignment16Builder } from "./mpeg2-alignment16-builder-recipe.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/mpeg2-split-pipeline-output");
assert.equal(process.platform, "linux", "Use isolated no-Docker hosted builder");
const prior = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), "utf8");
const { generated } = makeAlignment16Builder(prior, root);
let runtime, state, sdkRecipe;
try {
  runtime = await createOwnedRuntimeScratch("alignment16-builder-"); state = path.join(runtime.directory, "sdk-state.json");
  sdkRecipe = await patchAlignment16Sdk(root, state);
  const builder = path.join(runtime.directory, "builder.mjs"); await writeFile(builder, generated, { flag: "wx" });
  const child = spawn(process.execPath, [builder], { cwd: root, env: { ...runtime.env, WITHIN_ALIGNMENT16_SDK_STATE: state }, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Alignment16 build exit ${code}/${signal}`))); });
  const restore = await restoreAlignment16Sdk(root, state); assert.equal(restore.upstreamSourceRestored, true);
  const smokeBytes = await readFile(path.join(output, "alignment16-smoke.json")), smoke = JSON.parse(smokeBytes);
  assert.equal(smoke.passed, 13); assert.equal(smoke.cases, 13); assert.equal(smoke.mallocAlignment, 16);
  assert.equal(smoke.heapBytes, 33554432); assert.equal(smoke.largeWrapperRejectedFreshPointer, false); assert.equal(smoke.conversionsPerformed, 0);
  const manifestPath = path.join(output, "build-manifest.json"), manifest = JSON.parse(await readFile(manifestPath));
  assert.equal(manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.notEqual(manifest.artifacts["within-mpeg2-split.wasm"], "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039");
  for (const file of ["media/ffmpeg/build-mpeg2-alignment16.mjs", "media/ffmpeg/mpeg2-alignment16-builder-recipe.mjs", "media/ffmpeg/mpeg2-alignment16-sdk.mjs", "media/ffmpeg/mpeg2-alignment16-recipe.mjs", "media/ffmpeg/mpeg2-alignment16-smoke.c"])
    manifest.sources[file] = sha(await readFile(path.join(root, file)));
  manifest.artifacts["alignment16-smoke.json"] = sha(smokeBytes);
  manifest.scope = "private-decoder-dlmalloc-alignment16-fixed-heaps-not-browser-acceptance";
  manifest.allocationAttempt.allocatorPolicyChanged = true;
  manifest.alignment16 = { originalSdkSourceSha256: restore.sourceSha256, decoderMallocAlignment: 16, separateEncoderSdkRestored: true, actualWasmSmoke: smoke,
    generatedSdkSourceSha256: sdkRecipe.generatedSha256, upstreamAllocatorBodyUnchanged: true, allocatorPolicyChanged: true,
    generatedBuilderSha256: sha(generated), liveReferencesChanged: false, codecSettingsChanged: false, heapLimitsRaised: false, browserFidelityVerified: false, speedGainProven: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
} finally {
  if (runtime) {
    let backupExists = true;
    try { await access(state); } catch (error) { if (error.code === "ENOENT") backupExists = false; else throw error; }
    // Do not erase the only recovery copy when restoration fails.
    if (backupExists) {
      try { await restoreAlignment16Sdk(root, state); }
      catch (error) { console.error(`SDK restore failed; recovery backup retained at ${state}`); throw error; }
    }
    await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  }
}
