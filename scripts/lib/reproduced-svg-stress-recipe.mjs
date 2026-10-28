// Reuse the existing image-case body and normal-profile owner. Only the selected
// fixture, repeat labels and retained scalar evidence differ from small cases.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeReproducedSvgBrowserQualification } from "./reproduced-svg-browser-recipe.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export const svgGridGeneratorSha256 = "757bd4490c38f75d0f40821e27f24ac168621a71353906ab75c26066ca19bb53";
const replace = (source, before, after) => {
  assert.equal(source.split(before).length - 1, 1, "Exact stress adaptation anchor: " + before); return source.replace(before, after);
};
export function makeReproducedSvgStressQualification(options) {
  const { root, runtime, generatorBytes } = options;
  assert.equal(sha(generatorBytes), svgGridGeneratorSha256);
  const base = makeReproducedSvgBrowserQualification(options), fixtureRoot = path.join(runtime, "fixture");
  const input = path.relative(path.join(root, "fixtures/images"), path.join(fixtureRoot, "svg-grid-8m.svg"));
  const reference = path.relative(path.join(root, "fixtures/images"), path.join(fixtureRoot, "svg-grid-8m-reference.png"));
  const rows = [1,2,3].map(index => `  ["svg-to-png", ${JSON.stringify(input)}, "png", "png", undefined, 3840, 2160, 1_000, undefined, ${JSON.stringify(reference)}, "rgba", undefined, "8m-grid-repeat-${index}"],`).join("\n");
  let suite = replace(base.suite, "const routes = [", "const routes = [\n" + rows);
  suite = `import { compareExactRgbaBuffers } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/exact-rgba-validation.mjs")).href)};\n` + suite;
  suite = replace(suite, "  minimumReferenceSsim,\n] of routes)", "  minimumReferenceSsim,\n  stressRepeat,\n] of routes)");
  suite = replace(suite, '${sourceName} produces a bounded independently decodable image`, async () => {',
    '${sourceName} produces a bounded independently decodable image${stressRepeat ? ` [${stressRepeat}]` : ""}`, async () => {');
  suite = replace(suite, '    const outputPath = path.join(outputRoot, `${profileId}.${extension}`);',
    '    let stressPixelComparisonMs: number | null = null;\n    const outputPath = path.join(outputRoot, `${profileId}.${extension}`);');
  const pixelGate = `          expect(await frameBytes(outputPath)).toEqual(\n            await frameBytes(referencePath),\n          );\n        }\n      }`;
  const exactPixelGate = `          const convertedPixels = await frameBytes(outputPath), referencePixels = await frameBytes(referencePath);\n` +
    `          if (stressRepeat) {\n` +
    `            const equality = compareExactRgbaBuffers(convertedPixels, referencePixels, expectedWidth * expectedHeight * 4);\n` +
    `            expect(equality.equal).toBe(true); stressPixelComparisonMs = equality.comparisonMs;\n` +
    `          } else expect(convertedPixels).toEqual(referencePixels);\n        }\n      }`;
  suite = replace(suite, pixelGate, exactPixelGate + `\n      if (stressRepeat) {\n` +
    `        if (!privateSvg) throw new Error("Stress evidence requires the owned private descriptor");\n` +
    `        expect(state!.metrics.svgMemoryObservation).toMatchObject({ phase: "released", available: true, observations: 6, unavailableObservations: 0, maximumBytes: null });\n` +
    `        expect(state!.metrics.svgMemoryObservation!.peakBytes).toBeGreaterThan(0);\n` +
    `        await expect(page.locator("dt").filter({ hasText: /^Peak Wasm$/ }).locator("..").locator("dd")).not.toHaveText(/Not used|Unavailable|incomplete/);\n` +
    `        const evidence = JSON.stringify({ repeat: stressRepeat, independentlyValidatedRgbaPixels: true,\n` +
    `          width: expectedWidth, height: expectedHeight, outputBytes: (await stat(outputPath)).size, metrics: state!.metrics,\n` +
    `          pixelComparison: { implementation: "exact-native-buffer-equality", expectedBytes: expectedWidth * expectedHeight * 4, comparisonMs: stressPixelComparisonMs } });\n` +
    `        if (Buffer.byteLength(evidence) > 65536) throw new Error("Stress scalar evidence exceeds bound");\n` +
    `        await writeFile(path.join(privateSvg.runtime, stressRepeat + ".json"), evidence, { flag: "wx" });\n      }`);
  let driver = replace(base.driver, JSON.stringify(sha(base.suite)), JSON.stringify(sha(suite)));
  driver = replace(driver, '"--grep", "svg-to-png|SVG",', '"--grep", "8m-grid-repeat-[123]",');
  driver = replace(driver, 'assert.equal(report.stats.expected, 10);', 'assert.equal(report.stats.expected, 3);\n  assert.ok(report.stressRuns.every(row => row.result?.independentlyValidatedRgbaPixels === true));');
  driver = replace(driver, '  report.forbiddenRequests = forbidden; report.forbiddenRequestOverflow = forbiddenOverflow;',
    `  report.stressRuns = [];\n  for (const index of [1,2,3]) {\n` +
    `    const repeat = "8m-grid-repeat-" + index;\n    try {\n` +
    `      const bytes = await readFile(path.join(runtime.directory, repeat + ".json")); assert.ok(bytes.length <= 65536);\n` +
    `      report.stressRuns.push({ repeat, result: JSON.parse(bytes), unavailable: null });\n` +
    `    } catch (error) { if (error.code !== "ENOENT") throw error; report.stressRuns.push({ repeat, result: null, unavailable: "Not written before failure" }); }\n  }\n` +
    '  report.forbiddenRequests = forbidden; report.forbiddenRequestOverflow = forbiddenOverflow;');
  driver = driver.replaceAll("small-svg-suite", "svg-grid-8m-three-repeat-suite");
  driver = replace(driver, '"passed-ten-private-small-svg-browser-cases-not-public-stress-acceptance"', '"passed-three-private-svg-grid-8m-repeats-not-full-stress-or-release-acceptance"');
  driver = replace(driver, 'scope: "Ten existing small SVG production UI/worker/I/O/validator/security/recovery tests with a private source-built Wasm response; not full stress/OOM/reproducibility or release acceptance"',
    'scope: "Three same-browser 3840x2160 SVG grid conversions with exact independent RGBA equality; not effects, clean-session repeats, OOM/recovery or public release acceptance"');
  driver = replace(driver, 'scope: "Entire ten-case small suite including validation; not scaling/stress/OOM acceptance"',
    'scope: "Entire three-repeat SVG grid suite including independent validation and cleanup; not full SVG stress/OOM acceptance"');
  let generator = replace(generatorBytes.toString(), "PROJECT_ROOT = Path(__file__).resolve().parent.parent", `PROJECT_ROOT = Path(${JSON.stringify(root)})`);
  generator = replace(generator, 'FIXTURE_ROOT = PROJECT_ROOT / "fixtures" / "stress" / "images"', `FIXTURE_ROOT = Path(${JSON.stringify(fixtureRoot)})`);
  return { ...base, driver, suite, generator, generatorPath: path.join(runtime, "generate-grid.py"), fixtureRoot,
    proof: { ...base.proof, sameTenCasesAndAllAssertions: false, sameImageCaseBodyAssertions: false, sameFidelityAndResourceThresholds: true,
      selectedStressRuns: 3, independentPixelGate: "Exact RGBA bytes, not relaxed SSIM", driverSha256: sha(driver), suiteSha256: sha(suite),
      generatorSha256: sha(generator), originalGeneratorSha256: svgGridGeneratorSha256,
      scope: "8,294,400-pixel grid only; effects and full release gates remain separate" } };
}
