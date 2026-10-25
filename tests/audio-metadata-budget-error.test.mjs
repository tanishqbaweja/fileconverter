import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const source = await readFile("lib/audio-metadata-budget-error.ts", "utf8"), exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, Set });
const explain = exports.explainAudioMetadataBudgetError;

test("only the two metadata-construction ENOSPC sites get an accurate budget explanation while preserving native detail", () => {
  for (const native of ["Bounded Ogg stream metadata copy failed: No space left on device", "Bounded Ogg cover serialization failed: No space left on device"]) {
    const result = explain(native); assert.match(result, /tags and cover exceed a bounded metadata limit/);
    assert.match(result, /4096 total fields, 2 MiB text, or 4095 bytes/); assert.ok(result.endsWith(native));
    assert.ok(explain("Other native detail | " + native).endsWith("Other native detail | " + native));
  }
});

test("real output/quota/permission/allocation failures are never falsely explained as metadata rejection", () => {
  for (const native of ["The destination rejected a bounded write.", "No space left on device", "Permission denied",
    "Bounded Ogg cover serialization failed: Cannot allocate memory", "Audio header write failed: No space left on device", "FFmpeg remux failed with code -12"])
    assert.equal(explain(native), native);
});

test("worker adds explanation only to actual nonzero native result without altering IO, success, memory or codec paths", async () => {
  const worker = await readFile("workers/media-remux.ts", "utf8");
  assert.match(worker, /if \(result !== 0\) \{\s*throw new Error\(\s*explainAudioMetadataBudgetError/);
  assert.match(worker, /explainAudioMetadataBudgetError\(engineErrors.join\(" \| "\)/);
  assert.doesNotMatch(source, /fetch\(|postMessage|nativeInput|wasmMemory|audioOptions|writeSync/);
});
