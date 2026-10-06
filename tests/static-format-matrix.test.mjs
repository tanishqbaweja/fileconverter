import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeStaticFormatMatrixSource, recoverStaticFormatMatrixBaseline } from "../scripts/lib/static-format-matrix-recipe.mjs";
import { makeUiMatrixBenchmarkDriver } from "../scripts/lib/ui-matrix-benchmark-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("Static display reuse reverses every baseline byte and rejects other UI changes", async () => {
  const current = await readFile(path.join(root, "app/converter/ConverterApp.tsx"), "utf8");
  const baseline = recoverStaticFormatMatrixBaseline(current), candidate = makeStaticFormatMatrixSource(baseline);
  assert.equal(recoverStaticFormatMatrixBaseline(candidate), baseline);
  assert.ok(candidate.includes("const publishedFormatsSection = useMemo"));
  assert.equal(candidate.split('profile.public && profile.automatedTestStatus === "passed"').length, 3);
  for (const mutated of [candidate + "\n", candidate.replace("No accounts.", "Accounts."), candidate.replace("405", "406") + " "])
    assert.throws(() => recoverStaticFormatMatrixBaseline(mutated));
});
test("UI benchmark changes only native sampler to CPU metrics and retains privacy/source/cleanup/no-conversion gates", async () => {
  const source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  const generated = makeUiMatrixBenchmarkDriver(source, root, specifier => import.meta.resolve(specifier));
  assert.ok(generated.includes('"Performance.enable", { timeDomain: "threadTicks" }'));
  assert.ok(!generated.includes('"Memory.startSampling"'));
  assert.ok(generated.includes("matrixMarkupSha256 = sha(matrix)"));
  assert.ok(generated.includes('assert.equal(state.jobState, "idle"'));
  assert.ok(generated.includes("await verifySource(); cleanup.protectedFixtureUnchanged = true"));
  assert.ok(generated.includes('arg === "PROFILE" ? `--user-data-dir=${profile}` : arg'));
  assert.ok(generated.includes("assert.equal(Number(stdout.trim()), 0)"));
  assert.ok(generated.includes("conversionsPerformed: 0"));
  assert.throws(() => makeUiMatrixBenchmarkDriver(source + "\n", root, specifier => import.meta.resolve(specifier)));
});
