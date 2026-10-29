// Additional filtered-transparency coverage, never a replacement for original6M.
import assert from "node:assert/strict";
import { makeSvgSmallPremultipliedControl } from "./svg-premultiplied-qualification.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export const svgFilteredAlphaControlPin = Object.freeze({ bytes: 11125,
  sha256: "564e74d9e4abc8cc9f59b93d5db38f7d2e8a9fdcaf233c97bbf3f9dffe74290a", width: 960, height: 540,
  scope: "Original small effects scene with only its opaque background rectangle removed; same blur, offset, flood, composite, merge and mask" });
const replace = (source, before, after, count = 1) => {
  assert.equal(source.split(before).length - 1, count, "Exact filtered-alpha control anchor: " + before);
  return source.split(before).join(after);
};
export function makeSvgStripFilteredAlphaControl(options) {
  assert.equal(options.filteredAlphaSourceBytes.length, svgFilteredAlphaControlPin.bytes);
  assert.equal(sha(options.filteredAlphaSourceBytes), svgFilteredAlphaControlPin.sha256);
  let body = options.controlTestBytes.toString();
  body = replace(body, "fixtures/images/test-pattern-effects.svg", "fixtures/images/svg-strip-filtered-alpha.svg");
  body = replace(body, "test-pattern-effects.png", "svg-strip-filtered-alpha.png", 3);
  body = replace(body, "expect(sourceBytes.length).toBe(11194);", `expect(sourceBytes.length).toBe(${svgFilteredAlphaControlPin.bytes});`);
  body = replace(body, "afebfa848cd052fcd656cfdda7605c6c191edf845087759ca3421cf44880981d", svgFilteredAlphaControlPin.sha256);
  body = replace(body, "small-full-vs-strip-control", "svg-filtered-alpha-full-vs-strip-control", 2);
  body = replace(body, "alphaExact:boolean;metrics:unknown", "alphaExact:boolean;alphaHistogram:number[];alphaDiagnostics:{mismatchedPixels:number;maximumAbsoluteError:number;referenceTransparentPixels:number;referencePartialPixels:number};allReferenceAlphaOpaque:boolean;metrics:unknown");
  body = replace(body, '        const rgbaSha256=createHash("sha256").update(decoded.stdout).digest("hex");',
    '        const rgbaSha256=createHash("sha256").update(decoded.stdout).digest("hex");\n' +
    '        const referenceDecoded=await execFileAsync("ffmpeg",["-v","error","-threads","1","-i",referencePath,"-pix_fmt","rgba","-f","rawvideo","-"],{cwd:projectRoot,windowsHide:true,maxBuffer:960*540*4+65536,encoding:"buffer"});\n' +
    '        expect(referenceDecoded.stdout.length).toBe(960*540*4);\n' +
    '        const bins=new Uint32Array(256),alphaDiagnostics={mismatchedPixels:0,maximumAbsoluteError:0,referenceTransparentPixels:0,referencePartialPixels:0};\n' +
    '        for(let at=3;at<decoded.stdout.length;at+=4){const actual=decoded.stdout[at],expected=referenceDecoded.stdout[at];bins[actual]++;\n' +
    '          if(expected===0)alphaDiagnostics.referenceTransparentPixels++;if(expected>0&&expected<255)alphaDiagnostics.referencePartialPixels++;\n' +
    '          if(actual!==expected)alphaDiagnostics.mismatchedPixels++;alphaDiagnostics.maximumAbsoluteError=Math.max(alphaDiagnostics.maximumAbsoluteError,Math.abs(actual-expected));}\n' +
    '        const alphaHistogram=[...bins];');
  body = replace(body, "alphaExact:bands.alphaExact,metrics:",
    "alphaExact:bands.alphaExact,alphaHistogram,alphaDiagnostics,allReferenceAlphaOpaque:bands.allReferenceAlphaOpaque,metrics:");
  body = replace(body, "expect(row.alphaExact).toBe(true);",
    "expect(row.alphaExact).toBe(true);expect(row.allReferenceAlphaOpaque).toBe(false);expect(row.alphaDiagnostics.mismatchedPixels).toBe(0);" +
    "expect(row.alphaDiagnostics.referenceTransparentPixels).toBeGreaterThan(0);expect(row.alphaDiagnostics.referencePartialPixels).toBeGreaterThan(0);");
  body = replace(body, '        else expect(state?.metrics?.svgStripPilot?.completedRows).toBe(540);',
    '        else {expect(state?.metrics?.svgStripPilot?.completedRows).toBe(540);\n' +
    '          expect(state!.metrics.imageWorkingBytes).toBe(0);expect(state!.metrics.peakImageWorkingBytes).toBeGreaterThan(0);\n' +
    '          expect(state!.metrics.peakImageWorkingBytes).toBe(state!.metrics.svgStripPilot.peakExplicitBufferBytes);\n' +
    '          expect(state!.metrics.svgStripPilot.currentExplicitBufferBytes).toBe(0);expect(state!.metrics.svgStripPilot.png.currentExplicitBufferBytes).toBe(0);\n        }');
  const base = makeSvgSmallPremultipliedControl({ ...options, controlTestBytes: Buffer.from(body) });
  const suite = replace(base.suite, 'test("paired-svg-fidelity-control",', 'test("svg-filtered-alpha-fidelity-control",');
  let driver = replace(base.driver, JSON.stringify(sha(base.suite)), JSON.stringify(sha(suite)));
  driver = replace(driver, '"--grep", "paired-svg-fidelity-control",', '"--grep", "svg-filtered-alpha-fidelity-control",');
  driver = replace(driver, 'const repeat = "small-full-vs-strip-control";', 'const repeat = "svg-filtered-alpha-full-vs-strip-control";');
  driver = replace(driver, 'report.sourcePremultipliedTransferCandidate = true;',
    'report.sourcePremultipliedTransferCandidate = true;\nreport.filteredAlphaFidelityControl = ' + JSON.stringify(svgFilteredAlphaControlPin) + ';');
  driver = replace(driver, '"scripts/lib/svg-premultiplied-qualification.mjs",',
    '"scripts/lib/svg-premultiplied-qualification.mjs", "scripts/lib/svg-strip-filtered-alpha-control.mjs", "fixtures/images/svg-strip-filtered-alpha.svg",');
  return { ...base, suite, driver, proof: { ...base.proof, suiteSha256: sha(suite), driverSha256: sha(driver),
    filteredAlphaFidelityControl: svgFilteredAlphaControlPin, originalSmallControlTemplateSha256: sha(options.controlTestBytes),
    strictExactAlphaAndAllBandGatesRetained: true, filteredAlphaSupportProven: false, fullOriginal6MStressReplacement: false, publicPromotion: false } };
}
