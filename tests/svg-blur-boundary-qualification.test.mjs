import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { ESLint } from "eslint";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeSvgBlurBoundaryAlphaControl, assertSvgBlurBoundarySourceReceipt } from "../scripts/lib/svg-blur-boundary-qualification.mjs";
import { svgAlphaComponentVariants, assertSvgAlphaComponentsNotCompleted } from "../scripts/lib/svg-alpha-component-variants.mjs";
import { premultipliedTransferPatch } from "../images/resvg-source/premultiplied-transfer-patch.mjs";
import { blurBoundaryPatch } from "../images/resvg-source/blur-boundary-patch.mjs";

test("actual boundary processed artifact keeps explicit96MiB cap, compatible ABI and pinned unchanged binding", async () => {
  const report = JSON.parse(await readFile("evidence/2026-10-29T21-04-28-476Z-svg-filter-processed-artifact.json"));
  const pin = JSON.parse(await readFile("images/resvg-source/filter-blur-boundary-processed-input.json"));
  assert.deepEqual(report.inputPin, pin); assert.equal(report.hostedRun.conclusion, "success");
  assert.equal(report.memory.length, 1); assert.equal(report.memory[0].initialPages, 26);
  assert.equal(report.memory[0].maximumBytes, 100663296); assert.equal(report.memory[0].maximumExplicit, true); assert.equal(report.memory[0].shared, false);
  assert.equal(report.staticAbi.namesAndKindsEqual, true); assert.equal(report.glueMatchesPriorPrivateCandidate, true);
  assert.equal(report.ownedRuntimeRemoved, true); assert.equal(report.localBinaryCopiesRetained, false); assert.deepEqual(report.failures, []);
  const raw = JSON.parse(await readFile(pin.sourceRepeatPin)); assert.equal(raw.blurBoundaryPatchedSha256, pin.blurBoundaryPatchedSha256);
});

test("boundary source receipt guard preserves all five patches and rejects missing proof or altered cap", async () => {
  const pins = JSON.parse(await readFile("images/resvg-source/filter-blur-boundary-processed-input.json"));
  const receipt = { sourcePremultipliedTransferChanged: true, sourceBlurBoundaryChanged: true,
    filterRegionPatch: { patchedSha256: pins.filterModulePatchedSha256 }, renderContextPatch: { patchedSha256: pins.renderContextPatchedSha256 },
    filterLivenessPatch: { patchedSha256: pins.filterLivenessPatchedSha256 }, premultipliedTransferPatch,
    blurBoundaryPatch: { ...blurBoundaryPatch, nativeSourceRecipeIntegrated: true } };
  assertSvgBlurBoundarySourceReceipt(receipt, pins);
  assert.throws(() => assertSvgBlurBoundarySourceReceipt({ ...receipt, blurBoundaryPatch: undefined }, pins));
  assert.throws(() => assertSvgBlurBoundarySourceReceipt(receipt, { ...pins, experimentalMaximumBytes: 200000000 }));
  assert.throws(() => assertSvgBlurBoundarySourceReceipt(receipt, { ...pins, sourceRepeatPin: "images/resvg-source/filter-premultiplied-raw-input.json" }));
  const variants = svgAlphaComponentVariants(await readFile("fixtures/images/svg-strip-filtered-alpha.svg"));
  const ledger = { completedBlurBoundaryAlphaComponents: { nativeWasmSha256: pins.wasmSha256, variants: variants.map(({ name, sha256 }) => ({ name, sha256 })), evidence: "unit-fixture" } };
  assert.throws(() => assertSvgAlphaComponentsNotCompleted(ledger, pins.wasmSha256, variants), /already complete/);
});

test("changed boundary browser candidate uses unchanged three components, production IO and all original gates", async () => {
  const runtime = await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try {
    const result = makeSvgBlurBoundaryAlphaControl({ root: process.cwd(), runtime: runtime.directory,
      workerPin: { file: path.join(runtime.directory, "private-svg-strip-worker.mjs"), centralRows: 128, bytes: 1234, sha256: "a".repeat(64) },
      driverBytes: await readFile("scripts/test-source-built-svg-candidate.mjs"), suiteBytes: await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes: await readFile("scripts/generate-svg-stress-fixture.py"), controlTestBytes: await readFile("scripts/lib/svg-small-fidelity-test.txt"),
      filteredAlphaSourceBytes: await readFile("fixtures/images/svg-strip-filtered-alpha.svg") });
    assert.equal(result.proof.allFiveSourceProofsRequired, true); assert.equal(result.proof.fixtureChangesRelativeToPriorComponentRun, false);
    assert.equal(result.proof.originalAlphaGateRetained, true); assert.equal(result.proof.publicPromotion, false);
    assert.match(result.driver, /assertSvgBlurBoundarySourceReceipt as assertSvgPremultipliedSourceReceipt/);
    assert.match(result.driver, /sourceBlurBoundaryCandidate = true/); assert.match(result.driver, /incrementalPrivateMiB <= 250/);
    assert.match(result.driver, /owned-identity-absent/); assert.doesNotMatch(result.driver, /--disable-|ignoreDefaultArgs/);
    const body = result.suite.slice(result.suite.indexOf('test("svg-alpha-components-control",'));
    for (const gate of [/row.alphaExact\).toBe\(true\)/, /mismatchedPixels\).toBe\(0\)/, /row.wholeSsim\).toBeGreaterThanOrEqual\(0.99\)/,
      /row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/, /for\(const mode of \["full"\]\)/]) assert.match(body, gate);
    for (const [name, source] of [["driver.mjs", result.driver], ["suite.ts", result.suite]])
      assert.deepEqual(ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, true).parseDiagnostics, [], name);
    const lint = await new ESLint().lintText(result.driver, { filePath: "scripts/generated-blur-boundary-driver.mjs" });
    assert.deepEqual(lint.flatMap(row => row.messages.filter(message => message.severity === 2)), []);
  } finally { await runtime.close(); }
});
