// Required different output path: real FileSystemFileHandle writes through the
// existing directory-picker test adapter. Rasterizer and independent pixels stay unchanged.
import assert from "node:assert/strict";
import { makeReproducedSvgStressQualification } from "./reproduced-svg-stress-recipe.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace = (source, before, after) => {
  assert.equal(source.split(before).length - 1, 1, "Exact direct stress anchor: " + before); return source.replace(before, after);
};
export function makeReproducedSvgDirectStressQualification(options) {
  const base = makeReproducedSvgStressQualification(options), edits = [];
  const begin = base.suite.indexOf("for (const [\n  profileId,\n  sourceName,");
  const end = base.suite.indexOf('\n\ntest("GIF to JPEG XL preserves every frame, microsecond timing, and infinite looping"', begin);
  assert.ok(begin > 0 && end > begin, "Exact generic image-case boundary");
  let body = base.suite.slice(begin, end);
  const edit = (before, after) => { body = replace(body, before, after); edits.push([before, after]); };
  edit('    assertProjectLocal(outputPath);\n    try {\n      await page.goto("/?test=1");',
    '    assertProjectLocal(outputPath);\n    try {\n      await page.goto(stressRepeat ? "/?test=1&directory=1" : "/?test=1");');
  edit('      expect(state?.jobState, state?.error ?? state?.phase).toBe("complete");\n      expect(state?.opfsName).toBeTruthy();',
    '      expect(state?.jobState, state?.error ?? state?.phase).toBe("complete");\n' +
    '      const browserOutputName = stressRepeat ? state?.batchOutputNames?.[0] : state?.opfsName;\n' +
    '      if (stressRepeat) {\n' +
    '        expect(state?.opfsName).toBeNull();\n' +
    '        expect(state?.batchOutputNames).toEqual(["svg-grid-8m.png"]);\n' +
    '        expect(state?.metrics?.peakPendingOperations).toBe(1);\n' +
    '        expect(state?.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);\n' +
    '      } else expect(state?.opfsName).toBeTruthy();');
  edit('        await root.removeEntry(opfsName!);\n      }, state!.opfsName);', '        await root.removeEntry(opfsName!);\n      }, browserOutputName!);');
  edit('const evidence = JSON.stringify({ repeat: stressRepeat, independentlyValidatedRgbaPixels: true,',
    'const evidence = JSON.stringify({ repeat: stressRepeat, destinationMode: "direct-handle-test-directory", independentlyValidatedRgbaPixels: true,');
  const tail = '      await rm(outputPath, { force: true });\n    }\n  });\n}';
  edit(tail, '      await rm(outputPath, { force: true });\n' +
    '      if (stressRepeat) await page.evaluate(async () => {\n' +
    '        const root = await navigator.storage.getDirectory();\n' +
    '        await root.removeEntry("svg-grid-8m.png").catch(() => {});\n' +
    '      }).catch(() => {});\n    }\n  });\n}');
  const suite = base.suite.slice(0, begin) + body + base.suite.slice(end);
  let driver = replace(base.driver, JSON.stringify(sha(base.suite)), JSON.stringify(sha(suite)));
  assert.equal(driver.split("svg-grid-8m-three-repeat-suite").length - 1, 2);
  driver = driver.replaceAll("svg-grid-8m-three-repeat-suite", "svg-grid-8m-direct-three-repeat-suite");
  driver = replace(driver, '"passed-three-private-svg-grid-8m-repeats-not-full-stress-or-release-acceptance"',
    '"passed-three-private-svg-grid-8m-direct-repeats-not-full-stress-or-release-acceptance"');
  driver = replace(driver, 'scope: "Three same-browser 3840x2160 SVG grid conversions with exact independent RGBA equality; not effects, clean-session repeats, OOM/recovery or public release acceptance"',
    'scope: "Three same-browser 3840x2160 SVG direct-handle conversions with exact independent RGBA equality; OS picker, effects, OOM/recovery and full release remain separate"');
  driver = replace(driver, 'scope: "Entire three-repeat SVG grid suite including independent validation and cleanup; not full SVG stress/OOM acceptance"',
    'scope: "Entire three-repeat direct-handle SVG grid suite including independent validation and cleanup; not full SVG stress/OOM acceptance"');
  return { ...base, driver, suite, directSuiteEdits: edits,
    proof: { ...base.proof, driverSha256: sha(driver), suiteSha256: sha(suite),
      destinationMode: "direct-handle-test-directory", osNativePickerVerified: false, newRequiredRouteNotOpfsReplay: true } };
}
