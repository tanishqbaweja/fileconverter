import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeStaticUiOriginalDriver } from "../scripts/lib/mpeg2-static-ui-original-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const golden = JSON.parse(await read("evidence/ui-matrix-golden-regression-2026-10-07.json"));
const privacy = JSON.parse(await read("evidence/ui-privacy-offline-2026-10-06T21-40-31-968Z.json"));
test("UI change retains five real private conversion/recovery goldens, not original/fulltree acceptance", async () => {
  assert.equal(golden.conversions.length, 3); assert.equal(golden.recovery.length, 2);
  assert.equal(golden.emptyCleanupInventories, 5); assert.equal(golden.nativeFullDecodePassed, true);
  assert.equal(golden.originalFullSourceAcceptance, false); assert.equal(golden.publicAcceptance, false);
  assert.equal(golden.completeChromiumMemoryAcceptance, false);
  for (const row of golden.audioChecks) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
  for (const row of golden.recovery) assert.deepEqual(row.partialBytes, []);
  for (const [file, digest] of Object.entries(golden.sourcePins)) assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest);
});
test("Focused UI privacy/offline executes unchanged three assertions with isolated finally-cleaned runtime", async () => {
  assert.equal(privacy.status, "passed-focused-regression"); assert.equal(privacy.stats.expected, 3);
  assert.equal(privacy.stats.unexpected, 0); assert.equal(privacy.stats.skipped, 0);
  assert.equal(privacy.runtimeRemoved, true); assert.equal(privacy.fullOfflineEngineCoverage, false);
  for (const [file, digest] of Object.entries(privacy.sourcePins)) assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest);
  const runner = (await read("scripts/check-ui-privacy-offline.mjs")).toString();
  assert.ok(runner.includes("assert.equal(reverse, source)")); assert.ok(runner.includes("finally {"));
  assert.ok(runner.includes('createOwnedRuntimeScratch("ui-privacy-offline-")'));
});
test("Changed-original UI retest preserves settled baseline, original fidelity/fulltree/three-run and cleanup gates", async () => {
  const source = (await read("scripts/mpeg2-split-single-navigation-memory.mjs")).toString();
  const generated = makeStaticUiOriginalDriver(source, root, specifier => import.meta.resolve(specifier));
  for (const anchor of ['minimumMs: 300000', 'blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes',
    'number <= 3', 'run.incrementalPrivateMiB <= 250', '6 * 60 * 60_000', 'ssim >= 0.98',
    'assert.equal(video.width, 1920); assert.equal(video.height, 804)', 'await verifySource()', 'cancelBrowserConversionBeforeCleanup(page)',
    '"app/converter/ConverterApp.tsx"', '"evidence/ui-matrix-benchmark-2026-10-07.json"']) assert.ok(generated.includes(anchor), anchor);
  assert.ok(!generated.includes('Memory.startSampling')); assert.ok(!generated.includes('HeapProfiler'));
  assert.throws(() => makeStaticUiOriginalDriver(source + "\n", root, specifier => import.meta.resolve(specifier)));
});
