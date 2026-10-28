import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeSvgEffectsDiagnostic, svgEffectsMinimumSsim } from "../scripts/lib/svg-effects-diagnostic-recipe.mjs";
import { makeReproducedSvgDirectStressQualification } from "../scripts/lib/reproduced-svg-direct-stress-recipe.mjs";
import { buildHistoricalSvgEffectsSource,createSvgReferenceNetworkObservation } from "../scripts/lib/owned-svg-effects-fixture.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const options = { root, runtime: path.join(root, "work/svg-reproduced-qualification-aBc123"),
  driverBytes: await read("scripts/test-source-built-svg-candidate.mjs"), suiteBytes: await read("tests/browser/image-conversions.spec.ts"),
  generatorBytes: await read("scripts/generate-svg-stress-fixture.py") };
test("effects source is byte-identical to the historical6M input using its unchanged pinned builder; no Node rasterization", async () => {
  const generator = await read("scripts/generate-svg-effects-fixtures.mjs"), source = Buffer.from(buildHistoricalSvgEffectsSource(generator));
  assert.equal(source.length, 470390); assert.equal(sha(source), "af4df880bee340b34ec1102a78a78cce8d04915635ea2ee5a7aa0ffe04e4ca78");
  assert.equal([...source.toString().matchAll(/<\s*([A-Za-z_][\w:.-]*)\b/g)].length, 6719);
  assert.throws(() => buildHistoricalSvgEffectsSource(Buffer.concat([generator, Buffer.from("\n")])));
});
test("effects suite changes only explicit reversible source/reference/fidelity/evidence hooks and keeps native decoders/I/O assertions", () => {
  const original = makeReproducedSvgDirectStressQualification(options), effects = makeSvgEffectsDiagnostic(options);
  let restored = effects.suite;
  for (const [before, after] of [...effects.suiteEdits].reverse()) {
    assert.equal(restored.split(after).length - 1, 1); restored = restored.replace(after, before);
  }
  assert.equal(restored, original.suite);
  assert.equal(svgEffectsMinimumSsim, 0.99); assert.equal(effects.generator, undefined);
  assert.equal(effects.suite.match(/3000, 2000, 1_000, undefined,[^\r\n]+"rgb24", 0.99, "6m-effects-repeat-[123]"/g).length, 3);
  assert.doesNotMatch(effects.suite, /independentlyValidatedRgbaPixels: true/);
  assert.match(effects.suite, /exactPixelEqualityClaimed: false/); assert.match(effects.suite, /independentlyValidatedEffects: similarity >= minimumReferenceSsim/);
  assert.match(effects.suite, /expect\(similarity\).toBeGreaterThanOrEqual\(minimumReferenceSsim\)/);
  assert.match(effects.suite, /jobState !== "complete"/);
  assert.match(effects.suite, /await writeFile\(path.join\(privateSvg.runtime, stressRepeat \+ ".json"\), failure/);
  for (const [name, source] of [["effects.mjs", effects.driver], ["effects.ts", effects.suite]])
    assert.deepEqual(ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, true).parseDiagnostics, [], name);
});
test("effects owner keeps every process, stable early blank collection, null unknown baseline and strict final250MiB failure", () => {
  const effects = makeSvgEffectsDiagnostic(options), source = effects.driver;
  const gate = 'assert.equal(report.blankBaseline?.stable, true, "Do not delay/inflate the earliest stable blank baseline")';
  assert.equal(source.split(gate).length - 1, 1); assert.ok(source.indexOf(gate) > source.indexOf("report.functionalAssertionsPassed = true"));
  for (const text of ['baselineDeadline = baselineStarted + 30000', 'stableWindow(report.blankSamples)',
    'report.memory.incrementalPrivateMiB <= 250', 'screenshots: true, snapshots: !noDomSnapshotDiagnostic',
    '6m-effects-repeat-[123]', 'owned-identity-absent', 'row.result?.independentlyValidatedEffects === true']) assert.ok(source.includes(text), text);
  assert.match(source, /report.blankBaseline\?\.stable === true \? .* : null/);
  assert.doesNotMatch(source, /--disable-|--headed|ignoreDefaultArgs/);
});
test("reference fixture owner is hidden/normal-profile, chunk-backpressured, source-hash guarded and cleans only its birth-verified profile", async () => {
  const source = (await read("scripts/lib/owned-svg-effects-fixture.mjs")).toString();
  for (const anchor of ['"--headless=new"', 'windowsHide: true', 'values.length <= 65536', 'await window.__withinSvgReferenceChunk',
    'queryReliableProcessIdentity(child.pid), birth', '"owned-identity-absent"', 'await owned?.close()', 'finally { URL.revokeObjectURL(url)',
    'independentNativeDecodePassed = true', 'cleanupErrors.map']) assert.ok(source.includes(anchor), anchor);
  assert.doesNotMatch(source, /toDataURL|\.arrayBuffer\(|--disable-|recursive: true|ffmpeg.*-vf/);
});
test("reference network observer records bounded frame/worker/response/failure metadata even on failure and never claims requests were blocked",()=>{
  const forbidden=[],observer=createSvgReferenceNetworkObservation(forbidden);
  const request={url:()=>"https://docs.google.com/offline/extension/report?v=1.111.1&optin=unknown",method:()=>"POST",
    frame(){throw new Error("No frame for worker request");},serviceWorker:()=>({url:()=>"chrome-extension://synthetic-test/worker.js"}),
    resourceType:()=>"fetch",failure:()=>({errorText:"net::ERR_FAILED"}),postData(){assert.fail("Never read body");},allHeaders(){assert.fail("Never read headers");}};
  observer.observe(request);observer.response({request:()=>request,status:()=>200,fromServiceWorker:()=>false});observer.failed(request);
  assert.equal(forbidden.length,1);assert.equal(observer.report.requests[0].frameUrl,null);
  assert.match(observer.report.requests[0].serviceWorkerUrl,/chrome-extension:/);assert.equal(observer.report.requests[0].responseStatus,200);
  assert.equal(observer.report.requests[0].responseFromServiceWorker,false);
  assert.equal(observer.report.requests[0].failureText,"net::ERR_FAILED");assert.equal(observer.report.blockedBeforeDispatch,null);
  assert.equal(observer.report.interceptionInstalled,false);assert.equal(observer.report.requestBodiesOrHeadersRecorded,false);
  for(let i=0;i<100;i++)observer.observe({...request,url:()=>"https://example.invalid/"+"x".repeat(1000)});
  assert.equal(forbidden.length,32);assert.equal(observer.report.requests.length,32);assert.equal(observer.report.overflow,true);
  assert.equal(observer.report.observedHttpRequests,101);assert.ok(forbidden.every(row=>row.url.length<=512));
  observer.observe({...request,url:()=>"blob:synthetic"});assert.equal(observer.report.observedHttpRequests,101);
});
