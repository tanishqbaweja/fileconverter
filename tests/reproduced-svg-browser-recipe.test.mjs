import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeReproducedSvgBrowserQualification, reproducedSvgBasePins } from "../scripts/lib/reproduced-svg-browser-recipe.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("generated suite differs only in explicit repository root and exact reproduced artifact pin, with every assertion byte-preserved", async () => {
  const runtime = await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try {
    const driverBytes = await read("scripts/test-source-built-svg-candidate.mjs"), suiteBytes = await read("tests/browser/image-conversions.spec.ts");
    const generated = makeReproducedSvgBrowserQualification({ root, runtime: runtime.directory, driverBytes, suiteBytes });
    const restored = generated.suite.replace(`const projectRoot = ${JSON.stringify(root)};`, 'const projectRoot = path.resolve(import.meta.dirname, "..", "..");')
      .replace("images/resvg-source/repeated-processed-input.json", "images/resvg-source/processed-candidate-input.json");
    assert.equal(restored, suiteBytes.toString(), "No assertion, route, fixture, validator, timing or quality changes");
    assert.equal(generated.proof.sameTenCasesAndAllAssertions, true); assert.equal(generated.proof.baseFilesModified, false);
    assert.equal(sha(generated.driver), generated.proof.driverSha256); assert.equal(sha(generated.suite), generated.proof.suiteSha256);
    assert.ok(generated.driver.includes('"test", "image-conversions.spec.ts", "--config='), "CLI file filters are regexes: do not insert an unescaped Windows absolute path");
    for (const [name, source] of [["driver.mjs", generated.driver], ["suite.ts", generated.suite], ["config.mts", generated.config]]) {
      const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, true);
      assert.deepEqual(parsed.parseDiagnostics, [], name);
    }
    assert.ok(generated.driver.includes('assert.equal(receipt.processedWasmAndGlueByteIdentical, true)'));
    assert.ok(generated.driver.includes('assert.equal(receipt.twoSourceBuildReceiptsAndRawEqualityVerified, true)'));
    for (const anchor of ['report.memory.incrementalPrivateMiB <= 250', 'stableWindow(report.blankSamples)',
      'baselineDeadline = baselineStarted + 30000', 'report.stats.expected, 10', 'report.stats.skipped, 0',
      'screenshots: true, snapshots: !noDomSnapshotDiagnostic', 'await runtime?.close()', 'protectedOriginalAfter = await originalIdentity()'])
      assert.ok(generated.driver.includes(anchor), anchor);
    assert.equal(sha(await read("scripts/test-source-built-svg-candidate.mjs")), reproducedSvgBasePins["scripts/test-source-built-svg-candidate.mjs"]);
    assert.equal(sha(await read("tests/browser/image-conversions.spec.ts")), reproducedSvgBasePins["tests/browser/image-conversions.spec.ts"]);
  } finally { await runtime.close(); }
});
test("recipe refuses changed base sources, a shared temp path or any outside-root generation", async () => {
  const driverBytes = await read("scripts/test-source-built-svg-candidate.mjs"), suiteBytes = await read("tests/browser/image-conversions.spec.ts");
  const good = { root, runtime: path.join(root, "work/svg-reproduced-qualification-aBc123"), driverBytes, suiteBytes };
  assert.throws(() => makeReproducedSvgBrowserQualification({ ...good, driverBytes: Buffer.concat([driverBytes, Buffer.from("\n")]) }));
  assert.throws(() => makeReproducedSvgBrowserQualification({ ...good, suiteBytes: Buffer.from(suiteBytes.toString().replace("0.9]", "0.1]")) }));
  assert.throws(() => makeReproducedSvgBrowserQualification({ ...good, runtime: path.join(root, "work/shared") }));
  assert.throws(() => makeReproducedSvgBrowserQualification({ ...good, runtime: path.join(root, "outputs/svg-reproduced-qualification-aBc123") }));
});
test("outer owner archives exact generated code and verifies owned child exit before disposing scratch", async () => {
  const source = (await read("scripts/test-reproduced-svg-candidate.mjs")).toString();
  for (const anchor of ['windowsHide: true', 'gzipSync(source, { level: 9 })', 'queryReliableProcessIdentity(child.pid)',
    'observeOwnedProcessExit(birth)', 'await runtime?.close()', 'actual.generatedQualification.driverSha256',
    'actual.generatedQualification.suiteSha256', 'actual.memory.incrementalPrivateMiB <= 250', 'actual.networkHarRecording, true',
    'actual.browserServicesDisabledByDriver, false', 'actual.baselineAdjusted, false']) assert.ok(source.includes(anchor), anchor);
  assert.doesNotMatch(source, /--disable-|cargo build|rustup|build:svg|WebAssembly\.instantiate/);
});
test("lifecycle mode observes bounded page-transition and target counters, never changes caching, GC, conversion or memory gates", async () => {
  const generated = makeReproducedSvgBrowserQualification({ root, runtime: path.join(root, "work/svg-reproduced-qualification-aBc123"),
    driverBytes: await read("scripts/test-source-built-svg-candidate.mjs"), suiteBytes: await read("tests/browser/image-conversions.spec.ts"), lifecycleDiagnostic: true });
  assert.equal(generated.proof.lifecycleDiagnostic, true);
  for (const anchor of ['events.length >= 128', '"pagehide", "pageshow"', 'persisted: event.persisted',
    '"Memory.getDOMCounters", "Page.getNavigationHistory", "Page.getFrameTree"', '"Target.getTargets"',
    'report.memory.diagnosticPerturbed = true', 'report.memory.incrementalPrivateMiB <= 250',
    'stats.expected, 10', 'completed-reproduced-svg-lifecycle-diagnostic-not-memory-acceptance']) assert.ok(generated.driver.includes(anchor), anchor);
  assert.doesNotMatch(generated.driver, /setWebLifecycleState|setBypassServiceWorker|disable-back-forward-cache|collectGarbage|forceGC/);
  const parsed = ts.createSourceFile("lifecycle-driver.mjs", generated.driver, ts.ScriptTarget.ESNext, true);
  assert.deepEqual(parsed.parseDiagnostics, []);
});
