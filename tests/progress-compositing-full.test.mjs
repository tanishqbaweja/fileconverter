import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { makeProgressCompositingFullDriver, FULL_CONVERSION_DEADLINE_MS, fullProgressNativeFacts } from "../scripts/lib/progress-compositing-full-recipe.mjs";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const receipt = JSON.parse(await read("evidence/2026-10-09T16-13-20-461Z-progress-compositing-original.json"));
const gzip = await read(receipt.sourceArchive.path); assert.equal(sha(gzip), receipt.sourceArchive.sha256);
const source = JSON.parse(gunzipSync(gzip, { maxOutputLength: 8 * 1024 ** 2 }));
const recipe = makeProgressCompositingFullDriver(source);

test("Full completion removes diagnostic cancellation, restores original six-hour per-run deadline and preserves three repeats", () => {
  let reversed = recipe.generated;
  for (const [before, after] of recipe.fullCompletionPatches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source.generated); assert.equal(recipe.maximumConversionMs, 21600000);
  assert.equal(recipe.maximumConversionMs, FULL_CONVERSION_DEADLINE_MS); assert.equal(recipe.checkpointOutputBytes, null);
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.ok(!recipe.generated.includes('await takeSample("real-progress-checkpoint-after-cancel")'));
  assert.ok(recipe.generated.includes('const diagnosticOnly = false;') && recipe.generated.includes('number <= 3'));
});

test("Full protected input, identical native/quality/defaults/250MiB/lower blank/output validation/failure observer/finally remain", () => {
  for (const token of ['const expectedSourceBytes = 2958573265', '31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34',
    'minimumMs: 300000', 'blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes',
    'run.incrementalPrivateMiB <= 250', 'assert.equal(run.state.jobState, "complete"', 'assert.ok(ssim >= 0.98)',
    'assert.deepEqual(await audioHashes(output), await audioHashes(source))', 'maximumTimestampErrorSeconds <= 0.001',
    'within-mpeg2-split.wasm', 'initialPages: 512, maximumPages: 512', 'initialPages: 256, maximumPages: 256',
    'scripts/stage-mpeg2-late-allocator-abort.mjs', '020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837',
    'WITHIN_BOUNDED_WASM_ABORT', 'metrics.peakPendingOperations <= 1', 'await emptyOpfs()',
    'await verifySource(); cleanup.protectedFixtureUnchanged = true', '"--headless=new"',
    'Never kill an unrelated or reused PID', 'await cancelBrowserConversionBeforeCleanup(page)', 'windowsHide: true'])
    assert.ok(recipe.generated.includes(token), token);
  assert.ok(!recipe.generated.includes('windowsHide: false') && !recipe.generated.includes('createConversionJsAllocation('));
  assert.ok(!recipe.generated.includes('["scripts/stage-split-copy-layout.mjs", "stage"]'));
  assert.ok(recipe.generated.includes('publicAcceptance: false'));
  const coverage = deriveDriverSourcePinFiles(recipe.generated, Object.keys(receipt.sourcePins));
  assert.equal(coverage.driverUniqueSourceFiles, 132);
});

test("Reject drifted source/stop policy/bindings; primary full-repeat calculation includes later CIM peak, never acceptance from prefix", async () => {
  assert.throws(() => makeProgressCompositingFullDriver({ ...source, generated: source.generated + "\n" }));
  const compressed = await read(receipt.candidate.compressedReport.path); assert.equal(sha(compressed), receipt.candidate.compressedReport.sha256);
  const raw = JSON.parse(gunzipSync(compressed, { maxOutputLength: 32 * 1024 ** 2 }));
  const facts = fullProgressNativeFacts(raw); assert.equal(facts.observedIncrementalPrivateMiB, 229.8671875);
  const repeated = structuredClone(raw); repeated.runs.push({ cimPeakPrivateBytes: 600000000, state: { jobState: "cancelled" }, independentValidation: null });
  const all = fullProgressNativeFacts(repeated);
  assert.equal(all.actualPeakPrivateBytes, 600000000);
  assert.equal(all.observedIncrementalPrivateMiB, (600000000 - 240709632) / 1048576);
  assert.equal(all.primaryLimitExceededInObservedWindow, true); assert.equal(all.completedRuns, 0);
  assert.equal(all.completeChromiumMemoryAcceptance, false);
});
