// Reversible transport-only derivation from actual packed-token browser sources.
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
const sha=s=>createHash("sha256").update(s).digest("hex");
export function makeVp9HttpSource(source,root,runId,kind="qualification",{boundedTrace=false}={}) {
  assert.ok(path.isAbsolute(root));assert.match(runId,/^\d{8,14}$/);assert.ok(["qualification","original"].includes(kind));
  assert.equal(typeof boundedTrace,"boolean");
  const parentSha256=sha(source),edits=[],add=(before,after)=>{assert.equal(source.split(before).length,2,before.slice(0,160));source=source.replace(before,after);edits.push([before,after]);},
    old=kind==="qualification"?"2026-11-06-vp9-token-packed-qualification-"+runId:"2026-11-06-vp9-original-cpu-startup-attempt8",
    next=kind==="qualification"?"2026-11-06-vp9-token-packed-http-qualification-"+runId+(boundedTrace?"-attempt2":""):"2026-11-06-vp9-original-cpu-startup-attempt9";
  for(const suffix of [".json","-failure.zip"])add(old+suffix,next+suffix);
  add('import { loadVp9DurationCpuAssets, createVp9DurationAssetResponder } from ',
    'import {createVp9HttpAssets} from '+JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/vp9-http-assets.mjs")).href)+';\nimport { loadVp9DurationCpuAssets } from ');
  add('let runtime, server, chrome, browser, observer,','let httpAssets;\nlet runtime, server, chrome, browser, observer,');
  add('"scripts/lib/vp9-duration-browser-assets.mjs",','"scripts/lib/vp9-duration-browser-assets.mjs", "scripts/lib/vp9-http-assets.mjs", "scripts/lib/vp9-http-recipe.mjs",');
  const load='  const privateCpuAssets = await loadVp9DurationCpuAssets(root, '+JSON.stringify(runId)+', "original-width");';
  add('  const lease = createServer();',load+'\n  httpAssets=await createVp9HttpAssets(root,privateCpuAssets);report.privateCpuOverride=httpAssets.report();\n'+
    '  report.normalHttpEngineDelivery=true;\n  const lease = createServer();');
  add('  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);',
    '  await httpAssets.preflight(origin);\n  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);');
  add(load+'\n  const privateCpuResponder = createVp9DurationAssetResponder(origin, privateCpuAssets);\n  report.privateCpuOverride = privateCpuResponder.report(); report.privateAssetErrorCount = 0;',
    '  httpAssets.attach(context);report.privateAssetErrorCount=0;');
  add('try { if (!await privateCpuResponder.respond(route)) await route.continue(); }','try { if (!await httpAssets.respond(route)) await route.continue(); }');
  if(boundedTrace) {
    add('await context.tracing.start({ screenshots: true, snapshots: true }); tracing = true;',
      'await context.tracing.start({ screenshots: true, snapshots: false }); tracing = true;\n'+
      '  report.traceDiagnosticMode={apiTimeline:true,screenshotTimeline:true,domSnapshots:false,networkResponseBodies:false,networkMetadataMaximum:32};\n'+
      '  report.networkMetadata=[];');
    add('    const request = route.request(), url = new URL(request.url());',
      '    const request = route.request(), url = new URL(request.url());\n'+
      '    if(report.networkMetadata.length===32)report.networkMetadata.shift();\n'+
      '    report.networkMetadata.push({timestamp:new Date().toISOString(),method:request.method(),origin:url.origin,path:url.pathname});');
    add('      } else await context.tracing.stop();',
      '      } else {\n'+
      '        const trace=path.join(root,"output/playwright/'+next+'-bounded-trace.zip");\n'+
      '        await mkdir(path.dirname(trace),{recursive:true});await context.tracing.stop({path:trace});\n'+
      '        report.boundedDiagnosticTrace={path:path.relative(root,trace),bytes:(await stat(trace)).size,sha256:await hashFile(trace)};\n'+
      '      }');
  }
  for(const count of (kind==="qualification"?[1,6]:[1])) {
    const check='  assert.deepEqual(report.privateCpuOverride.served, { javascript: '+count+', wasm: '+count+' });';
    add(check,'  await httpAssets.through();\n'+check);
  }
  const after='  for (const birth of [chromeBirth, serverBirth, observerBirth].filter(Boolean)) report.processCleanup.push(await observeOwnedProcessExit(birth));';
  add(after,after+'\n  try {assert.ok(report.processCleanup.every(x=>x.status==="owned-identity-absent"));await httpAssets?.close();}\n'+
    '  catch(error){report.failures.push("Owned HTTP engine-stage cleanup: "+String(error).slice(0,1024));}');
  let reverse=source;for(const [before,after]of edits.toReversed()){assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);}assert.equal(sha(reverse),parentSha256);
  return {generated:source,generatedSha256:sha(source),parentSha256,edits,reversible:true,kind,nativeRunId:runId,boundedTrace,
    changesNativeBytes:false,changesInputOrEncodingSettings:false,changesMemoryFormulaOrLimit:false,changesBaselineWindowOrThreshold:false,
    disablesBrowserServices:false,forcesGc:false,fullOriginalConverted:false,speedGainProven:false,publicAcceptance:false};
}
