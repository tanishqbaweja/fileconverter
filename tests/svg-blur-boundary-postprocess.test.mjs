import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { ESLint } from "eslint";
import { makeBlurBoundaryPostprocessRecipe, boundaryNumericTestsSha256 } from "../images/resvg-source/blur-boundary-postprocess-recipe.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { verifyBlurBoundaryCompileProof } from "../scripts/lib/svg-blur-boundary-proof.mjs";
import { blurBoundaryPatch } from "../images/resvg-source/blur-boundary-patch.mjs";
import { compileContract } from "../images/resvg-source/compile-contract.mjs";

test("actual boundary source artifact pins two fresh builds and both pinned-nightly numeric sets", async () => {
  const report = JSON.parse(await readFile("evidence/2026-10-29T21-01-28-556Z-svg-filter-source-artifact.json"));
  const input = JSON.parse(await readFile("images/resvg-source/filter-blur-boundary-raw-input.json"));
  assert.deepEqual(report.inputPin, input); assert.equal(report.boundary, true);
  assert.equal(report.hostedRun.conclusion, "success"); assert.equal(report.hostedRun.headSha, input.headSha);
  assert.equal(report.rawWasm.sha256, "b71a7cb32dea835ab11d3369b2aedcb39aabbcb60f27e4679d803d62f0a802fc");
  assert.equal(report.compileProofs.length, 2);
  for (const row of report.compileProofs) {
    verifyBlurBoundaryCompileProof({ ...row, rustcVersion: row.compiler });
    assert.equal(row.premultipliedKernelTests.passed, 4); assert.equal(row.premultipliedKernelTests.compiler, compileContract.rustcVersion);
    assert.equal(row.rawSha256, report.rawWasm.sha256); assert.equal(row.ownedScratchRemoved, true);
  }
  assert.equal(report.localBinaryCopiesRetained, false); assert.equal(report.ownedRuntimeRemoved, true); assert.deepEqual(report.failures, []);
});

test("boundary receipt validator rejects wrong compiler, source, tests and ownership without running code", () => {
  const fixture = { rustcVersion: compileContract.rustcVersion,
    blurBoundaryPatch: { ...blurBoundaryPatch, onlyOwnedFreshDependencyCheckoutChanged: true, priorPremultipliedSourceRetained: true, nativeSourceRecipeIntegrated: true },
    blurBoundaryKernelTests: { passed: 4, testsSha256: boundaryNumericTestsSha256, sourcePatchedSha256: blurBoundaryPatch.patchedSha256, numericOnly: true, compiler: compileContract.rustcVersion } };
  assert.equal(verifyBlurBoundaryCompileProof(fixture), true);
  for (const [group, field, invalid] of [["blurBoundaryPatch", "patchedSha256", "0".repeat(64)], ["blurBoundaryPatch", "priorPremultipliedSourceRetained", false],
    ["blurBoundaryPatch", "onlyOwnedFreshDependencyCheckoutChanged", false], ["blurBoundaryPatch", "nativeSourceRecipeIntegrated", false],
    ["blurBoundaryPatch", "maximumWasmBytesUnchanged", 200000000], ["blurBoundaryPatch", "kernelWeightsRoundingOrPassCountChanged", true],
    ["blurBoundaryKernelTests", "passed", 3], ["blurBoundaryKernelTests", "testsSha256", "0".repeat(64)],
    ["blurBoundaryKernelTests", "compiler", "rustc 1.75.0"], ["blurBoundaryKernelTests", "sourcePatchedSha256", "0".repeat(64)], ["blurBoundaryKernelTests", "numericOnly", false]]) {
    const bad = structuredClone(fixture); bad[group][field] = invalid; assert.throws(() => verifyBlurBoundaryCompileProof(bad), field);
  }
});

test("boundary processor retains all five proofs, both numeric sets and capped byte-identical two-pass processing", async () => {
  const result = makeBlurBoundaryPostprocessRecipe({ root: process.cwd(), sourceBytes: await readFile("images/resvg-source/postprocess-repeated-source.mjs") });
  const source = result.source;
  assert.equal(sha(await readFile("images/resvg-source/blur-boundary-kernel-tests.rs")), boundaryNumericTestsSha256);
  for (const name of ["filterRegionPatch", "renderContextPatch", "filterLivenessPatch", "premultipliedTransferPatch", "blurBoundaryPatch"])
    assert.ok(source.includes("receipt." + name), name);
  for (const name of ["premultipliedKernelTests", "blurBoundaryKernelTests"])
    assert.ok(source.includes("receipt." + name + ".compiler,compileContract.rustcVersion"), name);
  assert.match(source, /receipt.blurBoundaryKernelTests.testsSha256,boundaryNumericTestsSha256/);
  assert.match(source, /two-fresh-private-filter-blur-boundary-source-builds-byte-identical-not-browser-acceptance/);
  assert.match(source, /two-fresh-filter-blur-boundary-source-builds-verified-not-browser-acceptance/);
  assert.equal(source.split("images/resvg-source/filter-blur-boundary-raw-input.json").length - 1, 2);
  assert.match(source, /for \(const index of \[1, 2\]\)/);
  assert.match(source, /boundPrivateMemory\(processed, experimentalMaximumBytes\)/);
  assert.match(source, /assert.deepEqual\(bounded.bytes, first.wasm/);
  assert.match(source, /assert.deepEqual\(glue, first.glue/);
  assert.equal(result.proof.allFiveSourceProofsAndBothPinnedNumericSetsRequired, true);
  assert.equal(result.proof.maximumBytesChanged, false); assert.equal(result.proof.publicPromotion, false);
  assert.equal(result.proof.processingPerformedByRecipeGenerator, false);
  assert.deepEqual(ts.createSourceFile("processor.mjs", source, ts.ScriptTarget.ESNext, true).parseDiagnostics, []);
  const lint = await new ESLint().lintText(source, { filePath: "images/resvg-source/generated-boundary-processor.mjs" });
  assert.deepEqual(lint.flatMap(row => row.messages.filter(message => message.severity === 2)), []);
});

test("boundary processing workflow and owner are bounded, hidden and finally-cleaned without conversion", async () => {
  const yaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml");
  const workflow = yaml.load(await readFile(".github/workflows/svg-blur-boundary-postprocess.yml", "utf8"));
  assert.deepEqual(workflow.on.push.paths, [".github/workflows/svg-blur-boundary-postprocess.yml"]);
  const job = Object.values(workflow.jobs)[0]; assert.equal(job["timeout-minutes"], 10);
  for (const step of job.steps.filter(step => step.uses)) assert.match(step.uses, /@[a-f0-9]{40}$/);
  const artifact = job.steps.find(step => step.uses?.startsWith("actions/upload-artifact"));
  assert.equal(artifact.with["retention-days"], 1); assert.equal(artifact.with.path.trim().split("\n").length, 4);
  assert.equal(job.steps.at(-1).if, "always()"); assert.equal(job.steps.at(-1).env.NODE_DISABLE_COMPILE_CACHE, "1");
  const owner = await readFile("images/resvg-source/postprocess-blur-boundary-source.mjs", "utf8");
  assert.match(owner, /windowsHide: true/); assert.match(owner, /await runtime\?\.close\(\)/);
  assert.match(owner, /child.exitCode !== null && child.signalCode === null/);
  assert.doesNotMatch(job.steps.filter(step => step.run).map(step => step.run).join("\n"), /docker|playwright|test\.mkv|cargo/);
});
