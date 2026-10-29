import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeSvgStripFilteredAlphaControl, svgFilteredAlphaControlPin } from "../scripts/lib/svg-strip-filtered-alpha-control.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";

test("additional filtered-alpha fixture removes only the opaque background, preserving original effects, geometry and protected acceptance input", async () => {
  const original = await readFile("fixtures/images/test-pattern-effects.svg"), fixture = await readFile("fixtures/images/svg-strip-filtered-alpha.svg");
  assert.equal(sha(original), "afebfa848cd052fcd656cfdda7605c6c191edf845087759ca3421cf44880981d");
  const background = '<rect x="0" y="0" width="960" height="540" fill="url(#background)"/>\n';
  assert.equal(original.toString().split(background).length, 2);
  assert.equal(fixture.toString(), original.toString().replace(background, ""));
  assert.equal(fixture.length, svgFilteredAlphaControlPin.bytes); assert.equal(sha(fixture), svgFilteredAlphaControlPin.sha256);
  for (const element of ["feGaussianBlur", "feOffset", "feFlood", "feComposite", "feMerge", "mask"])
    assert.ok(fixture.toString().includes("<" + element));
});

test("filtered-alpha recipe retains exact mode/alpha equality, all seam thresholds, unchanged source cap and birth-aware cleanup", async () => {
  const runtime = await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try {
    const options = { root: process.cwd(), runtime: runtime.directory,
      workerPin: { file: path.join(runtime.directory, "private-svg-strip-worker.mjs"), centralRows: 128, bytes: 1234, sha256: "a".repeat(64) },
      driverBytes: await readFile("scripts/test-source-built-svg-candidate.mjs"), suiteBytes: await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes: await readFile("scripts/generate-svg-stress-fixture.py"), controlTestBytes: await readFile("scripts/lib/svg-small-fidelity-test.txt"),
      filteredAlphaSourceBytes: await readFile("fixtures/images/svg-strip-filtered-alpha.svg") };
    const result = makeSvgStripFilteredAlphaControl(options);
    assert.equal(result.proof.allFourSourcePatchProofsRequired, true); assert.equal(result.proof.filteredAlphaSupportProven, false);
    assert.equal(result.proof.fullOriginal6MStressReplacement, false); assert.equal(result.proof.publicPromotion, false);
    const body = result.suite.slice(result.suite.indexOf('test("svg-filtered-alpha-fidelity-control",'));
    assert.ok(body.startsWith('test("svg-filtered-alpha-fidelity-control",'));
    assert.doesNotMatch(body, /test-pattern-effects\.(?:svg|png)/);
    for (const expression of [/await transfer\("svg-strip-filtered-alpha.png"\)/, /root.removeEntry\("svg-strip-filtered-alpha.png"\)/,
      /row.alphaExact\).toBe\(true\)/, /alphaDiagnostics.mismatchedPixels\).toBe\(0\)/,
      /referenceTransparentPixels\).toBeGreaterThan\(0\)/, /referencePartialPixels\).toBeGreaterThan\(0\)/,
      /row.wholeSsim\).toBeGreaterThanOrEqual\(0.99\)/, /row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/,
      /results\[0\].rgbaSha256\).toBe\(results\[1\].rgbaSha256\)/, /imageWorkingBytes\).toBe\(0\)/]) assert.match(body, expression);
    assert.match(body, /maximumAbsoluteError/); assert.match(body, /alphaHistogram/);
    assert.match(result.driver, /pins.experimentalMaximumBytes, 100663296/);
    assert.match(result.driver, /incrementalPrivateMiB <= 250/); assert.match(result.driver, /owned-identity-absent/);
    assert.match(result.driver, /"--grep", "svg-filtered-alpha-fidelity-control"/);
    assert.doesNotMatch(result.driver, /--disable-|ignoreDefaultArgs/);
    for (const [name, source] of [["driver.mjs", result.driver], ["suite.ts", result.suite]])
      assert.deepEqual(ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, true).parseDiagnostics, [], name);
    assert.throws(() => makeSvgStripFilteredAlphaControl({ ...options, filteredAlphaSourceBytes: Buffer.from("wrong") }));
  } finally { await runtime.close(); }
});

