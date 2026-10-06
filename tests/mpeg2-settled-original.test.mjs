import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeSettledOriginalDriver } from "../scripts/lib/mpeg2-settled-original-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const read = file => readFile(path.join(root, file));
test("Independent blank control proves timed startup model with no converter, no larger later baseline and cleanup", async () => {
  const proof = JSON.parse(await read("evidence/blank-chromium-lifecycle-2026-10-06.json"));
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest, file);
  assert.equal(proof.converterLoaded, false); assert.equal(proof.originalFileRead, false);
  assert.equal(proof.conversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.baselineAdjusted, false); assert.equal(proof.processesExcluded, 0);
  assert.equal(proof.delayedModel.actualNativePeakProcess.privateBytes, 292646912);
  assert.equal(proof.delayedModel.matchedCimIdentity.utilitySubtype, "on_device_model.mojom.OnDeviceModelService");
  assert.ok(proof.delayedModel.millisecondsAfterChromeLaunch >= 179000);
  assert.ok(proof.laterQuietWindowDiagnosticOnly.privateBytes < proof.earlyStable.privateBytes);
  assert.equal(proof.blankOnlyPeak.processes.reduce((sum, process) => sum + process.privateBytes, 0), proof.blankOnlyPeak.privateBytes);
  for (const flag of Object.values(proof.cleanup)) assert.equal(flag, true);
});
test("Prospective fixed settling preserves all full-original gates and rejects a larger denominator", async () => {
  const source = (await read("scripts/mpeg2-split-single-navigation-memory.mjs")).toString();
  const generated = makeSettledOriginalDriver(source, root, specifier => import.meta.resolve(specifier));
  for (const needle of ['const diagnosticOnly = false', 'minimumMs: 300000',
    'blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes',
    'requestedRuns: diagnosticOnly ? 1 : 3', 'const deadline = Date.now() + 6 * 60 * 60_000',
    'run.incrementalPrivateMiB <= 250', 'ssim >= 0.98', 'await verifySource()',
    'cancelBrowserConversionBeforeCleanup(page)', 'await runtime.close()',
    'startupSettlement, blankBaseline', 'assert.equal(page.url(), "about:blank")']) assert.ok(generated.includes(needle), needle);
  const originalFlags = source.match(/"--disable-features=[^"]+"/)[0]; assert.ok(generated.includes(originalFlags));
  assert.doesNotMatch(generated, /from "\.\//);
  assert.throws(() => makeSettledOriginalDriver(source + "\n", root, () => ""));
});
