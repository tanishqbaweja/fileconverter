// One explicitly perturbed allocation experiment, never an acceptance rerun.
import assert from "node:assert/strict";
import { makeSvgBlurBoundaryAlphaControl } from "./svg-blur-boundary-qualification.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export function assertBoundaryAllocationNotCompleted(ledger, wasmSha256) {
  assert.match(wasmSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(ledger.completedBlurBoundaryAllocationDiagnostic?.nativeWasmSha256, wasmSha256,
    "This exact allocation diagnostic is already complete; inspect " + ledger.completedBlurBoundaryAllocationDiagnostic?.evidence);
}
export function makeSvgBlurBoundaryAllocationDiagnostic(options) {
  const base = makeSvgBlurBoundaryAlphaControl(options);
  const replace = (source, before, after) => { assert.equal(source.split(before).length - 1, 1, "Exact allocation diagnostic anchor: " + before); return source.replace(before, after); };
  let driver = replace(base.driver, '  }, 12000);', '  }, 5000);');
  const post = '  if (allocationDiagnostic) {\n' +
    '    observer.setPhase("post-suite-diagnostic"); await allocatorPending; await captureAllocators("post-suite");\n' +
    '    assert.deepEqual(report.allocatorErrors, []); assert.equal(report.allocatorCaptures.length, 3);\n' +
    '  }\n';
  driver = replace(driver, post, "");
  driver = replace(driver, '  assert.equal(report.runnerSignal, null); assert.equal(report.runnerExitCode, 0, runnerLog);',
    post + '  assert.equal(report.runnerSignal, null); assert.equal(report.runnerExitCode, 0, runnerLog);');
  driver = replace(driver, 'report.sourceBlurBoundaryCandidate = true;', 'report.sourceBlurBoundaryCandidate = true;\nreport.boundaryAllocationDiagnosticOnly=true;\nassert.equal(allocationDiagnostic,true);');
  driver = replace(driver, '"scripts/lib/svg-blur-boundary-qualification.mjs",', '"scripts/lib/svg-blur-boundary-qualification.mjs", "scripts/lib/svg-blur-boundary-allocation-recipe.mjs", "evidence/2026-10-29-svg-blur-boundary-allocation-plan.json",');
  return { ...base, driver, proof: { ...base.proof, driverSha256: sha(driver), allocationDiagnosticOnly: true,
    allExistingQualityAndMemoryAssertionsRetained: true, postFailureAllocatorCaptureRequired: true,
    scheduledMidRunCaptureMs: 5000, captureCount: 3, specificRasterizationActiveAtScheduledDumpAssumed: false,
    perturbsMemory: true, acceptanceMetric: false, fixturesOrNativeBytesChanged: false, publicPromotion: false } };
}
