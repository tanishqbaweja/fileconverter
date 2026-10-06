import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recoverStaticFormatMatrixBaseline } from "../scripts/lib/static-format-matrix-recipe.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = JSON.parse(await read("evidence/ui-matrix-benchmark-2026-10-07.json"));
test("Production UI CPU benchmark preserves exact markup and does not claim a video-memory or conversion-speed fix", () => {
  assert.equal(proof.status, "passed-ui-cpu-benchmark-only"); assert.equal(proof.matrixCards, 405);
  assert.equal(proof.baseline.totalScriptMs, 131.277); assert.ok(Math.abs(proof.candidate.totalScriptMs - 56.065) < 1e-9);
  assert.ok(proof.scriptCpuReductionPercent > 57 && proof.scriptCpuReductionPercent < 58);
  assert.equal(proof.baseline.matrixMarkupSha256, proof.candidate.matrixMarkupSha256);
  assert.deepEqual(proof.baseline.rows.map(row => row.dom), proof.candidate.rows.map(row => row.dom));
  for (const name of ["domGrowthReduced", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance", "publicAcceptance", "nativeAllocationSamplingEnabled"]) assert.equal(proof[name], false);
});
test("UI benchmark evidence pins both executed sources, exact reversible baseline, cleanup and unchanged original", async () => {
  const sha = value => createHash("sha256").update(value).digest("hex");
  for (const run of [proof.baseline, proof.candidate]) {
    assert.equal(run.source.bytes, 2958573265); assert.equal(run.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
    for (const value of Object.values(run.cleanup)) assert.equal(value, true);
    for (const [file, digest] of Object.entries(run.sourcePins)) {
      const bytes = await read(file), historical = run.variant === "baseline" && file === "app/converter/ConverterApp.tsx" ? recoverStaticFormatMatrixBaseline(bytes.toString()) : bytes;
      assert.equal(sha(historical), digest, file);
    }
  }
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest, file);
});
