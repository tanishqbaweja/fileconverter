// Source and retained evidence tests only; not full conversion/speed acceptance.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { correctSplitCopyStagedGuard, copyAdapterBinding } from "../scripts/lib/split-copy-staged-guard-recipe.mjs";
import { loadRetainedCopyProgress } from "../scripts/lib/retained-split-copy-progress.mjs";
const root = path.resolve(import.meta.dirname, "..");
const retained = await loadRetainedCopyProgress(root);
test("Terminal baseline archives reconstruct exactly; failed candidate has unavailable, not zero, browser/native observations", () => {
  assert.equal(retained.terminalEvidenceVerified, true);
  assert.equal(retained.candidateBrowserNeverLaunched, true);
  assert.equal(retained.native.observedIncrementalPrivateMiB, 237.13671875);
  assert.equal(retained.native.completeChromiumMemoryAcceptance, false);
});
test("Correction binds all three adapters to already browser-validated bytes/hash and reverses exactly", () => {
  const original = retained.candidate.source.generated;
  const recipe = correctSplitCopyStagedGuard(original);
  let recovered = recipe.generated;
  for (const [before, after] of recipe.patches.toReversed()) recovered = recovered.replaceAll(after, before);
  assert.equal(recovered, original); assert.equal(recipe.conversionGatesChanged, false);
  assert.equal(recipe.generated.split(copyAdapterBinding.sha256).length, 3);
  assert.ok(recipe.generated.includes('assert.equal((await stat(file)).size,19517);'));
  assert.ok(recipe.generated.includes('stagedAdapters.push({name,bytes:19517,'));
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"],
    { input: recipe.generated, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
  assert.ok(recipe.generated.includes('"--headless=new"'));
  assert.ok(recipe.generated.includes('assert.equal(run.state.jobState, "complete",'));
  assert.equal(recipe.generated.match(/^const progressProbe = .*;$/m)[0], original.match(/^const progressProbe = .*;$/m)[0]);
  for (const value of ["expectedSourceBytes", "expectedSourceHash"])
    assert.equal(recipe.generated.match(new RegExp(`^const ${value} = .*;$`, "m"))?.[0], original.match(new RegExp(`^const ${value} = .*;$`, "m"))?.[0]);
});
test("Candidate-only controller has one hidden launch, retained baseline binding, same native/fidelity/cleanup and fresh host/disk gates", async () => {
  const source = await readFile(path.join(root, "scripts/diagnose-split-copy-candidate-only.mjs"), "utf8");
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal((source.match(/const child = spawn\(/g) ?? []).length, 1);
  assert.ok(source.includes('noBaselineRerun: true'));
  assert.ok(source.includes('WITHIN_SPLIT_COPY_STATE_DIR: runtime.directory'));
  assert.ok(source.includes('windowsHide: true, stdio: "inherit"'));
  assert.ok(source.includes('proof.hostPreflight.safeToStart, true'));
  assert.ok(source.includes('proof.diskPreflightBytes >= 32 * 1024 ** 3'));
  assert.ok(source.includes('assert.deepEqual(raw.manifest, base.manifest)'));
  assert.ok(source.includes('assert.deepEqual(raw.actualWasmMemoryLimits, base.actualWasmMemoryLimits)'));
  assert.ok(source.includes('assert.equal(raw.limitMiB, 250)'));
  assert.ok(source.includes('rawRemovedAfterLosslessArchive: true'));
  assert.ok(source.includes('raw.progressProbe.workCheckpoints'));
});
test("Correction rejects drift, missing guards and double application instead of bypassing validation", () => {
  const original = retained.candidate.source.generated;
  assert.throws(() => correctSplitCopyStagedGuard(original.replace('size,18330', 'size,18331')));
  assert.throws(() => correctSplitCopyStagedGuard(original.replace('stagedAdapters.push', 'different.push')));
  assert.throws(() => correctSplitCopyStagedGuard(correctSplitCopyStagedGuard(original).generated));
});
