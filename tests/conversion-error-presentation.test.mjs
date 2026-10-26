import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { BROWSER_STORAGE_WRITE_ERROR_SUMMARY, STORAGE_ERROR_CLASSIFICATION_CHARACTERS, presentConversionError } from "../lib/conversion-error-presentation.ts";
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
