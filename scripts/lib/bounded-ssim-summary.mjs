// Independent validator diagnostics only; never changes pixels or the 0.98 gate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const SSIM_DIAGNOSTIC_LIMITS = Object.freeze({ stderrBytes: 33554432, summaryLineBytes: 2048 });
export function inspectSsimSummary(stderr) {
  assert.equal(typeof stderr, "string");
  const stderrBytes = Buffer.byteLength(stderr);
  assert.ok(stderrBytes <= SSIM_DIAGNOSTIC_LIMITS.stderrBytes, "Native validator stderr exceeds its fixed cap");
  let position = 0, summaries = 0, line = null, token = null, oversized = false;
  while (position < stderr.length) {
    const newline = stderr.indexOf("\n", position), end = newline < 0 ? stderr.length : newline;
    const candidate = stderr.slice(position, end).replace(/\r$/, "");
    // Only the final FFmpeg filter summary, never per-frame stats or a stray All.
    const match = /^\s*(?:\[[^\]\r\n]{1,256}\]\s*)?SSIM\s+[^\r\n]*\bAll:([^\s()]+)/.exec(candidate);
    if (match) {
      summaries++;
      if (Buffer.byteLength(candidate) <= SSIM_DIAGNOSTIC_LIMITS.summaryLineBytes) { line = candidate; token = match[1]; }
      else oversized = true;
    }
    position = end + 1;
  }
  const numeric = token != null && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token) ? Number(token) : NaN;
  const status = summaries === 0 ? "missing-summary" : summaries !== 1 ? "ambiguous-summary" : oversized ? "oversized-summary" :
    !Number.isFinite(numeric) || numeric < -1 || numeric > 1 ? "invalid-score" : "numeric-summary";
  return { status, score: status === "numeric-summary" ? numeric : null, summaries, summaryLine: line,
    stderrBytes, stderrSha256: createHash("sha256").update(stderr).digest("hex"), limits: SSIM_DIAGNOSTIC_LIMITS };
}
export function requireNumericSsim(diagnostic) {
  assert.equal(diagnostic.status, "numeric-summary", "SSIM parser failed; do not label this a low-quality score");
  assert.ok(Number.isFinite(diagnostic.score)); return diagnostic.score;
}