test("filtered-alpha mode is isolated from completed controls and has its own receipt and no-replay slot", async () => {
  const source = await readFile("scripts/test-svg-small-fidelity-control.mjs", "utf8");
  assert.match(source, /--premultiplied-filtered-alpha/); assert.match(source, /completedPremultipliedFilteredAlphaControl/);
  assert.match(source, /filteredAlphaControl\?"fixtures\/images\/svg-strip-filtered-alpha.svg"/);
  assert.match(source, /-svg-filtered-alpha-control.json/);
  assert.match(source, /Diagnostic modes are mutually exclusive/); assert.match(source, /windowsHide:true/);
});

test("real filtered-alpha failure preserves exact full/strip and RGB passes without turning alpha or small memory into acceptance", async () => {
  const c = JSON.parse(await readFile("evidence/2026-10-29-svg-filtered-alpha-terminal.json"));
  const parentBytes = await readFile(c.parentReceipt.path), p = JSON.parse(parentBytes);
  const browserBytes = await readFile(c.browserReceipt.path), b = JSON.parse(browserBytes);
  assert.equal(parentBytes.length, c.parentReceipt.bytes); assert.equal(sha(parentBytes), c.parentReceipt.sha256);
  assert.equal(browserBytes.length, c.browserReceipt.bytes); assert.equal(sha(browserBytes), c.browserReceipt.sha256);
  assert.equal(b.executedHead, c.sourceHead); assert.equal(b.candidatePin.wasmSha256, c.nativeWasmSha256);
  assert.equal(b.filteredAlphaFidelityControl.sha256, svgFilteredAlphaControlPin.sha256);
  assert.equal(p.childExit, 1); assert.deepEqual([p.stats.expected, p.stats.unexpected, p.stats.skipped, p.stats.flaky], [0, 1, 0, 0]);
  assert.equal(p.diagnostic.exactFullVsStripRgbaEqual, true); assert.equal(p.diagnostic.independentlyValidatedEffects, false);
  for (const r of p.diagnostic.results) {
    assert.equal(r.rgbaSha256, c.eachMode.rgbaSha256); assert.ok(r.wholeSsim >= 0.99 && r.minimumBandSsim >= 0.99);
    assert.equal(r.alphaExact, false); assert.equal(r.alphaDiagnostics.mismatchedPixels, 52879);
    assert.equal(r.alphaDiagnostics.maximumAbsoluteError, 50); assert.equal(r.allReferenceAlphaOpaque, false);
    assert.equal(r.alphaHistogram.length, 256); assert.equal(r.alphaHistogram.reduce((n, v) => n + v, 0), 960 * 540);
  }
  assert.equal(c.memory.incrementalPrivateMiB, (b.memory.peak.privateBytes - b.blankBaseline.privateBytes) / 1048576);
  assert.equal(c.memory.unavailableSamples, 0); assert.equal(c.strip.finalExplicitJsBufferBytes, 0);
  assert.equal(c.strip.renderedViewports, c.strip.releasedViewports); assert.equal(c.strip.completedRows, 540);
  assert.deepEqual(b.forbiddenRequests, []); assert.equal(b.forbiddenRequestOverflow, false);
  assert.ok(p.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(p.ownerProcessCleanup.status, "owned-identity-absent"); assert.equal(p.ownedRuntimeRemoved, true);
  assert.equal(p.ownedBrowserRuntimeRemoved, true); assert.deepEqual(p.protectedOriginalBefore, p.protectedOriginalAfter);
  assert.equal(c.publicPromotion, false); assert.equal(c.acceptedSpeedup, false); assert.equal(c.fullOriginal6MStressReplacement, false);
  assert.equal(c.wholeGoalComplete, false);
  const ledger = JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  assert.equal(ledger.completedPremultipliedFilteredAlphaControl.nativeWasmSha256, c.nativeWasmSha256);
  assert.equal(ledger.completedPremultipliedFilteredAlphaControl.sourceSha256, c.source.sha256);
});
