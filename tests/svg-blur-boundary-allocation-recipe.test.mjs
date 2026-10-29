import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { ESLint } from "eslint";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeSvgBlurBoundaryAllocationDiagnostic, assertBoundaryAllocationNotCompleted } from "../scripts/lib/svg-blur-boundary-allocation-recipe.mjs";
test("allocator experiment captures even after quality failure but retains all assertions and explicit nonacceptance", async () => {
  const runtime = await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try {
    const result = makeSvgBlurBoundaryAllocationDiagnostic({ root: process.cwd(), runtime: runtime.directory,
      workerPin: { file: path.join(runtime.directory, "private-svg-strip-worker.mjs"), centralRows: 128, bytes: 1234, sha256: "a".repeat(64) },
      driverBytes: await readFile("scripts/test-source-built-svg-candidate.mjs"), suiteBytes: await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes: await readFile("scripts/generate-svg-stress-fixture.py"), controlTestBytes: await readFile("scripts/lib/svg-small-fidelity-test.txt"),
      filteredAlphaSourceBytes: await readFile("fixtures/images/svg-strip-filtered-alpha.svg") });
    assert.ok(result.driver.indexOf('await captureAllocators("post-suite")') < result.driver.indexOf('assert.equal(report.runnerExitCode, 0, runnerLog)'));
    assert.equal(result.driver.split('await captureAllocators("post-suite")').length - 1, 1);
    assert.match(result.driver, /assert.equal\(allocationDiagnostic,true\)/); assert.match(result.driver, /}, 5000\);/);
    assert.match(result.driver, /report.memory.incrementalPrivateMiB <= 250/); assert.match(result.driver, /report.stats.unexpected, 0/);
    assert.match(result.suite, /row.alphaExact\).toBe\(true\)/); assert.match(result.suite, /row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.equal(result.proof.captureCount, 3); assert.equal(result.proof.acceptanceMetric, false); assert.equal(result.proof.perturbsMemory, true);
    assert.equal(result.proof.fixturesOrNativeBytesChanged, false); assert.equal(result.proof.publicPromotion, false);
    assert.doesNotMatch(result.driver, /--disable-|ignoreDefaultArgs|HeapProfiler.collectGarbage/);
    assert.deepEqual(ts.createSourceFile("driver.mjs", result.driver, ts.ScriptTarget.ESNext, true).parseDiagnostics, []);
    const lint = await new ESLint().lintText(result.driver, { filePath: "scripts/generated-boundary-allocation.mjs" });
    assert.deepEqual(lint.flatMap(row => row.messages.filter(message => message.severity === 2)), []);
  } finally { await runtime.close(); }
});
test("allocator no-replay is distinct from completed acceptance and plan preserves original red verdict", async () => {
  const hash = "a".repeat(64);
  assertBoundaryAllocationNotCompleted({ completedBlurBoundaryAlphaComponents: { nativeWasmSha256: hash } }, hash);
  assert.throws(() => assertBoundaryAllocationNotCompleted({ completedBlurBoundaryAllocationDiagnostic: { nativeWasmSha256: hash, evidence: "retained" } }, hash), /already complete/);
  const plan = JSON.parse(await readFile("evidence/2026-10-29-svg-blur-boundary-allocation-plan.json"));
  assert.equal(plan.stopAfterOneDiagnostic, true); assert.equal(plan.originalFailureRemainsRecorded, true);
  assert.equal(plan.acceptanceMetric, false); assert.equal(plan.normalBrowserServicesRetained, true);
  const owner = await readFile("scripts/test-svg-small-fidelity-control.mjs", "utf8");
  assert.match(owner, /if\(allocationOnly\)assertBoundaryAllocationNotCompleted/);
  assert.match(owner, /allocationOnly\?\["--allocator-diagnostic"\]:\[\]/);
});
