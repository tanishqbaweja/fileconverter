// Linux-only actual private Wasm builder; no decoder rebuild or browser conversion.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { makeSingleIdleEncoderPlaneRecipe } from "./mpeg2-encoder-plane-recipe.mjs";
import { reverseSingleIdlePlaneBuffer, reverseSingleIdlePlaneGetBuffer } from "./mpeg2-encoder-plane-source.mjs";
import { reversePlaneFactoryPrototype } from "./mpeg2-encoder-plane-prototype-source.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/mpeg2-split-encoder-output");
const sha = value => createHash("sha256").update(value).digest("hex");
assert.equal(process.platform, "linux", "Run only in isolated no-Docker hosted builder");
const base = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-split-encoder.sh"), "utf8");
const { generated } = makeSingleIdleEncoderPlaneRecipe(base);
const runtime = await createOwnedRuntimeScratch("encoder-plane-builder-");
try {
  const file = path.join(runtime.directory, "builder.sh"); await writeFile(file, generated, { flag: "wx" });
  const child = spawn("bash", [file], { cwd: root, env: { ...runtime.env,
    WITHIN_ENCODER_PLANE_SCRIPT_DIR: path.join(root, "media/ffmpeg") }, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Plane builder exit ${code}/${signal}`))); });
  const smoke = JSON.parse(await readFile(path.join(output, "encoder-plane-smoke.json")));
  assert.equal(smoke.status, "passed"); assert.equal(smoke.selectorConfigurations, 80);
  assert.equal(smoke.sequentialReuses, 200000); assert.equal(smoke.sequentialFreshAllocations, 1);
  assert.equal(smoke.maximumIdleEntriesPerSelectedPool, 1); assert.equal(smoke.conversionsPerformed, 0);
  for (const key of ["liveReferencesUnchanged", "uninitWithLiveReferencesPassed", "allocatorCallbackFailurePassed",
    "zeroEveryAcquisitionPassed", "nonselectedCacheUnchanged"]) assert.equal(smoke[key], true);
  const patchedBuffer = await readFile(path.join(output, "encoder-plane-buffer.c"), "utf8");
  const patchedGet = await readFile(path.join(output, "encoder-plane-get-buffer.c"), "utf8");
  reverseSingleIdlePlaneBuffer(reversePlaneFactoryPrototype(patchedBuffer)); reverseSingleIdlePlaneGetBuffer(patchedGet);
  assert.deepEqual(await readFile(path.join(output, "encoder-plane-policy.h")),
    await readFile(path.join(root, "media/ffmpeg/mpeg2-encoder-plane-policy.h")));
  const wasm = await readFile(path.join(output, "split-encoder.wasm"));
  assert.notEqual(sha(wasm), "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.deepEqual(readWasmMemoryLimits(wasm), [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  const initialization = JSON.parse(await readFile(path.join(output, "initialization-contract.json")));
  assert.equal(initialization.cases.length, 4); assert.equal(initialization.settingsCases, 15);
  assert.equal(initialization.framesEncoded, 0); assert.equal(initialization.finalInputReferences, 0);
  const artifacts = {}, sources = {};
  for (const name of ["split-encoder.mjs", "split-encoder.wasm", "encoder-plane-smoke.json", "encoder-plane-buffer.c",
    "encoder-plane-get-buffer.c", "encoder-plane-policy.h", "initialization-contract.json", "config_components.h",
    "LICENSE.LGPLv2.1", "mpeg2-accessory-smoke.json"]) artifacts[name] = sha(await readFile(path.join(output, name)));
  for (const name of ["media/ffmpeg/build-mpeg2-encoder-planes.mjs", "media/ffmpeg/mpeg2-encoder-plane-recipe.mjs",
    "media/ffmpeg/mpeg2-encoder-plane-source.mjs", "media/ffmpeg/mpeg2-encoder-plane-policy.h",
    "media/ffmpeg/mpeg2-encoder-plane-smoke.c", "media/ffmpeg/patch-mpeg2-encoder-planes.mjs",
    "media/ffmpeg/mpeg2-encoder-plane-prototype-source.mjs", "media/ffmpeg/patch-mpeg2-encoder-plane-prototype.mjs"])
    sources[name] = sha(await readFile(path.join(root, name)));
  await writeFile(path.join(output, "encoder-plane-build-manifest.json"), JSON.stringify({
    scope: "private-actual-wasm32-plane-lifecycle-and-initialization-not-browser-acceptance", ffmpeg: "8.1.2", emscripten: "6.0.4",
    artifacts, sources, executedRecipeSha256: sha(generated), baseInitialization: initialization.sources,
    memoryLimits: readWasmMemoryLimits(wasm), smoke, actualSourceReversalsPassed: true, privateFactoryDeclarationPresent: true,
    decoderBuilt: false, heapLimitsRaised: false, codecOptionsChanged: false, browserAcceptance: false,
    fullOriginalCompleted: false, completeChromiumMemoryAcceptance: false, speedImprovementProven: false,
    publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
  console.log("Actual fixed16MiB Wasm encoder/lifecycle checked; browser correctness and memory gates still required.");
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
