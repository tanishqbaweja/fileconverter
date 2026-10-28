import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeReproducedSvgBrowserQualification } from "../scripts/lib/reproduced-svg-browser-recipe.mjs";
import { makeReproducedSvgStressQualification } from "../scripts/lib/reproduced-svg-stress-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const options = { root, runtime: path.join(root, "work/svg-reproduced-qualification-aBc123"),
  driverBytes: await read("scripts/test-source-built-svg-candidate.mjs"), suiteBytes: await read("tests/browser/image-conversions.spec.ts"),
  generatorBytes: await read("scripts/generate-svg-stress-fixture.py") };
test("stress adapter retains exact pixels and existing I/O/decoder assertions while bounding comparison evidence", () => {
  const base = makeReproducedSvgBrowserQualification(options), generated = makeReproducedSvgStressQualification(options);
  let restored = generated.suite.split("\n").filter(line => !line.includes('"8m-grid-repeat-') || !line.trim().startsWith('["svg-to-png",')).join("\n");
  restored = restored.replace(/^import \{ compareExactRgbaBuffers \} from [^\r\n]+;\n/, "")
    .replace('    let stressPixelComparisonMs: number | null = null;\n', "");
  restored = restored.replace('  minimumReferenceSsim,\n  stressRepeat,\n] of routes)', '  minimumReferenceSsim,\n] of routes)')
    .replace('${sourceName} produces a bounded independently decodable image${stressRepeat ? ` [${stressRepeat}]` : ""}', '${sourceName} produces a bounded independently decodable image')
    .replace(/\n      if \(stressRepeat\) \{[\s\S]*?^      \}/m, "");
  restored = restored.replace(`          const convertedPixels = await frameBytes(outputPath), referencePixels = await frameBytes(referencePath);\n` +
    `          if (stressRepeat) {\n` +
    `            const equality = compareExactRgbaBuffers(convertedPixels, referencePixels, expectedWidth * expectedHeight * 4);\n` +
    `            expect(equality.equal).toBe(true); stressPixelComparisonMs = equality.comparisonMs;\n` +
    `          } else expect(convertedPixels).toEqual(referencePixels);`,
  `          expect(await frameBytes(outputPath)).toEqual(\n            await frameBytes(referencePath),\n          );`);
  assert.equal(restored, base.suite, "No validator, pixel comparison, queue, cleanup, timeout or existing-case assertion changes");
  assert.equal(generated.proof.selectedStressRuns, 3); assert.equal(generated.proof.sameTenCasesAndAllAssertions, false);
  assert.equal(generated.proof.sameFidelityAndResourceThresholds, true);
  assert.match(generated.suite, /3840, 2160, 1_000, undefined,[^\r\n]+"rgba", undefined, "8m-grid-repeat-1"/);
  assert.equal(generated.suite.match(/3840, 2160, 1_000, undefined,[^\r\n]+"rgba", undefined, "8m-grid-repeat-[123]"/g).length, 3);
  for (const [name, source] of [["stress-driver.mjs", generated.driver], ["stress-suite.ts", generated.suite], ["config.mts", generated.config]])
    assert.deepEqual(ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, true).parseDiagnostics, [], name);
});
test("stress owner retains exact early baseline, normal services, all-tree 250 guard, tracing and original fixture protection", () => {
  const generated = makeReproducedSvgStressQualification(options);
  for (const anchor of ['report.stats.expected, 3', 'baselineDeadline = baselineStarted + 30000', 'stableWindow(report.blankSamples)',
    'report.memory.incrementalPrivateMiB <= 250', 'report.stressRuns.every', 'bytes.length <= 65536', 'screenshots: true, snapshots: !noDomSnapshotDiagnostic',
    'protectedOriginalAfter = await originalIdentity()', 'owned-identity-absent']) assert.ok(generated.driver.includes(anchor), anchor);
  assert.doesNotMatch(generated.driver, /--disable-|--repeat-each|ignoreDefaultArgs/);
  assert.match(generated.driver, /8m-grid-repeat-\[123\]/); assert.match(generated.driver, /result: null, unavailable: "Not written before failure"/);
  assert.match(generated.suite, /svgMemoryObservation.*phase: "released", available: true, observations: 6/);
  assert.match(generated.suite, /not.toHaveText\(\/Not used\|Unavailable\|incomplete\//);
  assert.match(generated.generator, /FIXTURE_ROOT = Path\(/);
  const restored = generated.generator.replace(/^PROJECT_ROOT = Path\([^\r\n]+\)$/m, "PROJECT_ROOT = Path(__file__).resolve().parent.parent")
    .replace(/^FIXTURE_ROOT = Path\([^\r\n]+\)$/m, 'FIXTURE_ROOT = PROJECT_ROOT / "fixtures" / "stress" / "images"');
  assert.equal(restored, options.generatorBytes.toString(), "Independent Pillow algorithm is unchanged, only owned paths differ");
});
test("changed generator or outside/shared scratch paths are rejected before generation", () => {
  assert.throws(() => makeReproducedSvgStressQualification({ ...options, generatorBytes: Buffer.concat([options.generatorBytes, Buffer.from("\n")]) }));
  assert.throws(() => makeReproducedSvgStressQualification({ ...options, runtime: path.join(root, "work/shared") }));
});
test("stress runner requires byte-identical historical source/reference, pinned Pillow, three results, hidden subprocesses and owned cleanup", async () => {
  const source = (await read("scripts/test-reproduced-svg-stress.mjs")).toString();
  for (const anchor of ['"3.11.9\\n11.3.0"', 'sameHistoricalSourceAndReferenceBytes: true', 'validationSha256', 'windowsHide: true',
    'observeOwnedProcessExit(birth)', 'await runtime?.close()', 'independentlyValidatedRgbaPixels', 'actual.memory.incrementalPrivateMiB <= 250',
    'actual.networkHarRecording, true', 'actual.baselineAdjusted, false', 'Total: 3 tests in 1 file']) assert.ok(source.includes(anchor), anchor);
  assert.doesNotMatch(source, /--disable-|--headed|cargo build|rustup|build:svg|WebAssembly\.instantiate/);
});
