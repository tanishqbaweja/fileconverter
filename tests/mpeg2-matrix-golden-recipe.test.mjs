import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeMatrixGoldenSpec, makeMatrixGoldenDriver } from "../scripts/lib/mpeg2-matrix-golden-recipe.mjs";

test("matrix golden derivative preserves five genuine converters/validators and cleanup, adds headed CSS/UI only", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "tests/browser/mpeg2-split-direct-candidate.spec.ts"), "utf8");
  const hash = createHash("sha256").update(source).digest("hex");
  const generated = makeMatrixGoldenSpec(source, root, "2026-10-08T09-00-00-000Z-matrix-goldens", hash);
  const result = ts.transpileModule(generated, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } });
  assert.deepEqual(result.diagnostics, []);
  for (const unchanged of ['expect(beforeCancel.jobState).toBe("running")', 'expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1)',
    'expect(outputDecodedAudioHashes', 'validateSmallMatroskaMp4Timeline', 'await rm(work, { recursive: true, force: true })',
    'test.afterEach', 'Private MPEG2 memory must be fixed with growth disabled']) assert.ok(generated.includes(unchanged), unchanged);
  assert.ok(generated.includes('headless: false')); assert.ok(generated.includes('observeMatrixUi(page, "real-output-before-cancel", true)'));
  assert.throws(() => makeMatrixGoldenSpec(source + "\n", root, "2026-10-08T09-00-00-000Z-matrix-goldens", hash));
});

test("matrix driver keeps production staging, server, three minute timeout and finally restoration", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/validate-mpeg2-split-direct.mjs"), "utf8");
  const generated = makeMatrixGoldenDriver(source, root, path.join(root, "work/example/playwright.config.mjs"));
  assert.ok(generated.includes('180_000')); assert.ok(generated.includes('"scripts/stage-mpeg2-late-allocator-abort.mjs", "restore"'));
  assert.ok(generated.includes('finally { if (runtime) await runtime.close(); }'));
  assert.throws(() => makeMatrixGoldenDriver(source + "\n", root, "unused"));
});
