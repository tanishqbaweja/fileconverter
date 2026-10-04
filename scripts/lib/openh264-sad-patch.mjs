import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeSadReference, SAD_SOURCE_SHA256, SAD_SHAPES } from "./openh264-sad-reference.mjs";

export function verifySadProof(evidence, helper) {
  const report = evidence.report;
  assert.equal(evidence.run?.status, "completed", "Completed compiled SAD proof required");
  assert.equal(evidence.run?.conclusion, "success");
  assert.equal(report?.status, "passed-private-sad-proof-and-primitive-cost-only");
  assert.equal(report.totalCases, 529564);
  assert.deepEqual(report.cases, { exhaustiveUniformBytePairs: 262144, exhaustiveMixedSignBytePairs: 262144,
    singlePixelLaneAndRow: 1152, seededRandomIndependentStrideAndAlignment: 4096,
    zeroAndOverlappingNonnegativeStrides: 20, inputEndsExactlyAtWasmBoundary: 8 });
  assert.equal(report.upstream.sha256, SAD_SOURCE_SHA256);
  assert.equal(createHash("sha256").update(`${JSON.stringify(report, null, 2)}\n`).digest("hex"), evidence.reportSha256);
  const helperSha256 = createHash("sha256").update(helper).digest("hex");
  assert.equal(helperSha256, report.sourceHashes["media/ffmpeg/openh264-sad-simd.h"], "Only the actually proven SAD helper may be compiled");
  return { run: evidence.run.url, headSha: evidence.run.headSha, cases: report.totalCases,
    helperSha256, upstreamSourceSha256: SAD_SOURCE_SHA256, shapes: SAD_SHAPES };
}

export function patchSadSource(bytes) {
  makeSadReference(bytes); // Verify the complete original file before touching any body.
  let source = bytes.toString("utf8");
  for (const shape of SAD_SHAPES) {
    const start = source.indexOf(`int32_t WelsSampleSad${shape}_c (`);
    const opening = source.indexOf("{", start);
    let depth = 1, end = opening + 1;
    for (; end < source.length && depth; ++end) {
      if (source[end] === "{") ++depth;
      if (source[end] === "}") --depth;
    }
    assert.ok(start >= 0 && opening > start && depth === 0);
    const [width, height] = shape.split("x");
    const delegate = `{\n  return within_sad_simd<${width}, ${height}>(pSample1, iStride1, pSample2, iStride2);\n}`;
    source = source.slice(0, opening) + delegate + source.slice(end);
  }
  assert.equal((source.match(/return within_sad_simd</g) ?? []).length, 4);
  return source.replace('#include "sad_common.h"', '#include "sad_common.h"\n#include "openh264-sad-simd.h"');
}
