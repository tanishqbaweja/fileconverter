// Fresh isolated hosted Linux build; all previously qualified source stays frozen.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makePacketCacheOuterBuilder, makePacketCachePipelineGenerator, makePacketCacheHevcWrapper } from "./mpeg2-packet-cache-strict-builder-recipe.mjs";
import { makePacketCacheBridge, makePacketCacheKernel } from "./mpeg2-packet-cache-source.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
assert.equal(process.platform, "linux");
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/mpeg2-split-pipeline-output"), read = file => readFile(path.join(root, file));
const sourceFiles = ["media/ffmpeg/build-mpeg2-packet-cache-strict.mjs", "media/ffmpeg/mpeg2-packet-cache-strict-builder-recipe.mjs", "media/ffmpeg/mpeg2-packet-cache-strict-recipe.mjs", "media/ffmpeg/build-mpeg2-packet-cache.mjs", "media/ffmpeg/mpeg2-packet-cache-builder-recipe.mjs", "media/ffmpeg/mpeg2-packet-cache-recipe.mjs",
  "media/ffmpeg/make-mpeg2-packet-cache-pipeline.mjs", "media/ffmpeg/mpeg2-packet-cache-source.mjs", "media/ffmpeg/mpeg2-packet-cache.h", "media/ffmpeg/mpeg2-packet-cache-smoke.c"];
const sourcePins = {}; for (const file of sourceFiles) sourcePins[file] = sha(await read(file));
const alignmentSource = (await read("media/ffmpeg/build-mpeg2-alignment16.mjs")).toString();
const recipe = makePacketCacheOuterBuilder(alignmentSource, root);
const prior = (await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs")).toString();
// Reuse exact actually qualified HEVC wrapper and all its source/hash/smoke gates.
const { generated } = makePacketCacheHevcWrapper(prior, root);
const runtime = await createOwnedRuntimeScratch("packet-cache-builder-");
try {
  const file = path.join(runtime.directory, "builder.mjs"); await writeFile(file, generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Packet-cache native build exit ${code}/${signal}`))); });
  const smokePath = path.join(output, "packet-cache-smoke.json"), smokeBytes = await readFile(smokePath), smoke = JSON.parse(smokeBytes);
  assert.equal(smoke.status, "actual-libavutil-packet-cache-lifecycle-not-conversion"); assert.equal(smoke.reuseIterations, 200000);
  assert.equal(smoke.maximumIdleLeases, 1); assert.equal(smoke.payloadLimitBytes, 1048576); assert.equal(smoke.injectedFailureCases, 4);
  assert.equal(smoke.ownedAllocationsBalanced, true); assert.equal(smoke.aliasesAndDeferredClose, true);
  const manifestPath = path.join(output, "build-manifest.json"), manifest = JSON.parse(await readFile(manifestPath));
  const decoder = await readFile(path.join(output, "within-mpeg2-split.wasm"));
  assert.deepEqual(readWasmMemoryLimits(decoder), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.notEqual(sha(decoder), "07ff8c19e9f58205f21a9cd10f6d7f0e0fb8f1e7086b810818724846117d51e4");
  assert.equal(manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  for (const [file, hash] of Object.entries(sourcePins)) { assert.equal(sha(await read(file)), hash); manifest.sources[file] = hash; }
  manifest.scope = "private-fixed-heaps-hevc-packet-cache-not-browser-acceptance";
  manifest.packetCache = { actualWasmLifecycle: smoke, actualWasmLifecycleExactSource: smokeBytes.toString(), actualWasmLifecycleSha256: sha(smokeBytes),
    generatedOuterBuilder: recipe.generated, generatedOuterBuilderSha256: recipe.generatedSha256,
    generatedHevcWrapper: generated, generatedHevcWrapperSha256: sha(generated),
    generatedPipeline: makePacketCachePipelineGenerator((await read("media/ffmpeg/make-mpeg2-split-pipeline.mjs")).toString(), root),
    generatedMuxBridge: makePacketCacheBridge((await read("media/ffmpeg/mpeg2-split-mux-bridge.h")).toString()),
    generatedKernel: makePacketCacheKernel((await read("media/ffmpeg/mpeg2-candidate.c")).toString()),
    maximumIdleLeases: 1, maximumIdlePayloadBytes: 1048576, paddingBytes: 64, allocateActualRequiredBytes: true,
    liveReferencesChanged: false, codecSettingsChanged: false, heapLimitsRaised: false,
    browserFidelityVerified: false, fullOriginalCompleted: false, completeChromiumMemoryAcceptance: false, speedGainProven: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const retained = JSON.parse(await readFile(manifestPath));
  assert.equal(retained.packetCache.actualWasmLifecycleExactSource, smokeBytes.toString());
  assert.equal(sha(await readFile(smokePath)), retained.packetCache.actualWasmLifecycleSha256);
  await unlink(smokePath); // Exact tiny result retained inside manifest; preserve20-artifact cap.
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
