// Isolated hosted Linux6.0.4 diagnostic derivative. No Docker/public mutation.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { readWasmFunctionNames } from "../../scripts/lib/wasm-stack-symbols.mjs";
const root = path.resolve(import.meta.dirname, "../.."), output = path.join(root, "work/mpeg2-split-pipeline-output");
assert.equal(process.platform, "linux", "Use isolated no-Docker hosted builder");
const prior = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-single-idle.mjs"), "utf8");
assert.equal(sha(prior), "a1097363223f64e8d2440e1f539aa71a3747742d5903e02fb9175a05c16d931e");
const edits = [
  ['path.resolve(import.meta.dirname, "../..")', JSON.stringify(root)],
  ['path.join(root, "media/ffmpeg/mpeg2-single-idle-recipe.mjs")', 'path.join(root, "media/ffmpeg/mpeg2-allocation-attempt-recipe.mjs")'],
  ['makeSingleIdleRecipe as makeAlignedReuseRecipe', 'makeAllocationAttemptRecipe as makeAlignedReuseRecipe'],
  ...["../../scripts/lib/owned-runtime-scratch.mjs", "../../scripts/lib/wasm-memory-limits.mjs", "./mpeg2-single-idle-source.mjs"]
    .map(file => [JSON.stringify(file), JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname, file)).href)]),
];
let generated = prior;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, prior);
const runtime = await createOwnedRuntimeScratch("mpeg2-allocation-attempt-build-");
try {
  const builder = path.join(runtime.directory, "builder.mjs"); await writeFile(builder, generated, { flag: "wx" });
  const child = spawn(process.execPath, [builder], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    child.once("error", reject); child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Allocation-attempt build exit ${code}/${signal}`)));
  });
  const manifestPath = path.join(output, "build-manifest.json"), manifest = JSON.parse(await readFile(manifestPath));
  const smokeBytes = await readFile(path.join(output, "allocation-attempt-smoke.json")), smoke = JSON.parse(smokeBytes);
  assert.equal(smoke.passed, 9); assert.equal(smoke.cases, 9); assert.equal(smoke.slotBytes, 64);
  assert.deepEqual(smoke.failurePhasesObserved, [1, 4]); assert.equal(smoke.originalDispatchPreserved, true);
  assert.equal(smoke.conversionsPerformed, 0);
  const decoder = await readFile(path.join(output, "within-mpeg2-split.wasm"));
  const names = [...readWasmFunctionNames(decoder).values()];
  assert.ok(names.includes("__wrap_posix_memalign"));
  assert.ok(WebAssembly.Module.imports(new WebAssembly.Module(decoder)).some(row => row.name === "within_bind_allocator_attempt_slot"));
  assert.notEqual(sha(decoder), "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec");
  for (const file of ["media/ffmpeg/build-mpeg2-allocation-attempt.mjs", "media/ffmpeg/mpeg2-allocation-attempt-recipe.mjs",
    "media/ffmpeg/mpeg2-allocation-attempt.c", "media/ffmpeg/mpeg2-allocation-attempt-smoke.c"])
    manifest.sources[file] = sha(await readFile(path.join(root, file)));
  manifest.artifacts["allocation-attempt-smoke.json"] = sha(smokeBytes);
  manifest.scope = "private-fixed-heaps-allocation-attempt-diagnostic-not-browser-acceptance";
  manifest.allocationAttempt = { slotBytes: 64, schemaVersion: 1, magic: 1095519281,
    originalWrapperSourceSha256: sha(await readFile(path.join(root, "media/ffmpeg/mpeg2-aligned-reuse.c"))),
    actualWasm32SyntheticDispatch: smoke, generatedBuilderSha256: sha(generated),
    actualOriginalFailureObserved: false, failureCauseProven: false, allocatorPolicyChanged: false,
    heapLimitsRaised: false, codecOptionsChanged: false, publicAcceptance: false, speedImprovementProven: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Actual allocation-attempt slot linked; original allocator dispatch/heaps/encoder unchanged. Browser fatal qualification still required.");
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
