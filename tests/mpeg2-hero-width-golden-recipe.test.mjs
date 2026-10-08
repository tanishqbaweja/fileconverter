import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeHeroWidthGoldenSpec, makeHeroWidthGoldenDriver } from "../scripts/lib/mpeg2-hero-width-golden-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");

test("hero-width headed goldens retain genuine codec/quality/recovery assertions and full rendered UI", async () => {
  const source = await readFile(path.join(root, "tests/browser/mpeg2-split-direct-candidate.spec.ts"), "utf8");
  const generated = makeHeroWidthGoldenSpec(source, root, "2026-10-08T11-50-00-000Z-matrix-goldens", sha(source));
  assert.ok(generated.includes('.hero-copy{flex:0 1 auto'));
  assert.ok(generated.includes('".hero", ".hero-copy", ".converter-card"'));
  for (const token of ['headless: false', 'value.matrixCards).toBe(405)', 'value.rows.length).toBeLessThan(32)',
    'uiScreenshotNumber).toBeLessThan(8)', 'real-output-before-cancel', 'terminal-after-cleanup']) assert.ok(generated.includes(token), token);
  assert.equal((generated.match(/test\(/g) ?? []).length, (source.match(/test\(/g) ?? []).length);
  assert.throws(() => makeHeroWidthGoldenSpec(source + "\n", root, "2026-10-08T11-50-00-000Z-matrix-goldens", sha(source)));
});

test("hero-width golden driver keeps actual normal32MiB decoder, original tests and owned cleanup", async () => {
  const source = await readFile(path.join(root, "scripts/validate-mpeg2-split-direct.mjs"), "utf8");
  const generated = makeHeroWidthGoldenDriver(source, root, "H:/owned/playwright.config.mjs");
  assert.ok(generated.includes('mpeg2-split-pipeline-37739125738'));
  assert.ok(generated.includes('scripts/stage-mpeg2-late-allocator-abort.mjs'));
  assert.ok(generated.includes('await finishOwnedCleanup([() => stop(runner), () => stop(server)])'));
  assert.throws(() => makeHeroWidthGoldenDriver(source + "\n", root, "H:/owned/playwright.config.mjs"));
});
