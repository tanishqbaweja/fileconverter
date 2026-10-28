import assert from "node:assert/strict";
import path from "node:path";
import { makeReproducedSvgDirectStressQualification } from "./reproduced-svg-direct-stress-recipe.mjs";
import { svgEffectsGeneratorSha256 } from "./owned-svg-effects-fixture.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export const svgEffectsMinimumSsim = 0.99;
const replace = (source, before, after) => {
  assert.equal(source.split(before).length - 1, 1, "Exact SVG effects diagnostic anchor: " + before);
  return source.replace(before, after);
};
export function makeSvgEffectsDiagnostic(options) {
  const base = makeReproducedSvgDirectStressQualification(options), { root, runtime } = options, edits = [];
  let suite = base.suite;
  const edit = (before, after) => { suite = replace(suite, before, after); edits.push([before, after]); };
  const fixture = name => path.relative(path.join(root, "fixtures/images"), path.join(runtime, "fixture", name));
  const editCase = (before, after) => {
    const begin = suite.indexOf("for (const [\n  profileId,\n  sourceName,"), end = suite.indexOf('\n\ntest("GIF to JPEG XL preserves every frame', begin);
    assert.ok(begin > 0 && end > begin);
    const body = suite.slice(begin, end), changed = replace(body, before, after);
    edits.push([body, changed]); suite = suite.slice(0, begin) + changed + suite.slice(end);
  };
  for (const index of [1,2,3]) {
    const row = `  ["svg-to-png", ${JSON.stringify(fixture("svg-grid-8m.svg"))}, "png", "png", undefined, 3840, 2160, 1_000, undefined, ${JSON.stringify(fixture("svg-grid-8m-reference.png"))}, "rgba", undefined, "8m-grid-repeat-${index}"],`;
    edit(row, `  ["svg-to-png", ${JSON.stringify(fixture("svg-effects-6m.svg"))}, "png", "png", undefined, 3000, 2000, 1_000, undefined, ${JSON.stringify(fixture("svg-effects-6m-reference.png"))}, "rgb24", ${svgEffectsMinimumSsim}, "6m-effects-repeat-${index}"],`);
  }
  assert.equal(suite.split("svg-grid-8m.png").length - 1, 2);
  const beforeNames = suite; suite = suite.replaceAll("svg-grid-8m.png", "svg-effects-6m.png"); edits.push([beforeNames, suite]);
  editCase('      expect(state?.jobState, state?.error ?? state?.phase).toBe("complete");',
    '      if (stressRepeat && state?.jobState !== "complete") {\n' +
    '        if (!privateSvg) throw new Error("Missing owned effects descriptor");\n' +
    '        const failure = JSON.stringify({ repeat: stressRepeat, destinationMode: "direct-handle-test-directory", independentlyValidatedEffects: false, metrics: state?.metrics ?? null, failure: { jobState: state?.jobState ?? null, phase: state?.phase ?? null, error: state?.error ?? null } });\n' +
    '        if (Buffer.byteLength(failure) > 65536) throw new Error("Effects failure scalar bound");\n' +
    '        await writeFile(path.join(privateSvg.runtime, stressRepeat + ".json"), failure, { flag: "wx" });\n' +
    '      }\n      expect(state?.jobState, state?.error ?? state?.phase).toBe("complete");');
  editCase('          expect(similarity).toBeGreaterThanOrEqual(minimumReferenceSsim);',
    '          if (stressRepeat) {\n' +
    '            if (!privateSvg) throw new Error("Missing owned effects descriptor");\n' +
    '            const scalar = JSON.stringify({ repeat: stressRepeat, destinationMode: "direct-handle-test-directory",\n' +
    '              independentlyValidatedEffects: similarity >= minimumReferenceSsim, exactPixelEqualityClaimed: false,\n' +
    '              fidelity: { kind: "independent-Chromium-SVG-vs-resvg-native-FFmpeg-SSIM-rgb24", minimumSsim: minimumReferenceSsim, actualSsim: similarity },\n' +
    '              width: expectedWidth, height: expectedHeight, outputBytes: (await stat(outputPath)).size, metrics: state!.metrics, failure: null });\n' +
    '            if (Buffer.byteLength(scalar) > 65536) throw new Error("Effects fidelity scalar bound");\n' +
    '            await writeFile(path.join(privateSvg.runtime, stressRepeat + ".json"), scalar, { flag: "wx" });\n' +
    '          }\n          expect(similarity).toBeGreaterThanOrEqual(minimumReferenceSsim);');
  const originalEvidence = '        const evidence = JSON.stringify({ repeat: stressRepeat, destinationMode: "direct-handle-test-directory", independentlyValidatedRgbaPixels: true,';
  const jsonBegin = suite.indexOf(originalEvidence), jsonEnd = suite.indexOf('\n      }', jsonBegin);
  assert.ok(jsonBegin > 0 && jsonEnd > jsonBegin);
  edit(suite.slice(jsonBegin, jsonEnd),
    '        expect(state!.metrics.svgExecutionResources).toMatchObject({ phase: "closed", cancellationBytes: 4, destinationSharedBytes: 266272, allocatedSharedBytes: 266276, destinationWorkerCount: 0, peakKnownWorkerCount: 2 });');
  let driver = replace(base.driver, JSON.stringify(sha(base.suite)), JSON.stringify(sha(suite)));
  driver = driver.replaceAll("8m-grid-repeat-", "6m-effects-repeat-").replaceAll("svg-grid-8m-direct-three-repeat-suite", "svg-effects-6m-direct-three-repeat-suite");
  driver = replace(driver, 'report.stressRuns.every(row => row.result?.independentlyValidatedRgbaPixels === true)',
    'report.stressRuns.every(row => row.result?.independentlyValidatedEffects === true)');
  const baseline = 'assert.equal(report.blankBaseline?.stable, true, "Do not delay/inflate the earliest stable blank baseline");';
  driver = replace(driver, baseline + ' report.baselineAdjusted = false;',
    'report.baselineAdjusted = false; report.effectsDiagnostic = true; report.memoryAcceptance = false;\n' +
    '  report.earlyBaselineGatePassed = report.blankBaseline?.stable === true;\n' +
    '  report.earlyBaselineGateFailure = report.earlyBaselineGatePassed ? null : "No earliest stable blank baseline; final qualification must fail, effects diagnostic continues";');
  driver = replace(driver, 'report.memory.incrementalPrivateMiB = (report.memory.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576;',
    'report.memory.incrementalPrivateMiB = report.blankBaseline?.stable === true ? (report.memory.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 : null;');
  driver = replace(driver, '  assert.ok(report.memory.incrementalPrivateMiB <= 250, "Complete Chromium process-tree small-suite private-memory limit failed");',
    '  report.functionalAssertionsPassed = true;\n  ' + baseline + '\n  assert.ok(report.memory.incrementalPrivateMiB <= 250, "Complete Chromium process-tree small-suite private-memory limit failed");');
  driver = replace(driver, '"passed-three-private-svg-grid-8m-direct-repeats-not-full-stress-or-release-acceptance"',
    '"completed-svg-effects-diagnostic-not-full-svg-or-release-acceptance"');
  driver = replace(driver, 'assertionsChanged: false, thresholdsChanged: false,',
    'assertionsChanged: true, effectsAssertionsAdded: true, effectsMinimumSsim: 0.99, main250MiBLimitChanged: false,');
  driver = replace(driver, 'scope: "Three same-browser 3840x2160 SVG direct-handle conversions with exact independent RGBA equality; OS picker, effects, OOM/recovery and full release remain separate"',
    'scope: "Three direct6M mask/filter-chain SVG conversions against independent current-Chromium references at SSIM0.99; final strict baseline/250 verdict retained, not full release acceptance"');
  driver = replace(driver, 'scope: "Entire three-repeat direct-handle SVG grid suite including independent validation and cleanup; not full SVG stress/OOM acceptance"',
    'scope: "Entire three-repeat6M direct effects suite including independent SSIM validation and cleanup; not full SVG/OOM acceptance"');
  return { ...base, driver, suite, suiteEdits: edits, generator: undefined, generatorPath: undefined,
    proof: { ...base.proof, driverSha256: sha(driver), suiteSha256: sha(suite), effectsDiagnostic: true,
      generatorSha256: null, originalGeneratorSha256: svgEffectsGeneratorSha256,
      sameFidelityAndResourceThresholds: false, mainFormulaAnd250MiBLimitUnchanged: true,
      sourceFixture: "Same470390B historical6M SVG", independentReference: "Fresh pinned current-Chromium SVG and Canvas2D; compare reference SHA to history explicitly",
      exactPixelEqualityClaimed: false, minimumSsim: svgEffectsMinimumSsim, independentPixelGate: "Native SSIM rgb24>=0.99, not exactRGBA",
      strictFinalBaselineAnd250MiBRetained: true, publicPromotion: false,
      scope: "Three6M SVG mask/filter-chain direct writes at independently validated SSIM0.99; not OOM/cleanup-stability/full release" } };
}
