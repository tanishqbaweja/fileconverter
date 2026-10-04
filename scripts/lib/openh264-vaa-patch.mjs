import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeVaaReference, VAA_SOURCE_SHA256 } from "./openh264-vaa-reference.mjs";

export function verifyVaaProof(evidence, helper) {
  const passed = evidence.attempts?.find((attempt) => attempt.run?.conclusion === "success");
  assert.equal(passed?.run.status, "completed", "Completed compiled arithmetic proof required");
  assert.equal(passed?.report.status, "passed-private-arithmetic-proof-only");
  assert.equal(passed.report.totalCases, 132101);
  assert.equal(passed.report.checkedQuadrants, 1090864);
  assert.equal(passed.report.upstream.sha256, VAA_SOURCE_SHA256);
  assert.equal(createHash("sha256").update(helper).digest("hex"),
    passed.report.sourceHashes["media/ffmpeg/openh264-vaa-simd.h"], "Only the actually proven SIMD helper may be compiled");
  return { run: passed.run.url, headSha: passed.run.headSha, cases: passed.report.totalCases,
    helperSha256: passed.report.sourceHashes["media/ffmpeg/openh264-vaa-simd.h"],
    upstreamSourceSha256: VAA_SOURCE_SHA256 };
}

export function patchVaaSource(bytes) {
  // This verifies the complete pinned source, not an approximate patch context.
  makeVaaReference(bytes);
  const source = bytes.toString("utf8");
  const start = source.indexOf("void VAACalcSadBgd_c (");
  const opening = source.indexOf("{", start);
  let depth = 1, end = opening + 1;
  for (; end < source.length && depth; ++end) {
    if (source[end] === "{") ++depth;
    if (source[end] === "}") --depth;
  }
  assert.equal(depth, 0);
  const delegate = "{\n  within_vaa_simd(pCurData, pRefData, iPicWidth, iPicHeight, iPicStride,\n                  pFrameSad, pSad8x8, pSd8x8, pMad8x8);\n}";
  const patched = source.slice(0, opening) + delegate + source.slice(end);
  assert.equal((patched.match(/within_vaa_simd\(/g) ?? []).length, 1);
  return patched.replace('#include "util.h"', '#include "util.h"\n#include "openh264-vaa-simd.h"');
}
