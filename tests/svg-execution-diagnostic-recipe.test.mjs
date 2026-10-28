import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeSvgExecutionDiagnostic } from "../scripts/lib/svg-execution-diagnostic-recipe.mjs";
import { makeReproducedSvgDirectStressQualification } from "../scripts/lib/reproduced-svg-direct-stress-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const options = { root, runtime: path.join(root, "work/svg-reproduced-qualification-aBc123"),
  driverBytes: await read("scripts/test-source-built-svg-candidate.mjs"), suiteBytes: await read("tests/browser/image-conversions.spec.ts"),
  generatorBytes: await read("scripts/generate-svg-stress-fixture.py") };
test("separate execution diagnostic retains exact source/reference, direct engine and every original fidelity assertion", () => {
  const base = makeReproducedSvgDirectStressQualification(options), diagnostic = makeSvgExecutionDiagnostic(options);
  let restored = diagnostic.suite;
  for (const [before, after] of [...diagnostic.suiteEdits].reverse()) {
    assert.equal(restored.split(after).length - 1, 1); restored = restored.replace(after, before);
  }
  assert.equal(restored, base.suite); assert.equal(diagnostic.generator, base.generator); assert.equal(diagnostic.config, base.config);
  assert.match(diagnostic.suite, /new MutationObserver/); assert.match(diagnostic.suite, /button.click\(\)/);
  assert.match(diagnostic.suite, /phaseBytes.rasterized\).toBeGreaterThan\(0\)/);
  assert.match(diagnostic.suite, /phaseBytes.encoded\).toBeUndefined\(\)/);
  assert.match(diagnostic.suite, /timeOriginAfter\).toBe\(timeOriginBefore\)/);
  assert.match(diagnostic.suite, /allocatedSharedBytes: 266276/);
  for (const [name, source] of [["diagnostic.mjs", diagnostic.driver], ["suite.ts", diagnostic.suite]])
    assert.deepEqual(ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, true).parseDiagnostics, [], name);
});
test("an unstable early baseline remains null and causes the final diagnostic verdict to fail, never yielding memory/release acceptance", () => {
  const diagnostic = makeSvgExecutionDiagnostic(options), strict = makeReproducedSvgDirectStressQualification(options);
  const gate = 'assert.equal(report.blankBaseline?.stable, true, "Do not delay/inflate the earliest stable blank baseline")';
  assert.equal(diagnostic.driver.split(gate).length - 1, 1);
  assert.ok(diagnostic.driver.indexOf(gate) > diagnostic.driver.indexOf("report.functionalAssertionsPassed = true"));
  assert.ok(strict.driver.indexOf(gate) < strict.driver.indexOf('runner = spawn('), "Original qualification still stops before conversion");
  assert.match(diagnostic.driver, /report.blankBaseline\?\.stable === true \? \(report.memory.peak.privateBytes - report.blankBaseline.privateBytes\) \/ 1048576 : null/);
  for (const unchanged of ['baselineDeadline = baselineStarted + 30000', 'stableWindow(report.blankSamples)',
    'report.memory.incrementalPrivateMiB <= 250', 'validSamples > 0', 'screenshots: true, snapshots: !noDomSnapshotDiagnostic',
    'owned-identity-absent', 'report.stats.expected, 3']) assert.ok(diagnostic.driver.includes(unchanged), unchanged);
  assert.doesNotMatch(diagnostic.driver, /--disable-|--headed|ignoreDefaultArgs|forceGC/);
  assert.match(diagnostic.driver, /report.memoryAcceptance = false/);
});
