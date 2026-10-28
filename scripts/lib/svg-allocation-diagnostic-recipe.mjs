import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeSvgEffectsDiagnostic } from "./svg-effects-diagnostic-recipe.mjs";
import probePin from "../../images/resvg-source/allocation-probe-input.json" with { type: "json" };
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace = (source,before,after) => { assert.equal(source.split(before).length-1,1,"Exact allocation probe anchor: "+before); return source.replace(before,after); };
export function makeSvgAllocationDiagnostic(options) {
  const base=makeSvgEffectsDiagnostic(options), moduleUrl=pathToFileURL(path.join(options.root,"images/resvg-source/allocation-probe.mjs")).href;
  const suiteEdits=[];
  let suite=`import { removeAllocationProbe } from ${JSON.stringify(moduleUrl)};\n`+base.suite;
  const editSuite=(before,after) => { suite=replace(suite,before,after); suiteEdits.push([before,after]); };
  editSuite('descriptor.sha256 !== pins.wasmSha256',`descriptor.sha256 !== ${JSON.stringify(probePin.instrumentedSha256)}`);
  editSuite('bytes.length !== pins.wasmBytes || createHash("sha256").update(bytes).digest("hex") !== pins.wasmSha256',
    `bytes.length !== ${probePin.instrumentedBytes} || createHash("sha256").update(bytes).digest("hex") !== ${JSON.stringify(probePin.instrumentedSha256)}`);
  editSuite('    privateSvg = descriptor;',
    '    const restored = removeAllocationProbe(bytes);\n    expect(createHash("sha256").update(restored).digest("hex")).toBe(pins.wasmSha256);\n    privateSvg = descriptor;');
  let driver=`import { addAllocationProbe } from ${JSON.stringify(moduleUrl)};\n`+base.driver;
  driver=replace(driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,'await writeFile(candidateFile, members[pins.wasmMember], { flag: "wx" });',
    'const probed = addAllocationProbe(members[pins.wasmMember]);\n' +
    `  assert.equal(probed.proof.instrumentedSha256, ${JSON.stringify(probePin.instrumentedSha256)});\n` +
    `  assert.equal(probed.bytes.length, ${probePin.instrumentedBytes});\n` +
    '  report.instrumentation = probed.proof; report.allocationProbeDiagnostic = true; report.memoryAcceptance = false;\n' +
    '  assert.deepEqual(definedWasmMemories(probed.bytes), report.wasmMemory);\n' +
    '  await writeFile(candidateFile, probed.bytes, { flag: "wx" });');
  driver=replace(driver,'candidateFile, sha256: pins.wasmSha256, endpoint',
    'candidateFile, sha256: report.instrumentation.instrumentedSha256, endpoint');
  driver=replace(driver,'"scripts/lib/memory-infra-attribution.mjs"];',
    '"scripts/lib/memory-infra-attribution.mjs", "images/resvg-source/allocation-probe.mjs", "images/resvg-source/allocation-probe-input.json", "scripts/lib/svg-allocation-diagnostic-recipe.mjs", "lib/vendor/resvg-binding.mjs"];');
  return { ...base, driver,suite,suiteEdits,proof:{...base.proof,driverSha256:sha(driver),suiteSha256:sha(suite),
    allocationProbeDiagnostic:true, privateInstrumentedPin:probePin, originalRenderBranchesAndMemoryCapUnchanged:true,
    countersOnlyNotConversionOptimization:true, memoryAcceptance:false, publicPromotion:false } };
}
