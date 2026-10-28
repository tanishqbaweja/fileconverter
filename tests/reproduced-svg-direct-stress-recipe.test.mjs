import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeReproducedSvgStressQualification } from "../scripts/lib/reproduced-svg-stress-recipe.mjs";
import { makeReproducedSvgDirectStressQualification } from "../scripts/lib/reproduced-svg-direct-stress-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const options = { root, runtime: path.join(root, "work/svg-reproduced-qualification-aBc123"),
  driverBytes: await read("scripts/test-source-built-svg-candidate.mjs"), suiteBytes: await read("tests/browser/image-conversions.spec.ts"),
  generatorBytes: await read("scripts/generate-svg-stress-fixture.py") };
test("direct stress changes only exact reversible destination hooks, never rendering, decoder, pixel, memory or write-size assertions", () => {
  const original = makeReproducedSvgStressQualification(options), direct = makeReproducedSvgDirectStressQualification(options);
  let restored = direct.suite;
  for (const [before, after] of [...direct.directSuiteEdits].reverse()) {
    assert.equal(restored.split(after).length - 1, 1); restored = restored.replace(after, before);
  }
  assert.equal(restored, original.suite); assert.equal(direct.generator, original.generator); assert.equal(direct.config, original.config);
  assert.equal(direct.proof.destinationMode, "direct-handle-test-directory"); assert.equal(direct.proof.osNativePickerVerified, false);
  assert.match(direct.suite, /directory=1/); assert.match(direct.suite, /opfsName\).toBeNull/);
  assert.match(direct.suite, /batchOutputNames\).toEqual\(\["svg-grid-8m.png"\]\)/);
  assert.match(direct.suite, /\}, browserOutputName!\)/); assert.match(direct.suite, /root.removeEntry\("svg-grid-8m.png"\)/);
  assert.match(direct.suite, /compareExactRgbaBuffers\(convertedPixels, referencePixels, expectedWidth \* expectedHeight \* 4\)/);
  for (const [file, source] of [["direct.mjs", direct.driver], ["suite.ts", direct.suite]])
    assert.deepEqual(ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true).parseDiagnostics, []);
});
test("direct owner keeps exact early baseline, normal services, full tracing, fixed 250 target and actual-memory gates", async () => {
  const direct = makeReproducedSvgDirectStressQualification(options), runner = (await read("scripts/test-reproduced-svg-stress.mjs")).toString();
  for (const anchor of ['baselineDeadline = baselineStarted + 30000', 'stableWindow(report.blankSamples)', 'report.memory.incrementalPrivateMiB <= 250',
    'screenshots: true, snapshots: !noDomSnapshotDiagnostic', 'report.stats.expected, 3', 'owned-identity-absent']) assert.ok(direct.driver.includes(anchor), anchor);
  assert.match(direct.suite, /observations: 6, unavailableObservations: 0/);
  assert.match(runner, /\["--list-only", "--direct-handle"\]\.includes\(arg\)/);
  assert.match(runner, /if \(directHandle\) assert.equal\(run.result.destinationMode, "direct-handle-test-directory"\)/);
  assert.doesNotMatch(direct.driver, /--disable-|ignoreDefaultArgs|--headed/);
});
