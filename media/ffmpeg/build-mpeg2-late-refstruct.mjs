// Hosted Linux6.0.4 only. Derive the exact proven builder; don't repin its history.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "../../scripts/lib/wasm-memory-limits.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/mpeg2-split-pipeline-output");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.platform, "linux", "Use the isolated no-Docker hosted builder");
const prior = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-aligned-reuse.mjs"), "utf8");
assert.equal(sha(prior), "7c920650273882d831b211d7f7eaddea0bbed2f9e00f4221f7966bb39639de57");
const before = 'import { BASE_SPLIT_RECIPE_SHA256, makeAlignedReuseRecipe } from "./mpeg2-aligned-reuse-recipe.mjs";';
const replacement = `import { BASE_SPLIT_RECIPE_SHA256 } from ${JSON.stringify(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-aligned-reuse-recipe.mjs")).href)};
import { makeLateRefstructRecipe as makeAlignedReuseRecipe } from ${JSON.stringify(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-late-refstruct-recipe.mjs")).href)};`;
assert.equal(prior.split(before).length, 2);
const generated = prior.replace(before, replacement); assert.equal(generated.replace(replacement, before), prior);
const runtime = await createOwnedRuntimeScratch("mpeg2-late-builder-");
try {
  const file = path.join(runtime.directory, "builder.mjs"); await writeFile(file, generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Late diagnostic builder exit ${code}/${signal}`)));
  });
  const manifestPath = path.join(output, "build-manifest.json"), manifest = JSON.parse(await readFile(manifestPath));
  const smoke = JSON.parse(await readFile(path.join(output, "late-refstruct-smoke.json")));
  assert.equal(smoke.status, "passed"); assert.equal(smoke.fixedSlotBytes, 64);
  assert.equal(smoke.freshRequestsObserved, 82); assert.equal(smoke.afterFirst48Verified, true);
  assert.equal(smoke.initializationAddressBound, true); assert.equal(smoke.conversionsPerformed, 0);
  const wasm = await readFile(path.join(output, "within-mpeg2-split.wasm"));
  assert.deepEqual(readWasmMemoryLimits(wasm), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.notEqual(sha(wasm), "f4c5c17e6d0e53d0612ac6ae66dcf5f7057b9d7b923df99713a2b36d5545924a");
  assert.ok(WebAssembly.Module.imports(new WebAssembly.Module(wasm)).some(row => row.name === "within_bind_refstruct_abort_slot"));
  const map = path.join(output, "decoder-link.map"); assert.ok((await stat(map)).size <= 4 * 1048576);
  for (const file of ["late-refstruct-smoke.json", "late-refstruct-source.sha256", "decoder-link.map"])
    manifest.artifacts[file] = sha(await readFile(path.join(output, file)));
  const sourceFiles = ["media/ffmpeg/build-mpeg2-late-refstruct.mjs", "media/ffmpeg/mpeg2-late-refstruct-recipe.mjs",
    "media/ffmpeg/mpeg2-late-refstruct-source.mjs", "media/ffmpeg/patch-late-refstruct.mjs",
    "media/ffmpeg/mpeg2-late-refstruct-slot.c", "media/ffmpeg/mpeg2-late-refstruct-smoke.c",
    "scripts/lib/late-refstruct-abort-snapshot.mjs", ".github/workflows/mpeg2-late-allocation-nondocker.yml"];
  for (const file of sourceFiles) manifest.sources[file] = sha(await readFile(path.join(root, file)));
  manifest.scope = "private-fixed-heap-late-refstruct-request-diagnostic-not-acceptance";
  manifest.lateRefstruct = { fixedSlotBytes: 64, actualSyntheticWasm32Unit: smoke,
    observedPatchedSourceSha256: (await readFile(path.join(output, "late-refstruct-source.sha256"), "utf8")).split(/\s/)[0],
    generatedBuilderSha256: sha(generated), retainedMapBytes: (await stat(map)).size,
    noEventHistoryOrPerRequestJsCrossing: true, noPayloadReads: true, liveReferencesChanged: false,
    allocationPolicyChanged: false, heapLimitsChanged: false, encoderBytesUnchanged: true,
    plannedOnlyFailureReadsSlotAndAllocatorHeaders: true, actualBrowserAbortCaptureVerified: false,
    allocatorRootAddress: null, originalConversionCompleted: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Actual64-byte request slot and82-request lifecycle compiled/verified; browser failure observer remains unverified.");
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
