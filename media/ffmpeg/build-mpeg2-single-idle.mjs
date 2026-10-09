// Private hosted Linux6.0.4 derivative. No Docker or public artifact mutation.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
import { reverseSingleIdleRefstruct, EXECUTED_LATE_REFSTRUCT_SHA256 } from "./mpeg2-single-idle-source.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/mpeg2-split-pipeline-output");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.platform, "linux", "Use isolated no-Docker hosted builder");
const prior = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-aligned-reuse.mjs"), "utf8");
assert.equal(sha(prior), "7c920650273882d831b211d7f7eaddea0bbed2f9e00f4221f7966bb39639de57");
const before = 'import { BASE_SPLIT_RECIPE_SHA256, makeAlignedReuseRecipe } from "./mpeg2-aligned-reuse-recipe.mjs";';
const replacement = `import { BASE_SPLIT_RECIPE_SHA256 } from ${JSON.stringify(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-aligned-reuse-recipe.mjs")).href)};
import { makeSingleIdleRecipe as makeAlignedReuseRecipe } from ${JSON.stringify(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-single-idle-recipe.mjs")).href)};`;
assert.equal(prior.split(before).length, 2); const generated = prior.replace(before, replacement);
assert.equal(generated.replace(replacement, before), prior);
const runtime = await createOwnedRuntimeScratch("mpeg2-single-idle-builder-");
try {
  const file = path.join(runtime.directory, "builder.mjs"); await writeFile(file, generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Single-idle build exit ${code}/${signal}`)));
  });
  const manifestPath = path.join(output, "build-manifest.json"), manifest = JSON.parse(await readFile(manifestPath));
  const smoke = JSON.parse(await readFile(path.join(output, "single-idle-smoke.json")));
  assert.equal(smoke.status, "passed"); assert.equal(smoke.sequentialReuses, 200000);
  assert.equal(smoke.sequentialFreshAllocations, 1); assert.equal(smoke.maximumIdleEntriesPerSelectedPool, 1);
  assert.equal(smoke.selectorConfigurations, 40); assert.equal(smoke.policyConfigurations, 4);
  for (const key of ["liveReferencesUnchanged", "uninitWithLiveReferencesPassed", "initErrorPassed", "zeroEveryTimePassed"]) assert.equal(smoke[key], true);
  assert.equal(smoke.conversionsPerformed, 0);
  const oldSmoke = JSON.parse(await readFile(path.join(output, "late-refstruct-smoke.json")));
  assert.equal(oldSmoke.status, "passed"); assert.equal(oldSmoke.freshRequestsObserved, 82);
  const actualRefstruct = await readFile(path.join(output, "single-idle-refstruct.c"), "utf8");
  assert.equal(sha(reverseSingleIdleRefstruct(actualRefstruct)), EXECUTED_LATE_REFSTRUCT_SHA256);
  const header = await readFile(path.join(output, "single-idle-hevc-policy.h"));
  assert.deepEqual(header, await readFile(path.join(root, "media/ffmpeg/mpeg2-hevc-single-idle-policy.h")));
  const decoder = await readFile(path.join(output, "within-mpeg2-split.wasm"));
  assert.notEqual(sha(decoder), "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
  assert.deepEqual(readWasmMemoryLimits(decoder), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.equal(manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.ok(WebAssembly.Module.imports(new WebAssembly.Module(decoder)).some(row => row.name === "within_bind_refstruct_abort_slot"));
  for (const file of ["single-idle-smoke.json", "single-idle-refstruct.c", "single-idle-hevc-policy.h",
    "late-refstruct-smoke.json", "late-refstruct-source.sha256", "decoder-link.map"]) {
    assert.ok((await stat(path.join(output, file))).size <= 4 * 1048576);
    manifest.artifacts[file] = sha(await readFile(path.join(output, file)));
  }
  const sources = ["media/ffmpeg/build-mpeg2-single-idle.mjs", "media/ffmpeg/mpeg2-single-idle-source.mjs",
    "media/ffmpeg/mpeg2-single-idle-recipe.mjs", "media/ffmpeg/patch-mpeg2-single-idle.mjs",
    "media/ffmpeg/mpeg2-hevc-single-idle-policy.h", "media/ffmpeg/mpeg2-single-idle-smoke.c",
    "media/ffmpeg/mpeg2-late-refstruct-recipe.mjs", "media/ffmpeg/mpeg2-late-refstruct-source.mjs",
    "media/ffmpeg/patch-late-refstruct.mjs", "media/ffmpeg/mpeg2-late-refstruct-slot.c", "media/ffmpeg/mpeg2-late-refstruct-smoke.c",
    ".github/workflows/mpeg2-single-idle-nondocker.yml"];
  for (const file of sources) manifest.sources[file] = sha(await readFile(path.join(root, file)));
  manifest.scope = "private-fixed-heaps-hevc-single-idle-candidate-not-browser-acceptance";
  manifest.singleIdle = { selectedPools: ["tab_mvf", "rpl_tab"], privateBit: 536870912,
    maximumIdleEntriesPerSelectedPool: 1, selectors: "HEVC/single-thread/decoder-only",
    actualSyntheticWasm32Unit: smoke, upstreamRefstructSource: "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavutil/refstruct.c",
    actualPatchedRefstructSha256: sha(actualRefstruct), actualSelectorHeaderSha256: sha(header),
    exactOldLateSourceReconstructed: true, generatedBuilderSha256: sha(generated),
    unchangedEncoder: true, liveReferencesChanged: false, pixelsOrCodecOptionsChanged: false, heapLimitsRaised: false,
    abortSlotBytes: 64, actualBrowserConversionVerified: false, fullOriginalCompleted: false,
    completeChromiumMemoryAcceptance: false, speedImprovementProven: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Real Wasm32 single-idle lifetime/reuse unit passed; decoder changed, encoder/heaps unchanged. Browser acceptance still required.");
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
