// Private bitrate-only experiment; no public route or engine binary changes.
import assert from "node:assert/strict";
import { makeEncoderPlaneQualityBrowserRecipe, inspectQualityDiagnostic } from "./encoder-plane-quality-browser-recipe.mjs";

// Stringified into the private adapter: reads the native wire only AFTER open,
// and requires C's audit of the actual AVCodecContext to match that wire.
export function auditNativeBitrateConfiguration(encoder, expectedBitRate) {
  if (![2000000, 4000000].includes(expectedBitRate) || encoder.HEAPU8.byteLength !== 16777216)
    throw new Error("Invalid fixed-heap bitrate diagnostic");
  const pointer = encoder._within_split_encoder_config();
  if (!Number.isSafeInteger(pointer) || pointer <= 0 || pointer > 16777216 - 96)
    throw new Error("Invalid native configuration pointer");
  const view = new DataView(encoder.HEAPU8.buffer, pointer, 96);
  const words = Array.from({ length: 24 }, (_, index) => view.getUint32(index * 4, true));
  const nativeSettingsMatch = encoder._within_split_encoder_settings_match();
  if (nativeSettingsMatch !== 1 || words[0] !== 1 || words[1] !== 1920 || words[2] !== 804 ||
      words[3] !== 0 || words[8] !== expectedBitRate || words[9] !== 4 || words[10] !== 20 ||
      words[6] !== 24 || words[7] !== 1)
    throw new Error("Actual native settings differ from bitrate-only full-geometry control");
  return { words, nativeSettingsMatch, expectedBitRate, scope: "native-context-audit-not-memory-or-fidelity-acceptance" };
}

export function makeEncoderPlaneBitrateBrowserRecipe(sources, root, runtime, stamp, branch, build, bitRate) {
  assert.ok([2000000, 4000000].includes(bitRate));
  const old = makeEncoderPlaneQualityBrowserRecipe(sources, root, runtime, stamp, branch, build);
  const stageEdits = [
    ['    session = createMpeg2SplitSession({ encoder, isCancelled: options.withinBridge.cancelled });',
      `    const openNativeEncoder = encoder._within_split_encoder_open.bind(encoder);
    encoder._within_split_encoder_open = () => {
      const result = openNativeEncoder();
      if (result >= 0) console.debug("WITHIN_MPEG2_BITRATE_AUDIT "+JSON.stringify((${auditNativeBitrateConfiguration.toString()})(encoder,${bitRate})));
      return result;
    };
    session = createMpeg2SplitSession({ encoder, isCancelled: options.withinBridge.cancelled });`],
    ['      try { return await call(name,type,mapped.map(()=>"number"),mapped,settings); }',
      `      if (name !== "within_remux" || mapped.length !== 12 || mapped[0] !== 6 || mapped[8] !== 0 || mapped[9] !== 0 || mapped[10] !== 0 || mapped[11] !== 0)
        throw new Error("Bitrate experiment requires unchanged default geometry/FPS/quality and twelve native arguments");
      mapped[9] = ${bitRate};
      try { return await call(name,type,mapped.map(()=>"number"),mapped,settings); }`],
  ];
  const specEdits = [
    ['const root = ', `const bitrateAuditSamples: Array<Record<string, unknown>> = [];\nconst experimentBitRate = ${bitRate};\nconst root = `],
    ['  splitFinalSamples.length = 0;', '  splitFinalSamples.length = 0;\n  bitrateAuditSamples.length = 0;'],
    ['    const splitPrefix = "WITHIN_MPEG2_SPLIT_FINAL ";',
      '    const bitratePrefix = "WITHIN_MPEG2_BITRATE_AUDIT ";\n    if (text.startsWith(bitratePrefix) && text.length <= 2048 && bitrateAuditSamples.length < 2)\n      bitrateAuditSamples.push(JSON.parse(text.slice(bitratePrefix.length)));\n    const splitPrefix = "WITHIN_MPEG2_SPLIT_FINAL ";'],
    ['  for (const sample of splitFinalSamples) {',
      '  rows.push({ kind: "actual-native-bitrate-configuration", bitRate: experimentBitRate, samples: [...bitrateAuditSamples] });\n  for (const sample of splitFinalSamples) {'],
    ['    const before = await probe(source);',
      '    const sourceBytes = (await stat(source)).size;\n    expect(sourceBytes).toBeLessThan(16 * 1024 * 1024);\n    const sourceSha256 = createHash("sha256").update(await readFile(source)).digest("hex");\n    rows.push({ kind: "bitrate-input-before", bitRate: experimentBitRate, sourceBytes, sourceSha256 });\n    const before = await probe(source);'],
    ['      const after = await probe(output);',
      '      expect(bitrateAuditSamples).toHaveLength(1);\n      expect(bitrateAuditSamples[0].expectedBitRate).toBe(experimentBitRate);\n      expect(bitrateAuditSamples[0].nativeSettingsMatch).toBe(1);\n      const after = await probe(output);'],
    ['      } finally { await rm(output, { force: true }); }',
      '      } finally {\n        try {\n          const postBytes = (await stat(source)).size;\n          expect(postBytes).toBeLessThan(16 * 1024 * 1024);\n          const postSha256 = createHash("sha256").update(await readFile(source)).digest("hex");\n          rows.push({ kind: "bitrate-input-after", bitRate: experimentBitRate, sourceBytes: postBytes, sourceSha256: postSha256 });\n          expect(postBytes).toBe(sourceBytes); expect(postSha256).toBe(sourceSha256);\n        } finally { await rm(output, { force: true }); }\n      }'],
  ];
  const patch = (source, edits) => {
    let result = source;
    for (const [before, after] of edits) { assert.equal(result.split(before).length - 1, 1, before); result = result.replace(before, after); }
    let reversed = result;
    for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
    assert.equal(reversed, source); return result;
  };
  return { ...old, stage: patch(old.stage, stageEdits), spec: patch(old.spec, specEdits),
    stageEdits, bitrateSpecEdits: specEdits, experimentBitRate: bitRate, conversionSpeedAcceptance: false };
}

