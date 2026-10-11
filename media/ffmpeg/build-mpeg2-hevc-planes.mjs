// Fresh hosted Linux build only; never mutate public engines or local media.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { makeHevcPlaneOuterBuilder } from "./mpeg2-hevc-plane-builder-recipe.mjs";
import { applyHevcSingleIdleGetBuffer, reverseHevcSingleIdleGetBuffer, makeHevcSingleIdleBuffer } from "./mpeg2-hevc-plane-source.mjs";
import { reverseSingleIdlePlaneBuffer } from "./mpeg2-encoder-plane-source.mjs";
import { reversePlaneFactoryPrototype } from "./mpeg2-encoder-plane-prototype-source.mjs";
assert.equal(process.platform, "linux", "Use isolated no-Docker hosted builder");
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/mpeg2-split-pipeline-output");
const recipe = makeHevcPlaneOuterBuilder(await readFile(path.join(root, "media/ffmpeg/build-mpeg2-alignment16.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("hevc-plane-builder-");
try {
  const file = path.join(runtime.directory, "builder.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`HEVC plane build exit ${code}/${signal}`))); });
  const smokeBytes = await readFile(path.join(output, "hevc-plane-smoke.json")), smoke = JSON.parse(smokeBytes);
  assert.equal(smoke.status, "passed"); assert.equal(smoke.scope, "actual-libavutil-hevc-plane-lifecycle-not-conversion");
  assert.equal(smoke.selectorConfigurations, 80); assert.equal(smoke.sequentialReuses, 200000); assert.equal(smoke.sequentialFreshAllocations, 1);
  assert.equal(smoke.maximumIdleEntriesPerSelectedPool, 1); assert.equal(smoke.conversionsPerformed, 0);
  for (const key of ["liveReferencesUnchanged", "uninitWithLiveReferencesPassed", "allocatorCallbackFailurePassed", "zeroEveryAcquisitionPassed", "nonselectedCacheUnchanged"]) assert.equal(smoke[key], true);
  const get = await readFile(path.join(output, "hevc-plane-get-buffer.c"), "utf8"), buffer = await readFile(path.join(output, "hevc-plane-buffer.c"), "utf8");
  assert.equal(applyHevcSingleIdleGetBuffer(reverseHevcSingleIdleGetBuffer(get)), get);
  assert.equal(makeHevcSingleIdleBuffer(reverseSingleIdlePlaneBuffer(reversePlaneFactoryPrototype(buffer))), buffer);
  const manifestPath = path.join(output, "build-manifest.json"), manifest = JSON.parse(await readFile(manifestPath));
  assert.deepEqual(readWasmMemoryLimits(await readFile(path.join(output, "within-mpeg2-split.wasm"))), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.equal(manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.notEqual(manifest.artifacts["within-mpeg2-split.wasm"], "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014");
  for (const name of ["hevc-plane-smoke.json", "hevc-plane-get-buffer.c", "hevc-plane-buffer.c"]) manifest.artifacts[name] = sha(await readFile(path.join(output, name)));
  for (const name of ["build-mpeg2-hevc-planes.mjs", "mpeg2-hevc-plane-builder-recipe.mjs", "mpeg2-hevc-plane-recipe.mjs", "mpeg2-hevc-plane-source.mjs", "mpeg2-hevc-plane-policy.h", "patch-mpeg2-hevc-planes.mjs", "mpeg2-encoder-plane-source.mjs", "mpeg2-encoder-plane-prototype-source.mjs", "mpeg2-encoder-plane-smoke.c"])
    manifest.sources["media/ffmpeg/" + name] = sha(await readFile(path.join(root, "media/ffmpeg", name)));
  manifest.scope = "private-alignment16-hevc-plane-single-idle-not-browser-acceptance";
  manifest.hevcPlanes = { actualWasmLifecycle: smoke, getBufferSha256: sha(get), bufferSha256: sha(buffer),
    maximumIdleEntriesPerSelectedPool: 1, selector: "HEVC/single-thread/decoder/nonpoisoned", zeroEveryAcquisitionIncludingPadding: true,
    privateFramePoolFieldAddedBytes: 4, generatedOuterBuilder: recipe.generated, generatedOuterBuilderSha256: recipe.generatedSha256,
    liveReferencesChanged: false, codecSettingsChanged: false, publicStructAbiChanged: false, heapLimitsRaised: false,
    browserFidelityVerified: false, fullOriginalCompleted: false, completeChromiumMemoryAcceptance: false, speedGainProven: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
