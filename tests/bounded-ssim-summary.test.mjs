import assert from "node:assert/strict";
import test from "node:test";
import { inspectSsimSummary, requireNumericSsim, SSIM_DIAGNOSTIC_LIMITS } from "../scripts/lib/bounded-ssim-summary.mjs";
const summary = token => `[Parsed_ssim_4 @ 0x123] SSIM Y:0.9 (10) U:1.0 (inf) V:1.0 (inf) All:${token} (12.3)\r\n`;
test("numeric score is retained before acceptance, including real low/zero/negative scores", () => {
  for (const score of [1, 0.981, 0.97, 0, -0.001]) {
    const diagnostic = inspectSsimSummary("Header All:0.99\n" + summary(String(score)));
    assert.equal(diagnostic.summaries, 1); assert.equal(requireNumericSsim(diagnostic), score);
    assert.equal(diagnostic.score >= 0.98, score >= 0.98); assert.match(diagnostic.stderrSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(requireNumericSsim(inspectSsimSummary(summary("9.81e-1"))), 0.981);
});
test("missing, NaN, infinite, malformed or ambiguous scores cannot become zero or acceptance", () => {
  for (const text of ["no summary", "All:0.99\n", summary("nan"), summary("inf"), summary("1garbage"), summary("2"), summary(".99") + summary(".98")]) {
    const diagnostic = inspectSsimSummary(text); assert.equal(diagnostic.score, null);
    assert.throws(() => requireNumericSsim(diagnostic));
  }
});
test("retain a bounded summary/hash, never the full stderr history", () => {
  const diagnostic = inspectSsimSummary("x".repeat(100000) + "\n" + summary("0.97"));
  assert.ok(Buffer.byteLength(diagnostic.summaryLine) <= SSIM_DIAGNOSTIC_LIMITS.summaryLineBytes);
  assert.ok(JSON.stringify(diagnostic).length < 1024); assert.equal(diagnostic.stderrBytes > 100000, true);
  const huge = inspectSsimSummary("SSIM " + "x".repeat(3000) + " All:0.99\n");
  assert.equal(huge.status, "oversized-summary"); assert.equal(huge.score, null);
});