export function inspectBitrateDiagnostic(report, baseline, build, bitRate) {
  const quality = inspectQualityDiagnostic(report, baseline, build);
  const rows = kind => report.rows.filter(row => row.kind === kind);
  const before = rows("bitrate-input-before"), after = rows("bitrate-input-after");
  assert.equal(before.length, 1); assert.equal(after.length, 1);
  assert.equal(before[0].bitRate, bitRate); assert.equal(after[0].bitRate, bitRate);
  assert.ok(before[0].sourceBytes > 0 && before[0].sourceBytes < 16777216);
  assert.match(before[0].sourceSha256, /^[a-f0-9]{64}$/);
  for (const field of ["sourceBytes", "sourceSha256"]) assert.equal(after[0][field], before[0][field]);
  const audit = rows("actual-native-bitrate-configuration"); assert.equal(audit.length, 1);
  assert.equal(audit[0].bitRate, bitRate); assert.equal(audit[0].samples.length, 1);
  const settings = audit[0].samples[0];
  assert.equal(settings.nativeSettingsMatch, 1); assert.equal(settings.expectedBitRate, bitRate);
  assert.equal(settings.words.length, 24); assert.equal(settings.words[8], bitRate);
  assert.deepEqual(settings.words.slice(0, 4), [1, 1920, 804, 0]);
  assert.deepEqual(settings.words.slice(6, 8), [24, 1]); assert.deepEqual(settings.words.slice(9, 11), [4, 20]);
  const probe = rows("independent-pre-assertion-probes")[0];
  assert.ok(probe.metrics.peakQueuedBytes <= 524288);
  const inventory = report.rows.filter(row => "cleanupRemovedEntries" in row);
  assert.equal(inventory.length, 1); assert.deepEqual(inventory[0].cleanupRemovedEntries, []);
  return { ...quality, bitRate, input: { bytes: before[0].sourceBytes, sha256: before[0].sourceSha256 },
    nativeConfiguration: settings, outputBytes: probe.outputBytes, elapsedMs: probe.metrics.elapsedMs,
    controlledComparisonPending: true, conversionSpeedAcceptance: false };
}

export function compareBitrateDiagnostics(control, candidate) {
  assert.equal(control.bitRate, 2000000); assert.equal(candidate.bitRate, 4000000);
  assert.deepEqual(control.input, candidate.input, "Identical input bytes must be verified, not inferred from a seed");
  const candidateWords = [...candidate.nativeConfiguration.words]; candidateWords[8] = 2000000;
  assert.deepEqual(control.nativeConfiguration.words, candidateWords, "Only bitrate may differ in actual native settings");
  for (const analysis of [control, candidate]) {
    assert.equal(analysis.qualityThreshold, 0.98);
    assert.equal(analysis.publicAcceptance, false); assert.equal(analysis.completeChromiumMemoryAcceptance, false);
    assert.ok(Number.isFinite(analysis.elapsedMs) && analysis.elapsedMs > 0);
  }
  return { identicalInputBytesVerified: true, onlyNativeBitrateDiffers: true, input: control.input,
    control: { bitRate: control.bitRate, ssim: control.ordinalSsim, elapsedMs: control.elapsedMs, outputBytes: control.outputBytes, caseStatus: control.caseStatus },
    candidate: { bitRate: candidate.bitRate, ssim: candidate.ordinalSsim, elapsedMs: candidate.elapsedMs, outputBytes: candidate.outputBytes, caseStatus: candidate.caseStatus },
    elapsedRatioCandidateToControl: candidate.elapsedMs / control.elapsedMs,
    retainedForFullQualification: candidate.caseStatus === "passed" && candidate.ordinalSsim >= 0.98,
    speedImprovementProven: false, fullOriginalAcceptance: false, publicAcceptance: false };
}
