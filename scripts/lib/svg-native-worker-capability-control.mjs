import assert from "node:assert/strict";
import { makeSvgSmallFidelityControl } from "./svg-small-fidelity-control.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact worker capability diagnostic anchor");return source.split(before).join(after);};
export function makeSvgNativeWorkerCapabilityControl(options){
  const base=makeSvgSmallFidelityControl(options),body=options.controlTestBytes.toString(),probe=options.capabilityTestBytes.toString();
  assert.ok(probe.startsWith('test("svg-native-worker-capability-control",')&&Buffer.byteLength(probe)<16384);
  const suite=replace(base.suite,body,probe);
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,'"--grep", "paired-svg-fidelity-control",','"--grep", "svg-native-worker-capability-control",');
  driver=replace(driver,'const repeat = "small-full-vs-strip-control";','const repeat = "native-svg-worker-capability-control";');
  driver=replace(driver,'row.result?.independentlyValidatedEffects === true','row.result?.nativeWorkerCapabilityProbeCompleted === true');
  driver=replace(driver,'report.smallFidelityControl={diagnosticOnly:true,sourceWidth:960,sourceHeight:540,original6MStressReplaced:false};',
    'report.nativeWorkerCapabilityControl={diagnosticOnly:true,sourcePixels:4,conversionProfileTested:false};');
  driver=replace(driver,'assert.ok(wasmRequests > 0);','assert.equal(wasmRequests, 0, "No converter engine is requested in an API-only probe");');
  driver=replace(driver,'"Small960x540 paired full-frame versus strip diagnostic through production UI/IO; never original6M stress acceptance"',
    '"Fixed4pixel worker API capability probe only; no user files or production conversion profile tested"');
  driver=replace(driver,'"Small paired diagnostic including fresh reference and validation; never stress or release acceptance"',
    '"Worker API probe including loaded site; not conversion memory or release acceptance"');
  driver=replace(driver,'"fixtures/images/test-pattern-effects.svg.json"];',
    '"fixtures/images/test-pattern-effects.svg.json", "scripts/lib/svg-native-worker-capability-control.mjs", "scripts/lib/svg-native-worker-test.txt", "scripts/lib/svg-native-worker-probe.txt"];');
  return{...base,suite,driver,proof:{...base.proof,suiteSha256:sha(suite),driverSha256:sha(driver),
    scope:"Four-pixel worker API availability/correct-color probe only",
    browserWorkerApiProbeOnly:true,bothModesSameNativeBytesAndProductionIo:false,
    referenceWidth:2,referenceHeight:2,controlTestSha256:sha(options.capabilityTestBytes),
    allOriginalQualityAndMemoryGatesRetained:false,originalConversionGatesNotExercisedOrChanged:true,
    productionConversionProfileTested:false,publicPromotion:false}};
}
