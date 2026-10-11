// Focused synthetic full-geometry quality diagnosis, not protected acceptance.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeEncoderPlaneTitleBrowserRecipe } from "./encoder-plane-title-browser-recipe.mjs";
import { requireNumericSsim } from "./bounded-ssim-summary.mjs";
export function makeEncoderPlaneQualityBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  const old = makeEncoderPlaneTitleBrowserRecipe(sources, root, runtime, stamp, branch, build);
  const parser = JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/bounded-ssim-summary.mjs")).href);
  const edits = [
    ['import { expect, test } from "@playwright/test";',
      `import { expect, test } from "@playwright/test";\nimport { inspectSsimSummary, requireNumericSsim } from ${parser};`],
    ['`testsrc2=size=320x240:rate=24:duration=${fixture.seconds}`',
      '`testsrc2=size=${fixture.name === "hevc" ? "1920x804" : "320x240"}:rate=24:duration=${fixture.seconds}${fixture.name === "hevc" ? ",noise=alls=4:allf=t+u:all_seed=20261011" : ""}`'],
    ['return Number(/All:([0-9.]+)/.exec(stderr)?.[1]);',
      'const diagnostic = inspectSsimSummary(stderr);\n  rows.push({ kind: "bounded-ssim-summary-before-assertion", ordinal, diagnostic });\n  return requireNumericSsim(diagnostic);'],
  ];
  let spec = old.spec;
  for (const [before, after] of edits) { assert.equal(spec.split(before).length - 1, 1, before); spec = spec.replace(before, after); }
  let reversed = spec; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, old.spec, "Only synthetic fixture geometry and pre-assertion validator diagnostics");
  const needle = '"testMatch":"candidate.spec.ts"'; assert.equal(old.config.split(needle).length - 1, 1);
  // Playwright's grep title includes the project/file prefix, not just test text.
  const config = old.config.replace(needle, needle + ',grep:/private split MPEG2 hevc to mp4 via direct:/');
  return { ...old, spec, config, qualityEdits: edits, syntheticGeometry: { width: 1920, height: 804, frames: 96 },
    originalProtectedInputNotSubstituted: true, completeChromiumMemoryAcceptance: false, fullOriginalAcceptance: false };
}

export function inspectQualityDiagnostic(report, _baseline, build) {
  assert.equal(report.manifest.artifacts["split-encoder.wasm"], build.encoderManifest.artifacts["split-encoder.wasm"]);
  const rows = kind => report.rows.filter(row => row.kind === kind);
  const probes = rows("independent-pre-assertion-probes"); assert.equal(probes.length, 1);
  const primary = probe => probe.streams.find(stream => stream.codec_type === "video" && !stream.disposition?.attached_pic);
  const input = primary(probes[0].sourceProbe), output = primary(probes[0].outputProbe);
  assert.equal(input.codec_name, "hevc"); assert.equal(output.codec_name, "mpeg2video");
  for (const stream of [input, output]) {
    assert.equal(stream.width, 1920); assert.equal(stream.height, 804); assert.equal(Number(stream.nb_read_frames), 96);
  }
  const summaries = rows("bounded-ssim-summary-before-assertion"); assert.equal(summaries.length, 2);
  assert.equal(summaries[0].ordinal, false); assert.equal(summaries[1].ordinal, true);
  const timestampAlignedSsim = requireNumericSsim(summaries[0].diagnostic), ordinalSsim = requireNumericSsim(summaries[1].diagnostic);
  const frames = rows("independent-frame-diagnostic"); assert.equal(frames.length, 1);
  assert.equal(frames[0].nativeFullDecodePassed, true); assert.equal(frames[0].ordinalSsim, ordinalSsim);
  assert.equal(rows("independent-presentation-timeline-passed").length, 1);
  const audio = rows("independent-decoded-audio"); assert.equal(audio.length, 1);
  assert.deepEqual(audio[0].sourceDecodedAudioHashes, audio[0].outputDecodedAudioHashes);
  const cases = report.rows.filter(row => !row.kind && row.container && ["passed", "failed"].includes(row.status));
  assert.equal(cases.length, 1);
  if (ordinalSsim < 0.98) {
    assert.equal(cases[0].status, "failed"); assert.ok(cases[0].error.includes("0.98"));
    assert.ok(cases[0].error.includes("toBeGreaterThanOrEqual"));
  } else assert.equal(cases[0].status, "passed");
  const m = probes[0].metrics; assert.equal(m.peakWasmMemoryBytes, 50331648);
  assert.ok(m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 524288 && m.peakPendingOperations <= 1);
  assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0);
  return { genuineSyntheticConversions: 1, caseStatus: cases[0].status, qualityThreshold: 0.98,
    ordinalSsim, timestampAlignedSsim, scoreParsedNotMissing: true, syntheticNoiseStrength: 4, syntheticNoiseSeed: 20261011,
    inputDimensions: [1920, 804], outputDimensions: [1920, 804], frames: 96,
    fullOriginalAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false,
    historicalFullScoreStillUnknown: true };
}
