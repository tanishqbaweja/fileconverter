// CSS/markup contract only. Browser memory savings require actual measurement.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("frequently changing progress has layout/paint isolation without size containment or hidden diagnostics", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const blocks = [...css.matchAll(/\.progress-panel\s*\{([^}]+)\}/g)]; assert.equal(blocks.length, 1);
  const rule = blocks[0][1]; assert.match(rule, /contain: layout paint;/);
  assert.doesNotMatch(rule, /(?:contain:.*\bsize\b|display:\s*none|visibility:|content-visibility|will-change|height:)/);
  const app = await readFile(new URL("../app/converter/ConverterApp.tsx", import.meta.url), "utf8");
  const start = app.indexOf('<div className="progress-panel" aria-live="polite">'), end = app.indexOf("{warnings.map", start);
  assert.ok(start > 0 && end > start); const section = app.slice(start, end);
  for (const label of ["Read", "Written", "Throughput", "Elapsed", "Estimated remaining", "Active engine", "Queued", "Peak Wasm", "Conversion workers", "Peak JS heap", "Incremental private"])
    assert.ok(section.includes(label));
  assert.doesNotMatch(section, /<button|<input|<select|<a\s/);
});
