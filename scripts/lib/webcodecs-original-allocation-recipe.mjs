// Exact reversible derivation of the retained failed full-original startup.
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
const sha=s=>createHash("sha256").update(s).digest("hex");
export function makeWebCodecsOriginalAllocation(source,root,runId) {
  assert.ok(path.isAbsolute(root));assert.match(runId,/^\d{8,14}$/);
  const parentSha256=sha(source),edits=[];
  const add=(before,after)=>{assert.equal(source.split(before).length,2,before.slice(0,128));source=source.replace(before,after);edits.push([before,after]);};
  for(const ending of [".json","-failure.zip"])add("2026-11-06-webcodecs-vp9-original-startup-"+runId+ending,
    "2026-11-06-webcodecs-vp9-original-allocation-"+runId+ending);
  add('import { chromium } from "playwright";','import { chromium } from "playwright";\n'+
    'import {createPlatformVp9AllocationDiagnostic} from '+JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/platform-vp9-allocation-diagnostic.mjs")).href)+';\n'+
    'import {connectRealmSampler} from '+JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/cdp-realm-memory.mjs")).href)+';');
  add('"workers/media-remux.ts",','"workers/media-remux.ts", "scripts/lib/platform-vp9-allocation-diagnostic.mjs", "scripts/lib/live-memory-infra.mjs", "scripts/lib/memory-infra-attribution.mjs", "scripts/lib/cdp-realm-memory.mjs",');
  add('let runtime, server, chrome, browser, observer,','let platformDiagnostic;\nlet runtime, server, chrome, browser, observer,');
  add('scope: "Full protected original File, platform encoder/fixed32MiB decoder, five-minute safety gate; NOT completed transcode/fidelity/public acceptance",',
    'scope: "Perturbing full-original platform allocation checkpoints; NOT startup/conversion/fidelity/speed/public acceptance",');
  add('  report.loadedIdle = await sampleChromiumTree(chrome.pid);',
    '  report.loadedIdle = await sampleChromiumTree(chrome.pid);\n'+
    '  platformDiagnostic=createPlatformVp9AllocationDiagnostic({root,runId:'+JSON.stringify(runId)+',\n'+
    '    realms:await connectRealmSampler(`ws://127.0.0.1:${Number(debug[0])}${debug[1]}`,origin),\n'+
    '    createSession:()=>browser.newBrowserCDPSession(),sampleProcesses:()=>sampleChromiumTree(chrome.pid)});\n'+
    '  report.platformAllocation=platformDiagnostic.report();\n'+
    '  await platformDiagnostic.capture("loaded-idle");');
  add('evidence:report.originalStartup,backend:"platform"','evidence:report.originalStartup,backend:"platform",diagnosticCapture:(label,metrics)=>platformDiagnostic.capture(label,metrics)');
  add('report.status="passed-private-platform-original-startup-only-not-completed-transcode";',
    'report.status="completed-perturbed-original-platform-allocation-diagnostic-not-acceptance";');
  add('  await outputFile?.close(); await browser?.close().catch(() => {});',
    '  try {platformDiagnostic?.close();}catch(error){report.failures.push("Allocation diagnostic cleanup: "+error);}\n'+
    '  await outputFile?.close(); await browser?.close().catch(() => {});');
  let reverse=source;for(const [before,after]of edits.toReversed()){assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);}assert.equal(sha(reverse),parentSha256);
  return {generated:source,generatedSha256:sha(source),parentSha256,edits,reversible:true,nativeRunId:runId,
    diagnosticOnly:true,perturbsMemoryAndTiming:true,changesMemoryFormulaOrLimit:false,changesBaselineWindowOrThreshold:false,
    forcesGc:false,fullOriginalConverted:false,publicAcceptance:false};
}
