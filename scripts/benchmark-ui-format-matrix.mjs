import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeUiMatrixBenchmarkDriver } from "./lib/ui-matrix-benchmark-recipe.mjs";
import { recoverStaticFormatMatrixBaseline, UI_MATRIX_BASELINE_SHA256 } from "./lib/static-format-matrix-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
const app = await readFile(path.join(root, "app/converter/ConverterApp.tsx"), "utf8");
assert.equal(createHash("sha256").update(recoverStaticFormatMatrixBaseline(app)).digest("hex"), UI_MATRIX_BASELINE_SHA256);
if (process.env.WITHIN_UI_MATRIX_VARIANT === "baseline") assert.ok(!app.includes("const publishedFormatsSection = useMemo"));
else assert.ok(app.includes("const publishedFormatsSection = useMemo"));
const generated = makeUiMatrixBenchmarkDriver(source, root, specifier => import.meta.resolve(specifier));
const runtime = await createOwnedRuntimeScratch("ui-matrix-benchmark-driver-");
try {
  const file = path.join(runtime.directory, "benchmark.mjs"); await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
