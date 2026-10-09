// Extend the verified private UI test to genuine full completion, not a larger
// partial-output checkpoint. Codec/quality/heaps/primary budget remain identical.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { splitRenderNativeFacts } from "./split-render-progress-evidence.mjs";
export const FULL_CONVERSION_DEADLINE_MS = 6 * 60 * 60 * 1000;
export const fullProgressFiles = Object.freeze([
  "scripts/lib/progress-compositing-full-recipe.mjs", "tests/progress-compositing-full.test.mjs",
]);
const checkpointBlock = `      if (lastState?.jobState === "running" && (lastState.metrics?.outputBytes ?? 0) >= progressProbe.checkpointOutputBytes) {
        progressProbe.checkpointReached = true;
        progressProbe.beforeCancellation = lastState;
        assert.equal(conversionJs,null,"No hidden allocation profiler");
        progressProbe.performanceAfter = await domSession.send("Performance.getMetrics");
        progressProbe.cancellation = await cancelBrowserConversionBeforeCleanup(page);
        await takeSample("real-progress-checkpoint-after-cancel");
        progressProbe.afterCancellation = lastState; run.state = lastState;
        break;
      }
`;
export function makeProgressCompositingFullDriver(previous) {
  assert.equal(sha(previous.generated), previous.generatedSha256);
  const source = previous.generated, probeLine = source.match(/^const progressProbe = (.*);$/m);
  assert.ok(probeLine);
  const probe = JSON.parse(probeLine[1]);
  assert.equal(probe.mode, "progress-compositing-candidate");
  assert.equal(probe.maximumConversionMs, 300000); assert.equal(probe.checkpointOutputBytes, 67108864);
  assert.equal(probe.checkpointReached, false); assert.equal(probe.jsAllocationSamplingEnabled, false);
  assert.deepEqual(probe.expectedAsset, previous.expectedAsset);
  assert.deepEqual(probe.expectedStylesheet, previous.stylesheet);
  const fullProbe = { ...probe, mode: "progress-compositing-full-completion",
    maximumConversionMs: FULL_CONVERSION_DEADLINE_MS, checkpointOutputBytes: null,
    fullCompletionRequired: true, partialOutputStopEnabled: false };
  const scopeLine = source.match(/^    scope: (".*"),$/m); assert.ok(scopeLine);
  const patches = [
    [probeLine[0], `const progressProbe = ${JSON.stringify(fullProbe)};`],
    [checkpointBlock, "      // No partial-output cancellation: complete original source or fail the real gates.\n"],
    ["-private-mpeg2-progress-compositing-native-100ms", "-private-mpeg2-progress-compositing-full-native-100ms"],
    ['"mpeg2-progress-compositing-runtime-"', '"mpeg2-progress-compositing-full-runtime-"'],
    ["const sourceFiles = [", "const sourceFiles = [" + fullProgressFiles.map(file => JSON.stringify(file) + ",").join("")],
    [scopeLine[0], '    scope: "Private full-completion test with previously validated progress UI and original JS copy transport. FULL unchanged test.mkv/HEVC to MPEG2/default quality/fixed32+16MiB/ALL-process250MiB/same lower five-minute blank. Three genuinely completed independently validated repeats required; original six-hour deadline per conversion restored, no64MiB/300s partial stop. Qualified failure-only late-pool/allocator observer retained. No kernel stacking, sampling profiler, forced GC or native conversion. Any native budget/decoder/output/fidelity/cleanup failure stops the attempt without restart. Delayed budget dump is not peak allocation provenance; no public or fastest-speed acceptance.",'],
  ];
  let generated = source;
  for (const [before, after] of patches) {
    assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after);
  }
  let restored = generated;
  for (const [before, after] of patches.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, source, "Only short diagnostic stopping/labels/provenance changed; all full acceptance gates preserved");
  assert.ok(!generated.includes("outputBytes ?? 0) >= progressProbe.checkpointOutputBytes"));
  assert.ok(generated.includes('const diagnosticOnly = false;') && generated.includes('number <= 3'));
  assert.ok(generated.includes('assert.equal(run.state.jobState, "complete"'));
  return { ...previous, generated, generatedSha256: sha(generated), fullCompletionPatches: patches,
    previousPartialDriverSha256: previous.generatedSha256, fullCompletionRequired: true,
    maximumConversionMs: FULL_CONVERSION_DEADLINE_MS, checkpointOutputBytes: null };
}

export function fullProgressNativeFacts(raw) {
  const partialFacts = splitRenderNativeFacts(raw, "full-completion");
  // Include every repeat's simultaneous CIM snapshot as well as native100ms
  // peaks. Never sum per-process or per-run disjoint maxima.
  const cimPeaks = raw.runs.map(run => run.cimPeakPrivateBytes).filter(value => value !== null);
  assert.ok(cimPeaks.every(value => Number.isFinite(value) && value > 0));
  const actualPeakPrivateBytes = Math.max(partialFacts.actualPeakPrivateBytes, ...cimPeaks);
  const observedIncrementalPrivateMiB = (actualPeakPrivateBytes - raw.blankBaseline.privateBytes) / 1048576;
  return { ...partialFacts, actualPeakPrivateBytes, observedIncrementalPrivateMiB,
    primaryLimitExceededInObservedWindow: observedIncrementalPrivateMiB > 250,
    allRepeatCimPeaksIncluded: true, completedRuns: raw.runs.filter(run => run.state?.jobState === "complete" && run.independentValidation).length,
    completeChromiumMemoryAcceptance: false };
}
