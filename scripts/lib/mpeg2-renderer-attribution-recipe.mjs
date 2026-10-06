import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeSettledOriginalDriver } from "./mpeg2-settled-original-recipe.mjs";
export function makeRendererAttributionDriver(source, root, resolvePackage) {
  const settled = makeSettledOriginalDriver(source, root, resolvePackage);
  const helper = pathToFileURL(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs")).href;
  const patches = [
    ['const diagnosticOnly = false;', 'const diagnosticOnly = true;'],
    ['let startupSettlement = null;', `import { startBoundedRendererAttribution } from ${JSON.stringify(helper)};
let rendererAttribution = null, rendererAttributionResult = null;
let attributionDumpCount = 0, nextAttributionDump = 0;
let startupSettlement = null;`],
    ['const sourceFiles = ["scripts/mpeg2-settled-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-renderer-attribution.mjs", "scripts/lib/mpeg2-renderer-attribution-recipe.mjs", "scripts/lib/bounded-renderer-attribution.mjs", "scripts/lib/memory-infra-attribution.mjs", "evidence/renderer-attribution-prerequisite-2026-10-06.json", "evidence/mpeg2-settled-original-failure-2026-10-06.json", "scripts/mpeg2-settled-original-memory.mjs",'],
    ['-private-mpeg2-split-settled-original-native-100ms', '-private-mpeg2-renderer-attribution-native-100ms'],
    ['"mpeg2-settled-original-runtime-"', '"mpeg2-renderer-attribution-runtime-"'],
    ['await page.locator(\'[data-testid="convert-button"]\').click();', `rendererAttribution = await startBoundedRendererAttribution(await browser.newBrowserCDPSession(), realms);
    await rendererAttribution.dump("pre-conversion-attribution", first.processes); attributionDumpCount++;
    nextAttributionDump = Date.now() + 15000;
    await page.locator('[data-testid="convert-button"]').click();`],
    ['const deadline = Date.now() + 6 * 60 * 60_000;', 'const deadline = Date.now() + 90000;'],
    ['assert.ok(run.incrementalPrivateMiB <= 250,', `if ((Date.now() >= nextAttributionDump && attributionDumpCount < 7) ||
        (run.incrementalPrivateMiB > 250 && attributionDumpCount < 8)) {
        await rendererAttribution.dump(run.incrementalPrivateMiB > 250 ? "strict-memory-failure-attribution" : "conversion-attribution-" + attributionDumpCount, sample.processes);
        attributionDumpCount++; nextAttributionDump = Date.now() + 15000;
      }
      assert.ok(run.incrementalPrivateMiB <= 250,`],
    ['cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page);',
      `if (rendererAttribution) rendererAttributionResult = await rendererAttribution.stop();
  });
  await attempt(async () => {
    cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page);`],
    ['nativeMemory, failure, logs, forbiddenRequests,', 'nativeMemory, rendererAttributionResult, failure, logs, forbiddenRequests,'],
    ['Full protected original via unchanged production pipeline, prospective five-minute blank startup settling before converter load; no flags/process exclusions/larger baseline, same full250MiB gate/quality/fidelity/three runs. No native OS-picker or speed-A/B certification',
      'ONE bounded original-source renderer-attribution diagnostic after fixed blank settling. Trace and faster realm sampling perturb memory/timing; no acceptance, no OS-picker or speed-A/B certification. Quality/fixed heaps/I/O/full250MiB gate unchanged.'],
  ];
  let generated = settled;
  for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of patches) { assert.equal(reversed.split(after).length, 2, after); reversed = reversed.replace(after, before); }
  assert.equal(reversed, settled, "Only explicit diagnostic patches; original source remains unchanged");
  return generated;
}
