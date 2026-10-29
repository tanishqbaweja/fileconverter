// Same source-built native bytes/UI/IO, new component inputs, unchanged gates.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeSvgStripFilteredAlphaControl } from "./svg-strip-filtered-alpha-control.mjs";
import { svgAlphaComponentVariants } from "./svg-alpha-component-variants.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace = (source, before, after, count = 1) => {
  assert.equal(source.split(before).length - 1, count, "Exact alpha component anchor: " + before.slice(0, 96));
  return source.split(before).join(after);
};
export function makeSvgAlphaComponentControl(options) {
  const base = makeSvgStripFilteredAlphaControl(options), variants = svgAlphaComponentVariants(options.filteredAlphaSourceBytes);
  const start = base.suite.indexOf('test("svg-filtered-alpha-fidelity-control",'); assert.ok(start > 0);
  const originalBody = base.suite.slice(start); let body = originalBody;
  body = replace(body, 'test("svg-filtered-alpha-fidelity-control",', 'test("svg-alpha-components-control",');
  body = replace(body, 'const sourcePath = path.join(projectRoot,"fixtures/images/svg-strip-filtered-alpha.svg");', 'const originalSourcePath = path.join(projectRoot,"fixtures/images/svg-strip-filtered-alpha.svg");');
  body = replace(body, 'const sourceBytes = await readFile(sourcePath);', 'const originalBytes = await readFile(originalSourcePath);');
  body = replace(body, 'sourceBytes.length', 'originalBytes.length'); body = replace(body, 'update(sourceBytes)', 'update(originalBytes)');
  body = replace(body, '  const referencePath=path.join(privateSvg.runtime,"small-fresh-reference.png");', '  const variants=' + JSON.stringify(variants) + ';');
  body = replace(body, 'mode:string;rgbaSha256:string;', 'component:string;sourcePin:unknown;referencePin:unknown;expectPartialAlpha:boolean;spatialAlpha:unknown;mode:string;rgbaSha256:string;');
  body = replace(body, '    const equal=results.length===2&&results[0].rgbaSha256===results[1].rgbaSha256;', '');
  body = replace(body, 'referencePin,results,exactFullVsStripRgbaEqual:equal,', 'results,componentsCollected:results.length,');
  body = replace(body, 'independentlyValidatedEffects:equal&&results.every', 'independentlyValidatedEffects:results.length===3&&results.every');
  body = replace(body, 'svg-filtered-alpha-full-vs-strip-control', 'svg-alpha-components-control', 2);
  body = replace(body, '  try{\n    await page.goto',
    '  try{\n    for(const component of variants){\n      const sourcePath=path.join(privateSvg.runtime,component.name+".svg"),referencePath=path.join(privateSvg.runtime,component.name+"-reference.png");\n' +
    '      const sourceBytes=Buffer.from(component.source);expect(sourceBytes.length).toBe(component.bytes);expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(component.sha256);\n' +
    '      await writeFile(sourcePath,sourceBytes,{flag:"wx"});\n      try{\n    await page.goto');
  body = replace(body, 'for(const mode of ["full","strip"])', 'for(const mode of ["full"])');
  body = replace(body, '"small-"+mode+".png"', 'component.name+".png"');
  body = replace(body, '["svg-strip-filtered-alpha.png"]', '[component.name+".png"]');
  body = replace(body, 'await transfer("svg-strip-filtered-alpha.png")', 'await transfer(component.name+".png")');
  const oldSummary = '        const bins=new Uint32Array(256),alphaDiagnostics={mismatchedPixels:0,maximumAbsoluteError:0,referenceTransparentPixels:0,referencePartialPixels:0};\n' +
    '        for(let at=3;at<decoded.stdout.length;at+=4){const actual=decoded.stdout[at],expected=referenceDecoded.stdout[at];bins[actual]++;\n' +
    '          if(expected===0)alphaDiagnostics.referenceTransparentPixels++;if(expected>0&&expected<255)alphaDiagnostics.referencePartialPixels++;\n' +
    '          if(actual!==expected)alphaDiagnostics.mismatchedPixels++;alphaDiagnostics.maximumAbsoluteError=Math.max(alphaDiagnostics.maximumAbsoluteError,Math.abs(actual-expected));}\n' +
    '        const alphaHistogram=[...bins];';
  body = replace(body, oldSummary,
    '        const spatialAlpha=summarizeSvgAlphaDifference({output:decoded.stdout,reference:referenceDecoded.stdout,width:960,height:540,samples:component.sampleCoordinates});\n' +
    '        expect(spatialAlpha.fixedSamples.length).toBe(64);expect(spatialAlpha.worstPixels.length).toBeLessThanOrEqual(12);\n' +
    '        const alphaDiagnostics={mismatchedPixels:spatialAlpha.mismatchedPixels,maximumAbsoluteError:spatialAlpha.maximumAbsoluteError,referenceTransparentPixels:spatialAlpha.referenceTransparentPixels,referencePartialPixels:spatialAlpha.referencePartialPixels};\n' +
    '        const alphaHistogram=spatialAlpha.outputHistogram;');
  body = replace(body, 'results.push({mode,rgbaSha256,', 'results.push({component:component.name,sourcePin:{bytes:component.bytes,sha256:component.sha256,changes:component.changes,hypothesis:component.hypothesis},referencePin,expectPartialAlpha:component.expectPartialAlpha,spatialAlpha,mode,rgbaSha256,');
  body = replace(body, 'await page.evaluate(async()=>{const root=await navigator.storage.getDirectory();await root.removeEntry("svg-strip-filtered-alpha.png").catch(()=>{});})',
    'await page.evaluate(async name=>{const root=await navigator.storage.getDirectory();await root.removeEntry(name).catch(()=>{});},component.name+".png")');
  body = replace(body, '    await save();expect(results.length).toBe(2);expect(results[0].rgbaSha256).toBe(results[1].rgbaSha256);',
    '      }finally{if(validationSink){validationSink.destroy();validationSink=null;}await rm(referencePath,{force:true});await rm(sourcePath,{force:true});}\n    }\n    await save();expect(results.length).toBe(3);');
  body = replace(body, 'expect(row.alphaDiagnostics.referencePartialPixels).toBeGreaterThan(0);',
    'if(row.expectPartialAlpha)expect(row.alphaDiagnostics.referencePartialPixels).toBeGreaterThan(0);else expect(row.alphaDiagnostics.referencePartialPixels).toBe(0);');
  body = replace(body, '}finally{await save();if(validationSink){validationSink.destroy();validationSink=null;}await rm(referencePath,{force:true});}',
    '}finally{await save();if(validationSink){validationSink.destroy();validationSink=null;}}');
  let suite = replace(base.suite, originalBody, body);
  suite = 'import { summarizeSvgAlphaDifference } from ' + JSON.stringify(pathToFileURL(path.join(options.root, "scripts/lib/svg-alpha-difference.mjs")).href) + ';\n' + suite;
  let driver = replace(base.driver, JSON.stringify(sha(base.suite)), JSON.stringify(sha(suite)));
  driver = replace(driver, '"--grep", "svg-filtered-alpha-fidelity-control",', '"--grep", "svg-alpha-components-control",');
  driver = replace(driver, 'const repeat = "svg-filtered-alpha-full-vs-strip-control";', 'const repeat = "svg-alpha-components-control";');
  const pins = variants.map(({ source, sampleCoordinates, ...pin }) => { void source; void sampleCoordinates; return pin; });
  driver = replace(driver, 'report.filteredAlphaFidelityControl = ', 'report.alphaComponentFidelityControl = ' + JSON.stringify({ diagnosticOnly: true, original6MStressReplaced: false, variants: pins }) + ';\nreport.filteredAlphaFidelityControl = ');
  driver = replace(driver, '"scripts/lib/svg-strip-filtered-alpha-control.mjs",', '"scripts/lib/svg-strip-filtered-alpha-control.mjs", "scripts/lib/svg-alpha-component-control.mjs", "scripts/lib/svg-alpha-component-variants.mjs", "scripts/lib/svg-alpha-difference.mjs",');
  driver = replace(driver, '"Small960x540 paired full-frame versus strip diagnostic through production UI/IO; never original6M stress acceptance"', '"Three additional alpha components through full-frame production UI/IO; no failed-pair replay or original6M acceptance"');
  driver = replace(driver, '"Small paired diagnostic including fresh reference and validation; never stress or release acceptance"', '"Additional alpha-component diagnostics with independent references; never stress or release acceptance"');
  return { ...base, suite, driver, proof: { ...base.proof, suiteSha256: sha(suite), driverSha256: sha(driver), controlTestSha256: sha(body),
    componentVariants: pins, fullFrameProductionWorkerOnly: true, bothModesSameNativeBytesAndProductionIo: false,
    maximumRetainedPixelSamplesPerVariant: 64, maximumRetainedWorstAlphaPixelsPerVariant: 12,
    originalAlphaGateRetained: true, fullOriginal6MStressReplacement: false, publicPromotion: false } };
}
