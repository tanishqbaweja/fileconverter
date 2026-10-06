// Prospective measurement correction supported by the independent blank-only
// control. No new flags, excluded process, enlarged denominator or codec change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ORIGINAL_DRIVER_SHA256 } from "./mpeg2-aligned-progress-recipe.mjs";
export function makeSettledOriginalDriver(source, root, resolvePackage) {
  assert.equal(createHash("sha256").update(source).digest("hex"), ORIGINAL_DRIVER_SHA256);
  assert.equal(path.resolve(root), root);
  const settle = `await page.goto("about:blank");
  startupSettlement = { minimumMs: 300000, startedAt: Date.now(), earlyWindow: null,
    pageStayedBlank: true, flagsChanged: false, processesExcluded: 0, baselineInflated: false };
  const startupSamples = [];
  while (Date.now() - startupSettlement.startedAt < startupSettlement.minimumMs) {
    assert.equal(page.url(), "about:blank");
    assert.ok(startupSamples.length < 256, "Startup observation sample cap");
    startupSamples.push(await takeSample("blank-startup-settle"));
    startupSettlement.earlyWindow ??= stableWindow(startupSamples);
    await delay(2000);
  }
  blankBaseline = await stable("blank-baseline");
  assert.ok(startupSettlement.earlyWindow, "Actual early startup window required for no-inflation guard");
  assert.ok(blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes,
    "Settled blank exceeds early blank; cannot substitute a larger baseline");
  startupSettlement.finishedAt = Date.now();
  startupSettlement.actualMs = startupSettlement.finishedAt - startupSettlement.startedAt;`;
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), MiB = 1024 ** 2;', `const root = ${JSON.stringify(root)}, MiB = 1024 ** 2;`],
    ['let blankBaseline = null, loadedIdle = null, sourceProbe = null, browserVersion = null;',
      'let startupSettlement = null;\nlet blankBaseline = null, loadedIdle = null, sourceProbe = null, browserVersion = null;'],
    ['await page.goto("about:blank"); blankBaseline = await stable("blank-baseline");', settle],
    ['const sourceFiles = ["scripts/mpeg2-split-single-navigation-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-settled-original-memory.mjs", "scripts/lib/mpeg2-settled-original-recipe.mjs", "scripts/lib/mpeg2-aligned-progress-recipe.mjs", "evidence/blank-chromium-lifecycle-2026-10-06.json", "evidence/mpeg2-aligned-full-failure-2026-10-06.json", "scripts/mpeg2-split-single-navigation-memory.mjs",'],
    ['-private-mpeg2-split-single-navigation-native-100ms', '-private-mpeg2-split-settled-original-native-100ms'],
    ['"mpeg2-split-single-nav-runtime-"', '"mpeg2-settled-original-runtime-"'],
    ['limitMiB: 250, requestedRuns: diagnosticOnly ? 1 : 3, blankBaseline,',
      'limitMiB: 250, requestedRuns: diagnosticOnly ? 1 : 3, startupSettlement, blankBaseline,'],
    ['Full protected source HEVC to separate MPEG2 encoder via production selected OPFS handle, single page navigation with normal worker replacement; no native OS-picker or speed-A/B certification',
      'Full protected original via unchanged production pipeline, prospective five-minute blank startup settling before converter load; no flags/process exclusions/larger baseline, same full250MiB gate/quality/fidelity/three runs. No native OS-picker or speed-A/B certification'],
  ];
  let generated = source;
  for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of patches) { assert.equal(reversed.split(after).length, 2, after); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  return generated.replace(/from "([^"\n]+)"/g, (all, specifier) => {
    if (specifier.startsWith("node:")) return all;
    const url = specifier.startsWith("./") ? pathToFileURL(path.resolve(root, "scripts", specifier)).href : resolvePackage(specifier);
    assert.ok(url.startsWith("file:")); return `from ${JSON.stringify(url)}`;
  });
}
