import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import ts from "typescript";
import { ESLint } from "eslint";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeBlurBoundaryBuildRecipes } from "../images/resvg-source/blur-boundary-build-recipe.mjs";
import { patchOwnedBlurBoundary } from "../images/resvg-source/owned-blur-boundary-patch.mjs";
import { readPinnedBoxBlurPreimage, blurBoundaryPatch } from "../images/resvg-source/blur-boundary-patch.mjs";
import { patchPinnedFilterRegion } from "../images/resvg-source/filter-region-patch.mjs";
import { patchPinnedFilterLiveness } from "../images/resvg-source/filter-liveness-patch.mjs";
import { patchPinnedPremultipliedTransfer } from "../images/resvg-source/premultiplied-transfer-patch.mjs";
import { pins, sha } from "../images/resvg-source/source-pins.mjs";

test("boundary build retains all four earlier source proofs, both numeric sets per build and exact raw comparison", async () => {
  const runtime = await createOwnedRuntimeScratch("resvg-filter-owner-");
  try {
    const result = makeBlurBoundaryBuildRecipes({ root: process.cwd(), runtime: runtime.directory,
      compilerBytes: await readFile("images/resvg-source/compile-candidate.mjs"), reproducerBytes: await readFile("images/resvg-source/reproduce-raw-source.mjs") });
    const source = result.compiler, repeat = result.reproducer;
    for (const name of ["patchOwnedCargoFilter", "patchOwnedRenderContext", "patchOwnedFilterLiveness", "patchOwnedPremultipliedTransfer", "patchOwnedBlurBoundary"])
      assert.match(source, new RegExp("await " + name));
    assert.ok(source.indexOf("await patchOwnedBlurBoundary") > source.indexOf("await patchOwnedPremultipliedTransfer"));
    assert.match(source, /pins.compilerToolchain,"rustc","--edition=2021","--test",boundaryTestFile/);
    assert.match(source, /boundary-observation old=79 expanded=136 max=57 center=255/);
    assert.match(source, /report.premultipliedKernelTests=\{passed:4/); assert.match(source, /report.blurBoundaryKernelTests=\{passed:4/);
    assert.match(source, /Cargo must retain the exact boundary-corrected source/);
    for (const field of ["filterRegionPatch", "renderContextPatch", "filterLivenessPatch", "premultipliedTransferPatch", "blurBoundaryPatch"])
      assert.ok(repeat.includes("receipt." + field));
    assert.match(repeat, /receipt.blurBoundaryKernelTests.compiler,receipt.rustcVersion/);
    assert.match(repeat, /for \(const index of \[1, 2\]\)/); assert.match(repeat, /assert.deepEqual\(a, b, "Raw Wasm must compare byte-for-byte/);
    assert.match(repeat, /secondOwnedRawAndLockRemovedAfterExactVerification/);
    assert.equal(result.proof.maximumWasmBytesUnchanged, 100663296); assert.equal(result.proof.allFiveSourceProofsRequired, true);
    assert.equal(result.proof.originalConvolutionWeightsAndRoundingUnchanged, true); assert.equal(result.proof.browserFidelityProven, false);
    assert.equal(result.proof.publicPromotion, false); assert.doesNotMatch(source, /patchOwnedFilterPrecision/);
    for (const [name, text] of [["compiler.mjs", source], ["repeat.mjs", repeat]]) {
      assert.deepEqual(ts.createSourceFile(name, text, ts.ScriptTarget.ESNext, true).parseDiagnostics, [], name);
      const lint = await new ESLint().lintText(text, { filePath: "images/resvg-source/generated-blur-" + name });
      assert.deepEqual(lint.flatMap(row => row.messages.filter(message => message.severity === 2)), [], name);
    }
  } finally { await runtime.close(); }
});

test("owned boundary patch touches only the pinned fresh sibling module and refuses replay or a wrong revision", async () => {
  const runtime = await createOwnedRuntimeScratch("resvg-source-compile-");
  try {
    const directory = path.join(runtime.directory, "cargo/git/checkouts/resvg-test/3495d87/crates/resvg/src/filter"); await mkdir(directory, { recursive: true });
    const fixture = JSON.parse(await readFile("fixtures/source/resvg-filter-3495d870-preimage.json"));
    const original = gunzipSync(Buffer.from(fixture.gzipBase64, "base64"));
    const prior = patchPinnedPremultipliedTransfer(patchPinnedFilterLiveness(patchPinnedFilterRegion(original).bytes).bytes);
    const filterFile = path.join(directory, "mod.rs"), boxFile = path.join(directory, "box_blur.rs"), preimage = await readPinnedBoxBlurPreimage();
    await writeFile(filterFile, prior.bytes); await writeFile(boxFile, preimage);
    const proof = { ...prior.proof, onlyOwnedFreshDependencyCheckoutChanged: true, ownedCargoSourceFile: filterFile };
    await assert.rejects(patchOwnedBlurBoundary({ runtime, premultipliedProof: proof, run: async () => "0".repeat(40) }));
    assert.equal(sha(await readFile(boxFile)), blurBoundaryPatch.originalSha256);
    const result = await patchOwnedBlurBoundary({ runtime, premultipliedProof: proof, run: async () => pins.resvg });
    assert.equal(result.patchedSha256, blurBoundaryPatch.patchedSha256); assert.equal(result.nativeSourceRecipeIntegrated, true);
    assert.equal(result.priorPremultipliedSourceRetained, true); assert.equal(result.onlyOwnedFreshDependencyCheckoutChanged, true);
    assert.equal(sha(await readFile(filterFile)), prior.proof.patchedSha256); assert.equal(sha(await readFile(boxFile)), result.patchedSha256);
    await assert.rejects(patchOwnedBlurBoundary({ runtime, premultipliedProof: proof, run: async () => pins.resvg }));
  } finally { await runtime.close(); }
  let called = false;
  await assert.rejects(patchOwnedBlurBoundary({ runtime: { directory: process.cwd() }, premultipliedProof: {}, run: async () => { called = true; } }));
  assert.equal(called, false);
});

test("new private workflow has bounded ownership/retention, no Docker or browser work and no unchanged-build trigger", async () => {
  const yaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml");
  const workflow = yaml.load(await readFile(".github/workflows/svg-source-blur-boundary.yml", "utf8"));
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch", "push"]);
  assert.deepEqual(workflow.on.push.branches, ["media-options"]); assert.deepEqual(workflow.on.push.paths, [".github/workflows/svg-source-blur-boundary.yml"]);
  const jobs = Object.values(workflow.jobs); assert.equal(jobs.length, 1); const job = jobs[0]; assert.equal(job["timeout-minutes"], 20);
  assert.equal(job.steps.filter(step => step.uses?.startsWith("actions/")).length, 3);
  for (const step of job.steps.filter(step => step.uses)) assert.match(step.uses, /@[a-f0-9]{40}$/);
  assert.equal(job.steps.find(step => step.uses?.startsWith("actions/setup-node")).with["node-version"], "24.7.0");
  const cleanup = job.steps.at(-1); assert.equal(cleanup.if, "always()"); assert.equal(cleanup.env.NODE_DISABLE_COMPILE_CACHE, "1");
  assert.equal(cleanup.run, "node scripts/ci-owned-runtime.mjs cleanup");
  const artifact = job.steps.find(step => step.uses?.startsWith("actions/upload-artifact"));
  assert.equal(artifact.with["retention-days"], 1); assert.equal(artifact.with.path.trim().split("\n").length, 6);
  const commands = job.steps.filter(step => step.run).map(step => step.run).join("\n");
  assert.doesNotMatch(commands, /docker|playwright|test\.mkv|npm ci/);
  const owner = await readFile("images/resvg-source/reproduce-blur-boundary-source.mjs", "utf8");
  assert.match(owner, /windowsHide: true/); assert.match(owner, /await runtime\?\.close\(\)/);
  assert.match(owner, /8 \* 1024 \*\* 3/); assert.match(owner, /child.exitCode !== null && child.signalCode === null/);
});
