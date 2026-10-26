import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { BROWSER_STORAGE_WRITE_ERROR_SUMMARY, STORAGE_ERROR_CLASSIFICATION_CHARACTERS, presentConversionError } from "../lib/conversion-error-presentation.ts";
import { validateRealOpfsQuotaFailure } from "../scripts/lib/real-opfs-quota-validation.mjs";
const real = "Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation | Audio frame encode or mux failed: I/O error";
test("observed browser-private storage write error gets plain-language guidance without changing its exact native diagnostic", () => {
  const result = presentConversionError(real);
  assert.equal(result.summary, BROWSER_STORAGE_WRITE_ERROR_SUMMARY); assert.equal(result.nativeDetail, real);
  for (const operation of ["write", "truncate", "flush"]) {
    assert.equal(presentConversionError(real.replace("'write'", `'${operation}'`)).summary, BROWSER_STORAGE_WRITE_ERROR_SUMMARY);
  }
  assert.equal(presentConversionError(real.replace("No space available", "The quota has been exceeded")).nativeDetail, real.replace("No space available", "The quota has been exceeded"));
});
test("metadata, allocation, permission, direct-destination and unknown IO errors are not relabelled as private-storage failures", () => {
  for (const message of ["No space left on device", "Audio header write failed: No space left on device", "Cannot allocate memory",
    "The destination ran out of quota after a bounded write.", "Permission denied", "The tags and cover exceed a bounded metadata limit",
    real.replace("FileSystemSyncAccessHandle", "FileSystemWritableFileStream"), real.replace("No space available", "Permission denied"),
    "Codec diagnostic | " + real, "Source text says " + real]) {
    assert.deepEqual(presentConversionError(message), { summary: message, nativeDetail: null });
  }
});
test("classification examines only a fixed prefix and preserves even long diagnostics without parsing or transmitting file data", async () => {
  assert.equal(STORAGE_ERROR_CLASSIFICATION_CHARACTERS, 512);
  const long = real + "x".repeat(65536); assert.equal(presentConversionError(long).nativeDetail, long);
  const unknown = "x".repeat(65536) + real; assert.equal(presentConversionError(unknown).nativeDetail, null);
  const source = await readFile("lib/conversion-error-presentation.ts", "utf8");
  assert.match(source, /message.slice\(0, STORAGE_ERROR_CLASSIFICATION_CHARACTERS\)/);
  assert.doesNotMatch(source, /fetch\(|postMessage|localStorage|arrayBuffer|normalize|setError|wasmMemory/);
});
test("real React server markup provides an alert, closed technical details, exact escaped diagnostics and unchanged unknown-error fallback", async () => {
  // Markup only; actual open/close and recovery behavior needs the browser gate.
  const source = await readFile("app/converter/ConversionError.tsx", "utf8"), exports = {}, require = createRequire(import.meta.url);
  const helper = { presentConversionError };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => name === "../../lib/conversion-error-presentation" ? helper : require(name) });
  const message = real + " | <script>not executable</script>", markup = renderToStaticMarkup(exports.ConversionError({ message }));
  assert.match(markup, /role="alert"/); assert.match(markup, /data-testid="conversion-error-summary"/);
  assert.match(markup, /<details[^>]*data-testid="conversion-error-details"/); assert.doesNotMatch(markup, /<details[^>]*\bopen\b/);
  assert.match(markup, /Technical details/); assert.match(markup, /&lt;script&gt;not executable&lt;\/script&gt;/); assert.doesNotMatch(markup, /<script>/);
  const fallback = renderToStaticMarkup(exports.ConversionError({ message: "Unknown <error>" }));
  assert.equal(fallback, '<p class="error" role="alert">Unknown &lt;error&gt;</p>');
});
test("both production error locations use the display component while raw state and real quota validation remain unchanged", async () => {
  const app = await readFile("app/converter/ConverterApp.tsx", "utf8"), driver = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.equal(app.split("<ConversionError message={error} />").length - 1, 2);
  assert.match(app, /setError\(message.message\)/);
  assert.match(driver, /validateRealOpfsQuotaFailure\(state/); assert.match(driver, /nativeMessage.textContent\(\), state.error/);
  assert.match(driver, /defaultCollapsed: true, expandCollapseVerified: true/);
  assert.match(driver, /getByTestId\("conversion-error-summary"\).count\(\), 0/);
  assert.match(driver, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
});
test("retained production UI proves friendly real-quota error, exact native details toggle and same-page full-quality recovery with unchanged whole-tree memory", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T14-16-54.324Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.executedHead, "195cafe8bc84ccd1bb71a8435988fbff9b4a772b");
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion");
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.sourcePins, 53);
  const packed = await readFile(receipt.archive.path); assert.equal(sha(packed), receipt.archive.sha256); assert.equal(packed.length, receipt.archive.bytes);
  const raw = gunzipSync(packed, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  assert.equal(raw.length, receipt.archive.restoredBytes);
  const report = JSON.parse(raw), [failure, recovery] = report.cases; assert.equal(report.cases.length, 2);
  assert.equal(report.nativeConversionUsed, false); assert.equal(report.headedCoverage, false); assert.equal(report.scalingAcceptance, false);
  assert.equal(failure.browserState.metrics.inputBytes, 1835008); assert.equal(failure.browserState.metrics.outputBytes, 1043199);
  assert.deepEqual(validateRealOpfsQuotaFailure(failure.browserState, { quota: failure.realBrowserQuota,
    storageBefore: failure.storageBefore, storageAfter: failure.storageAfter, faultParameterPresent: false }), failure.realQuotaFailureProof);
  assert.equal(presentConversionError(failure.browserState.error).nativeDetail, failure.browserState.error);
  assert.deepEqual(failure.realQuotaErrorPresentation, { summary: BROWSER_STORAGE_WRITE_ERROR_SUMMARY,
    rawStateUnchanged: true, nativeDetailExact: true, defaultCollapsed: true, expandCollapseVerified: true, summaryVisible: true });
  assert.deepEqual(receipt.cases[0].realQuotaErrorPresentation, failure.realQuotaErrorPresentation);
  assert.equal(failure.realQuotaErrorVisible, true); assert.equal(recovery.browserState.error, null);
  assert.equal(recovery.samePageRealQuotaRecovery.noStaleErrorOrWarning, true);
  assert.equal(recovery.samePageRealQuotaRecovery.noPageOrContextRecreation, true);
  assert.equal(recovery.realBrowserQuota.overrideActive, false); assert.equal(recovery.output.bytes, 17360);
  assert.equal(recovery.output.sha256, "fa99d5254cc40bb3d9dc1b8f2f745477f5c5828916b83b7ef7db64d1e1092d7f");
  assert.equal(recovery.output.tags.status, "passed"); assert.equal(recovery.output.tags.fields.length, 25);
  assert.equal(recovery.repeatedValues.length, 2); assert.equal(recovery.artwork.bytes, 178);
  assert.equal(recovery.artwork.sha256, "a2c9b09a676abe1df460620135bd1d889ddfb84de2f665b08c95374ec10564f0");
  assert.equal(recovery.artwork.description, "表紙 — Front cover"); assert.equal(recovery.artwork.independentImageDecode, true);
  assert.equal(recovery.fidelity.samples, 96000); assert.equal(recovery.fidelity.minimumPsnrDb, 60);
  assert.equal(recovery.fidelity.psnrDb, 66.16825969015325);
  assert.equal(receipt.realQuotaControl.defaultBrowserServicesChanged, false);
  assert.equal(receipt.realQuotaControl.restoredInFinally, true); assert.equal(receipt.realQuotaControl.final.overrideActive, false);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const samples = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(samples), receipt.losslessJournal.sha256);
  const history = samples.toString().trim().split("\n").map(line => JSON.parse(line).sample);
  assert.equal(history.length, 408); assert.equal(receipt.memory.validSamples, 408); assert.equal(receipt.memory.unavailableSamples, 0);
  const peak = Math.max(...history.filter(sample => sample.phase !== "blank" && sample.privateBytes !== null).map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(receipt.memory.incrementalPrivateMiB, 203.015625); assert.equal(receipt.memory.limitMiB, 250);
  assert.ok(report.processCleanup.length > 0 && report.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(report.screenshots.length, 2);
  for (const screen of report.screenshots) { assert.equal(screen.headedCoverage, false); assert.equal(sha(await readFile(screen.path)), screen.sha256); }
  assert.ok(report.cases.every(row => row.disposableOutputRemoved && row.failures.length === 0));
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true);
  assert.deepEqual(receipt.network.forbidden, []);
});
