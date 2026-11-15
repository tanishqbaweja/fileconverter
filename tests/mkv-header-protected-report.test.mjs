import assert from "node:assert/strict";
import test from "node:test";
import { headerProtectedVideoEvidenceText, renderHeaderProtectedReport } from "../scripts/lib/mkv-header-protected-report.mjs";
import { mkvProtectedCopy } from "../scripts/lib/mkv-protected-copy-contract.mjs";

test("unit-only video-label mapping distinguishes fresh, inherited, unavailable and malformed claims; does not create conversion evidence", () => {
  const fresh = { candidateGate: { passed: true }, fullVideoDecode: true, completeVideo: {
    status: "passed-complete-independent-video-decode", decodedFrames: 296160, duplicateFrames: 0, droppedFrames: 0,
    decodedFileCreated: false, nativeToolUsedForConversion: false,
  } };
  assert.match(headerProtectedVideoEvidenceText(fresh), /^Fresh complete independent/);
  const inherited = { candidateGate: { passed: true }, fullVideoDecode: false, fullVideoDecodeInheritedThroughWholeOutputIdentity: true,
    outputSha256: "a".repeat(64), independentValidation: { outputSha256: "a".repeat(64), fullDecodedVideoFrames: 296160 } };
  assert.match(headerProtectedVideoEvidenceText(inherited), /not a new native decode/);
  assert.equal(headerProtectedVideoEvidenceText({}), "Complete video validation is unverified.");
  for (const change of [v => { v.completeVideo.decodedFrames--; }, v => { v.completeVideo.droppedFrames = 1; },
    v => { v.completeVideo.decodedFileCreated = true; }, v => { v.candidateGate.passed = false; }]) {
    const copy = structuredClone(fresh); change(copy); assert.equal(headerProtectedVideoEvidenceText(copy), "Complete video validation is unverified.");
  }
  inherited.outputSha256 = "b".repeat(64); assert.equal(headerProtectedVideoEvidenceText(inherited), "Complete video validation is unverified.");
});

test("synthetic diagnostic rendering UNIT ONLY retains missing samples as unavailable and checks same-blank/process sums without claiming acceptance", () => {
  const mib = 1048576, report = { hevcHeaderProtectedCandidate: true, nativeConversionUsed: false, headed: false, status: "failed-not-acceptance",
    originalBefore: { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 }, arms: [{
      blank: { privateBytes: 100 * mib }, memory: { start: 1000, end: 2000, validSamples: 2, unavailableSamples: 1, incrementalPrivateMiB: 250 },
      cases: [{ state: "error", metrics: { outputBytes: 0, elapsedMs: 100 }, validation: {} }],
    }] };
  const sample = (sequence, time, privateMiB) => ({ sequence, timestamp: new Date(time).toISOString(), sampleError: privateMiB === null ? "unit-unavailable" : null,
    privateBytes: privateMiB === null ? null : privateMiB * mib, rssBytes: privateMiB === null ? null : 500 * mib,
    processes: privateMiB === null ? null : [{ pid: 1, privateBytes: privateMiB * mib }] });
  const samples = [sample(0, 500, 90), sample(1, 1000, 350), sample(2, 1500, null), sample(3, 2000, 340)];
  const result = renderHeaderProtectedReport(report, samples);
  assert.match(result.csv, /false,true,unavailable,unavailable,unavailable,unavailable/);
  assert.match(result.html, /failed-not-acceptance/); assert.match(result.html, /Complete video validation is unverified/);
  assert.doesNotMatch(result.html, /<script|https?:\/\//); assert.match(result.html, /outside conversion/);
  const wrong = structuredClone(report); wrong.arms[0].memory.incrementalPrivateMiB--;
  assert.throws(() => renderHeaderProtectedReport(wrong, samples));
  const corrupt = structuredClone(samples); corrupt[1].processes[0].privateBytes--;
  assert.throws(() => renderHeaderProtectedReport(report, corrupt));
  assert.throws(() => renderHeaderProtectedReport({ ...report, hevcHeaderProtectedCandidate: false }, samples));
});
