// Diagnostic only. Never replaces or relaxes the original6M stress test.
import assert from "node:assert/strict";
import { makeFilterLivenessSvgQualification } from "./svg-filter-liveness-qualification.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact small fidelity diagnostic anchor");return source.split(before).join(after);};
export function makeSvgSmallFidelityControl(options){
  assert.equal(options.workerPin.centralRows,128);
  const pairedTest=options.controlTestBytes.toString();
  assert.ok(Buffer.byteLength(pairedTest)<32768&&pairedTest.startsWith('test("paired-svg-fidelity-control",'));
  const base=makeFilterLivenessSvgQualification(options);
  let suite=replace(base.suite,'    await context.route("**/assets/conversion.worker-*.js", async route => {',
    '    await context.route("**/assets/conversion.worker-*.js", async route => {\n      if(!svgDiagnosticStripMode){await route.continue();return;}');
  suite="let svgDiagnosticStripMode=false;\n"+suite+"\n"+pairedTest;
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,'"--grep", "6m-effects-repeat-[123]",','"--grep", "paired-svg-fidelity-control",');
  driver=replace(driver,'assert.equal(report.stats.expected, 3);','assert.equal(report.stats.expected, 1);');
  driver=replace(driver,'for (const index of [1,2,3]) {','for (const index of [1]) {');
  driver=replace(driver,'const repeat = "6m-effects-repeat-" + index;','const repeat = "small-full-vs-strip-control"; void index;');
  driver=replace(driver,'  report.privateStripWorker = ', '  report.smallFidelityControl={diagnosticOnly:true,sourceWidth:960,sourceHeight:540,original6MStressReplaced:false};\n  report.privateStripWorker = ');
  driver=replace(driver,'"scripts/lib/svg-filter-liveness-qualification.mjs"];','"scripts/lib/svg-filter-liveness-qualification.mjs", "scripts/lib/svg-small-fidelity-control.mjs", "scripts/lib/svg-small-fidelity-test.txt", "fixtures/images/test-pattern-effects.svg", "fixtures/images/test-pattern-effects.svg.json"];');
  driver=replace(driver,'scope: "Three direct6M mask/filter-chain SVG conversions against independent current-Chromium references at SSIM0.99; final strict baseline/250 verdict retained, not full release acceptance"',
    'scope: "Small960x540 paired full-frame versus strip diagnostic through production UI/IO; never original6M stress acceptance"');
  driver=replace(driver,'scope: "Entire three-repeat6M direct effects suite including independent SSIM validation and cleanup; not full SVG/OOM acceptance"',
    'scope: "Small paired diagnostic including fresh reference and validation; never stress or release acceptance"');
  return{...base,suite,driver,proof:{...base.proof,suiteSha256:sha(suite),driverSha256:sha(driver),
    diagnosticOnly:true,fullOriginal6MStressReplacement:false,referenceWidth:960,referenceHeight:540,
    controlTestSha256:sha(options.controlTestBytes),bothModesSameNativeBytesAndProductionIo:true,
    scope:"Small paired diagnostic only; not original6M stress or release acceptance",
    allOriginalQualityAndMemoryGatesRetained:true,publicPromotion:false}};
}
