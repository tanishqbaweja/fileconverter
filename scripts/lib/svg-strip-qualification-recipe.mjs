import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeSvgEffectsDiagnostic } from "./svg-effects-diagnostic-recipe.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(text,before,after)=>{assert.equal(text.split(before).length-1,1,"Exact private strip qualifier anchor: "+before);return text.replace(before,after);};
export function makeSvgStripQualification(options) {
  const {root,runtime,workerPin}=options;
  const centralRows=workerPin.centralRows??64;assert.ok([64,80,128].includes(centralRows));
  assert.equal(workerPin.file,path.join(runtime,"private-svg-strip-worker.mjs"));
  assert.match(workerPin.sha256,/^[a-f0-9]{64}$/);assert.ok(workerPin.bytes>1000&&workerPin.bytes<=1048576);
  const base=makeSvgEffectsDiagnostic(options),edits=[];
  let suite=`import { validateSvgStripSeams } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/svg-strip-validator.mjs")).href)};\n`+base.suite;
  const edit=(before,after)=>{suite=replace(suite,before,after);edits.push([before,after]);};
  // Six lifecycle reads plus one actual read per native viewport. Require the
  // expected count from geometry, not merely whatever the worker reports.
  edit('observations: 6, unavailableObservations: 0, maximumBytes: null',
    `observations: 6 + Math.ceil(expectedHeight / ${centralRows}), unavailableObservations: 0, maximumBytes: null`);
  edit('        expect(state!.metrics.svgMemoryObservation!.peakBytes).toBeGreaterThan(0);',
    `        expect(state!.metrics.svgMemoryObservation!.peakBytes).toBeGreaterThan(0);\n`+
    `        expect(state!.metrics.svgStripPilot).toMatchObject({centralRows:${centralRows}, renderedViewports:Math.ceil(expectedHeight / ${centralRows}), releasedViewports:Math.ceil(expectedHeight / ${centralRows}), completedRows:expectedHeight});`);
  const route='    await context.route("**/engines/svg/resvg.wasm", route => route.fulfill({ contentType: "application/wasm", path: descriptor.candidateFile }));';
  edit(route,route+`\n    const stripWorkerFile = ${JSON.stringify(workerPin.file)};\n`+
    `    const stripWorkerBytes = await readFile(stripWorkerFile);\n`+
    `    expect(stripWorkerBytes.length).toBe(${workerPin.bytes});\n`+
    `    expect(createHash("sha256").update(stripWorkerBytes).digest("hex")).toBe(${JSON.stringify(workerPin.sha256)});\n`+
    `    await context.route("**/assets/conversion.worker-*.js", async route => {\n`+
    `      const response = await route.fetch();\n`+
    `      try {\n`+
    `        expect(response.status()).toBe(200);\n`+
    `        const headers = response.headers();\n`+
    `        expect(headers["cross-origin-embedder-policy"]).toBe("require-corp");\n`+
    `        expect(headers["cross-origin-opener-policy"]).toBe("same-origin");\n`+
    `        expect(headers["cross-origin-resource-policy"]).toBe("same-origin");\n`+
    `        expect(headers["content-security-policy"]).toContain("wasm-unsafe-eval");\n`+
    `        delete headers["content-encoding"]; delete headers["content-length"]; delete headers["etag"];\n`+
    `        headers["cache-control"] = "no-store";\n`+
    `        await route.fulfill({response,headers,contentType:"text/javascript",path:stripWorkerFile});\n`+
    `      } finally { await response.dispose(); }\n`+
    `    });`);
  edit('            const scalar = JSON.stringify({ repeat: stressRepeat, destinationMode: "direct-handle-test-directory",',
    `            const stripValidation = await validateSvgStripSeams({outputPath,referencePath,width:expectedWidth,height:expectedHeight,centralRows:${centralRows},additionalCentralRows:[64],execute:execFileAsync,cwd:projectRoot});\n`+
    '            const scalar = JSON.stringify({ repeat: stressRepeat, stripValidation, destinationMode: "direct-handle-test-directory",');
  const begin=suite.indexOf("for (const [\n  profileId,\n  sourceName,"),end=suite.indexOf('\n\ntest("GIF to JPEG XL preserves every frame',begin);
  assert.ok(begin>0&&end>begin);
  const body=suite.slice(begin,end);
  const pollStart='      await expect\n        .poll(',pollEnd='        .not.toBe("running");';
  let captured=replace(body,pollStart,'      try {\n'+pollStart);
  captured=replace(captured,pollEnd,pollEnd+'\n      } catch (primary) {\n'+
    '        if (stressRepeat && privateSvg) try {\n'+
    '          const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());\n'+
    '          const scalar = JSON.stringify({repeat:stressRepeat, independentlyValidatedEffects:false, metrics:state?.metrics??null, failure:{jobState:state?.jobState??null,phase:state?.phase??null,error:state?.error??null,pollTimeoutMs:45000}});\n'+
    '          if (Buffer.byteLength(scalar)<=65536) await writeFile(path.join(privateSvg.runtime,stressRepeat+".json"),scalar,{flag:"wx"});\n'+
    '        } catch { /* Capture failure must not replace the original timeout. */ }\n'+
    '        throw primary;\n      }');
  edit(body,captured);
  edit('independentlyValidatedEffects: similarity >= minimumReferenceSsim, exactPixelEqualityClaimed: false,',
    'independentlyValidatedEffects: similarity >= minimumReferenceSsim && stripValidation.passed, exactPixelEqualityClaimed: false,');
  edit('            await writeFile(path.join(privateSvg.runtime, stressRepeat + ".json"), scalar, { flag: "wx" });',
    '            await writeFile(path.join(privateSvg.runtime, stressRepeat + ".json"), scalar, { flag: "wx" });\n'+
    '            expect(stripValidation.minimumSsim).toBeGreaterThanOrEqual(0.99);\n            expect(stripValidation.alphaExact).toBe(true);');
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,'"scripts/lib/memory-infra-attribution.mjs"];',
    '"scripts/lib/memory-infra-attribution.mjs", "lib/private-svg-strip-pilot.ts", "workers/rgba-png-stream.ts", "scripts/lib/svg-strip-worker-recipe.mjs", "scripts/lib/svg-strip-qualification-recipe.mjs", "scripts/lib/svg-strip-validator.mjs"];');
  driver=replace(driver,"report.candidatePin = pins;","report.candidatePin = pins;\n  report.privateStripWorker = "+JSON.stringify(workerPin)+";");
  return {...base,driver,suite,suiteEdits:edits,proof:{...base.proof,driverSha256:sha(driver),suiteSha256:sha(suite),
    privateStripPilot:true,workerPin,centralRows,allOriginal64RowBoundariesAlsoValidated:true,additionalSeamAndAlphaGates:true,allExistingAssertionsRetained:true,
    generalViewportOrFilterSupport:false,publicPromotion:false}};
}
