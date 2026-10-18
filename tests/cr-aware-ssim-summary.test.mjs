import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectSsimSummary as original } from "../scripts/lib/bounded-ssim-summary.mjs";
import { inspectSsimSummary, requireNumericSsim, crAwareSsimDerivation, SSIM_DIAGNOSTIC_LIMITS } from "../scripts/lib/cr-aware-ssim-summary.mjs";
const summary = value => `[Parsed_ssim_4 @ 0x123] SSIM Y:.99 (12) U:1 (inf) V:1 (inf) All:${value} (12)`;
test("only the record-delimiter scan changes; original scoring, ambiguity and byte caps are byte-exact", async () => {
  let restored = crAwareSsimDerivation.generated;
  for (const [before, after] of crAwareSsimDerivation.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, await readFile("scripts/lib/bounded-ssim-summary.mjs", "utf8"));
  assert.equal(crAwareSsimDerivation.edits.length, 1); assert.equal(SSIM_DIAGNOSTIC_LIMITS.stderrBytes, 33554432);
});
test("CR progress before the actual summary is parsed without changing raw bytes/hash or score", () => {
  for (const separator of ["\r", "\n", "\r\n"]) for (const score of [1, 0.989565, 0.98, 0.97, 0, -0.01]) {
    const text = "frame=300 fps=20" + separator + summary(score) + separator;
    const result = inspectSsimSummary(text); assert.equal(requireNumericSsim(result), score);
    assert.equal(result.stderrSha256, original(text).stderrSha256); assert.equal(result.stderrBytes, Buffer.byteLength(text));
    if (separator !== "\r") assert.deepEqual(result, original(text));
  }
});
test("missing, invalid, duplicate, oversized and real low scores remain failures or nonpassing quality", () => {
  for (const text of ["frame=1\rno summary", "All:0.99\r", summary("nan"), summary("inf"), summary("1garbage"),
    summary("2"), summary(".99") + "\r" + summary(".98"), "SSIM " + "x".repeat(3000) + " All:.99\r"])
    assert.throws(() => requireNumericSsim(inspectSsimSummary(text)));
  const low = requireNumericSsim(inspectSsimSummary("frame=1\r" + summary(".97"))); assert.ok(low < 0.98);
});
test("large bounded CR-only progress history is scanned without retaining it in diagnostics", () => {
  const result = inspectSsimSummary("frame=12345 fps=24\r".repeat(100000) + summary(".99"));
  assert.equal(result.score, 0.99); assert.ok(JSON.stringify(result).length < 1024);
});
