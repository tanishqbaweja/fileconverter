import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
const originalHash = "76b50f530ee0d117064be896c1051893db1ef4c875418915e86a353653e72974";
export function makeUiMatrixBenchmarkDriver(source, root, resolvePackage) {
  assert.equal(createHash("sha256").update(source).digest("hex"), originalHash);
  const removeNativeSnapshot = `  if (sampling) {
    const value = await cdp.send("Memory.getSamplingProfile");
    // Reject oversized/unsupported payloads rather than silently accepting a truncated profile.
    assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 524288, "Native sampling response cap");
    assert.ok(value.profile.samples.length <= 4096 && value.profile.modules.length <= 256);
    for (const sample of value.profile.samples) assert.ok(sample.stack.length <= 128);
    profiles.push({ phase, ...value });
  }`;
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), exec =', `const root = ${JSON.stringify(root)}, exec =`],
    ['const rows = [], forbidden = [], cleanupErrors = [], profiles = [];', `const rows = [], forbidden = [], cleanupErrors = [], profiles = [];
const benchmarkVariant = process.env.WITHIN_UI_MATRIX_VARIANT;
assert.ok(["baseline", "static-matrix-candidate"].includes(benchmarkVariant));
let matrixMarkupSha256 = null, alternateProfileId = null;
const expectedMatrixSha256 = process.env.WITHIN_EXPECTED_MATRIX_SHA256 ?? null;
if (benchmarkVariant !== "baseline") assert.match(expectedMatrixSha256 ?? "", /^[a-f0-9]{64}$/);`],
    ['selectedProfileId: state?.selectedProfileId ?? null, jobState: state?.jobState ?? null };',
      'selectedProfileId: state?.selectedProfileId ?? null, jobState: state?.jobState ?? null, performance: sampling ? (await cdp.send("Performance.getMetrics")).metrics : null };'],
    [removeNativeSnapshot, `  if (sampling) {
    assert.ok(row.performance.length < 128);
    for (const name of ["ScriptDuration", "TaskDuration", "LayoutDuration", "RecalcStyleDuration"])
      assert.ok(row.performance.some(metric => metric.name === name && Number.isFinite(metric.value) && metric.value >= 0));
    const matrix = await page.locator("#formats").innerHTML();
    assert.ok(Buffer.byteLength(matrix) < 256 * 1024); assert.equal(sha(matrix), matrixMarkupSha256);
  }`],
    ['const alternate = choices.find(value => value && value !== "mkv-to-mp4"); assert.ok(alternate);',
      `const alternate = choices.find(value => value && value !== "mkv-to-mp4"); assert.ok(alternate);
  alternateProfileId = alternate;
  await page.waitForFunction(() => document.querySelector('[data-testid="media-inspection-status"]')?.textContent.includes("no media payload was uploaded or decoded"));
  const matrix = await page.locator("#formats").innerHTML(); assert.ok(Buffer.byteLength(matrix) < 256 * 1024);
  matrixMarkupSha256 = sha(matrix); assert.equal(await page.locator("#formats .matrix article").count(), 405);
  if (expectedMatrixSha256) assert.equal(matrixMarkupSha256, expectedMatrixSha256);`],
    ['await cdp.send("Memory.startSampling", { samplingInterval: 524288, suppressRandomness: false });',
      'await cdp.send("Performance.enable", { timeDomain: "threadTicks" });'],
    ['await cdp.send("Memory.stopSampling");', 'await cdp.send("Performance.disable");'],
    ['"ui-native-allocation-"', '"ui-matrix-benchmark-"'],
    ['["scripts/diagnose-ui-native-allocation.mjs", "app/converter/ConverterApp.tsx",',
      '["scripts/benchmark-ui-format-matrix.mjs", "scripts/lib/ui-matrix-benchmark-recipe.mjs", "scripts/lib/static-format-matrix-recipe.mjs", "scripts/diagnose-ui-native-allocation.mjs", "app/converter/ConverterApp.tsx",'],
    ['sourcePins, browserVersion, originalSourceBytes:', 'sourcePins, browserVersion, benchmarkVariant, matrixMarkupSha256, expectedMatrixSha256, alternateProfileId, originalSourceBytes:'],
    ['-ui-native-allocation.json', '-ui-matrix-benchmark.json'],
    ['Actual production UI source inspection and60format-selection changes; native allocation/DOM control only',
      'Actual production UI60selection benchmark, three20selection CPU/DOM batches, unchanged original source and exact405card markup; no conversions or speed/memory acceptance for a conversion route'],
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
