// New alpha-coverage gate. Never substitutes for the original6M effects scene.
import assert from "node:assert/strict";
import { makeSvgSmallPremultipliedControl } from "./svg-premultiplied-qualification.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export const svgTransparentControlPin=Object.freeze({bytes:498,sha256:"7816a8613e93bb0a5587c7f2dd47321d2846d397751b7a00eef222b431e1d585",
  width:960,height:540,alphaCounts:{"0":129600,"64":64800,"128":129600,"191":64800,"255":129600},
  scope:"Integer-edge, nonoverlapping primary-color rectangles; no filtered-alpha or general SVG claim"});
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact transparent control anchor: "+before);return source.split(before).join(after);};
export function makeSvgStripTransparentControl(options){
  assert.equal(options.transparentSourceBytes.length,svgTransparentControlPin.bytes);
  assert.equal(sha(options.transparentSourceBytes),svgTransparentControlPin.sha256);
  const originalBody=options.controlTestBytes.toString();
  let body=replace(originalBody,'fixtures/images/test-pattern-effects.svg','fixtures/images/svg-strip-transparent.svg');
  body=replace(body,'expect(sourceBytes.length).toBe(11194);',`expect(sourceBytes.length).toBe(${svgTransparentControlPin.bytes});`);
  body=replace(body,'afebfa848cd052fcd656cfdda7605c6c191edf845087759ca3421cf44880981d',svgTransparentControlPin.sha256);
  body=replace(body,'small-full-vs-strip-control','svg-transparent-full-vs-strip-control',2);
  body=replace(body,'alphaExact:boolean;metrics:unknown','alphaExact:boolean;alphaCounts:Record<string,number>;allReferenceAlphaOpaque:boolean;metrics:unknown');
  body=replace(body,'        const rgbaSha256=createHash("sha256").update(decoded.stdout).digest("hex");',
    '        const rgbaSha256=createHash("sha256").update(decoded.stdout).digest("hex");\n'+
    '        const alphaBins=new Uint32Array(256);for(let at=3;at<decoded.stdout.length;at+=4)alphaBins[decoded.stdout[at]]++;\n'+
    '        const alphaCounts=Object.fromEntries([...alphaBins.entries()].filter(([_alpha,count])=>count>0).map(([alpha,count])=>[String(alpha),count]));');
  body=replace(body,'alphaExact:bands.alphaExact,metrics:',
    'alphaExact:bands.alphaExact,alphaCounts,allReferenceAlphaOpaque:bands.allReferenceAlphaOpaque,metrics:');
  body=replace(body,'expect(row.alphaExact).toBe(true);',
    'expect(row.alphaExact).toBe(true);expect(row.allReferenceAlphaOpaque).toBe(false);expect(row.alphaCounts).toEqual('+JSON.stringify(svgTransparentControlPin.alphaCounts)+');');
  body=replace(body,'        else expect(state?.metrics?.svgStripPilot?.completedRows).toBe(540);',
    '        else {expect(state?.metrics?.svgStripPilot?.completedRows).toBe(540);\n'+
    '          expect(state!.metrics.imageWorkingBytes).toBe(0);expect(state!.metrics.peakImageWorkingBytes).toBeGreaterThan(0);\n'+
    '          expect(state!.metrics.peakImageWorkingBytes).toBe(state!.metrics.svgStripPilot.peakExplicitBufferBytes);\n'+
    '          expect(state!.metrics.svgStripPilot.currentExplicitBufferBytes).toBe(0);expect(state!.metrics.svgStripPilot.png.currentExplicitBufferBytes).toBe(0);\n'+
    '        }');
  const base=makeSvgSmallPremultipliedControl({...options,controlTestBytes:Buffer.from(body)});
  const suite=replace(base.suite,'test("paired-svg-fidelity-control",','test("svg-transparent-fidelity-control",');
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,'"--grep", "paired-svg-fidelity-control",','"--grep", "svg-transparent-fidelity-control",');
  driver=replace(driver,'const repeat = "small-full-vs-strip-control";','const repeat = "svg-transparent-full-vs-strip-control";');
  driver=replace(driver,'report.sourcePremultipliedTransferCandidate = true;',
    'report.sourcePremultipliedTransferCandidate = true;\nreport.transparentFidelityControl = '+JSON.stringify(svgTransparentControlPin)+';');
  driver=replace(driver,'"scripts/lib/svg-premultiplied-qualification.mjs",',
    '"scripts/lib/svg-premultiplied-qualification.mjs", "scripts/lib/svg-strip-transparent-control.mjs", "fixtures/images/svg-strip-transparent.svg",');
  return {...base,suite,driver,proof:{...base.proof,suiteSha256:sha(suite),driverSha256:sha(driver),
    transparentFidelityControl:svgTransparentControlPin,originalSmallControlTemplateSha256:sha(options.controlTestBytes),
    alphaExactAndAll256BinsChecked:true,fullOriginal6MStressReplacement:false,filteredAlphaCoverage:false,publicPromotion:false}};
}
