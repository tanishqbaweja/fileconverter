// Reuse the actual strict automatic-fallback control, never an easier CPU-only job.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
const sha = value => createHash("sha256").update(value).digest("hex");
export const VP9_SPECIALIST_QUALIFICATION_PARENT_SHA256 = "494dcd4f9a722f97a7b5cdc386081025540558300c0c8fe23d42e3eb393acde2";
export function makeVp9CpuSpecialistQualificationSource(source, root, runId) {
  assert.equal(sha(source), VP9_SPECIALIST_QUALIFICATION_PARENT_SHA256);
  assert.ok(path.isAbsolute(root)); assert.match(runId, /^\d{8,14}$/); assert.notEqual(runId, "42244170876");
  const parentSha256 = sha(source), edits = [];
  const add = (before, after) => {
    assert.equal(source.split(before).length, 2, before);
    source = source.replace(before, after); edits.push([before, after]);
  };
  const all = (before, after, count) => {
    assert.equal(source.split(before).length, count + 1);
    // Each edit stores its entire unique source context, preserving exact reversal.
    const prior = source; add(prior, prior.replaceAll(before, after));
  };
  all("42244170876", runId, 8);
  all("2026-11-06-vp9-token-packed-http-qualification-" + runId + "-attempt2",
    "2026-11-20-vp9-cpu-specialist-qualification-" + runId, 3);
  add("evidence/2026-11-06-vp9-original-width-native-" + runId + ".json",
    "evidence/2026-11-20-vp9-cpu-specialist-native-" + runId + ".json");
  add('loadVp9DurationCpuAssets(root, "' + runId + '", "original-width")',
    'loadVp9DurationCpuAssets(root, "' + runId + '", "cpu-specialist")');
  const imports = file => JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", file)).href);
  add('import { observeOwnedProcessExit } from ',
    'import {cleanupOwnedChromium,queryObservedPidCensus} from ' + imports("owned-chromium-cleanup.mjs") + ';\n' +
    'import {reconcileChromiumBirths} from ' + imports("reconcile-chromium-births.mjs") + ';\n' +
    'import { observeOwnedProcessExit } from ');
  add('let serverLog = "", tracing = false;', 'let serverLog = "", tracing = false;\n' +
    'const browserIdentitiesAbsent=()=>!chromeBirth||report.browserCleanup?.status==="owned-observed-pids-absent"||report.browserBirthReconciliation?.allObservedBirthsAbsent===true;');
  add('"scripts/lib/vp9-http-recipe.mjs",', '"scripts/lib/vp9-http-recipe.mjs", ' + [
    "scripts/lib/vp9-cpu-specialist-qualification-recipe.mjs", "scripts/test-vp9-cpu-specialist.mjs",
    "scripts/lib/owned-chromium-cleanup.mjs", "scripts/lib/reconcile-chromium-births.mjs",
    "scripts/lib/native-memory-peaks.mjs", "scripts/lib/parallel-memory-observer.mjs",
    "scripts/lib/birth-aware-chromium-memory.mjs", "scripts/lib/birth-aware-memory-observer-source.mjs",
    "scripts/lib/windows-tree-monitor.cs", "scripts/lib/windows-process-birth-proof.cs",
    "scripts/lib/windows-tree-monitor-birth-aware.ps1",
  ].map(JSON.stringify).join(", ") + ",");
  add('  await outputFile?.close(); await browser?.close().catch(() => {});\n' +
    '  for (const [child, birth] of [[chrome, chromeBirth], [server, serverBirth]]) {\n' +
    '    try { await stopKnown(child, birth); } catch (error) { report.failures.push("Owned process cleanup: " + error); }\n  }',
    '  try {await outputFile?.close();}catch(error){report.failures.push("Output close: "+error);}\n' +
    '  try {\n' +
    '    if(chromeBirth){\n' +
    '      const identities=report.nativeMemory?.identities??[],observedPids=[...new Set([chromeBirth.pid,...identities.map(p=>p.pid)])];\n' +
    '      report.browserCleanup=await cleanupOwnedChromium({identity:chromeBirth,observedPids,disconnect:async()=>{await browser?.close();}});\n' +
    '      if(report.browserCleanup.status!=="owned-observed-pids-absent")report.browserBirthReconciliation=reconcileChromiumBirths({identity:chromeBirth,observedPids,samples:[{processes:[chromeBirth,...identities.filter(p=>p.pid!==chromeBirth.pid)]}],current:await queryObservedPidCensus(observedPids)});\n' +
    '      assert.ok(browserIdentitiesAbsent(),"All observed browser births must be absent before profile cleanup");\n' +
    '    }else await browser?.close();\n' +
    '  }catch(error){report.failures.push("Owned browser cleanup: "+error);}\n' +
    '  try {await stopKnown(server,serverBirth);}catch(error){report.failures.push("Owned server cleanup: "+error);}');
  all('report.processCleanup.every(x=>x.status==="owned-identity-absent")',
    'browserIdentitiesAbsent()&&report.processCleanup.every(x=>x.status==="owned-identity-absent")', 1);
  all('report.processCleanup.every(x => x.status === "owned-identity-absent")',
    'browserIdentitiesAbsent()&&report.processCleanup.every(x => x.status === "owned-identity-absent")', 2);
  let reversed = source;
  for (const [before, after] of edits.toReversed()) {
    assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before);
  }
  assert.equal(sha(reversed), parentSha256);
  return { generated: source, parentSha256, generatedSha256: sha(source), edits, reversible: true,
    nativeRunId: runId, automaticHardwareAttemptAndCpuFallbackPreserved: true,
    encodingSettingsChanged: false, strictFidelityOrRecoveryGatesChanged: false,
    memoryFormulaOrBaselineChanged: false, browserServicesDisabled: false,
    observedBrowserBirthCleanupRequired: true, browserValidated: false,
    speedGainProven: false, fullOriginalOrPublicAcceptance: false };
}
