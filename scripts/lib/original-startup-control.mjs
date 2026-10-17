import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveRecordedTimelineCaller, deriveRecordedTimelineDriver } from "./recorded-timeline-full-recipe.mjs";

export function deriveOriginalStartupDriver(source, root, wrapper, candidateName, extensionFiles) {
  const parent = deriveRecordedTimelineDriver(source, root, wrapper, candidateName, extensionFiles);
  const value = parent.generated;
  const begin = value.indexOf('    observer.setPhase(`validation-${number}`);');
  const end = value.indexOf('\n  }\n  assert.deepEqual(forbiddenRequests, []);', begin);
  assert.ok(begin > 0 && end > begin);
  const validation = value.slice(begin, end);
  const cancellation = `    // Intentional short control: never enter full-output validation or count a
    // partial conversion as complete. All original validators remain in parent.
    run.startupControl={scope:"original-file-ten-second-startup-and-production-cancellation-only",
      fullOriginalAcceptance:false,publicAcceptance:false,beforeCancellation:run.state};
    assert.equal(run.state.jobState,"running","Unexpected terminal state before planned control cancellation");
    assert.ok((run.state.metrics?.outputBytes??0)>32768,"Require genuine output before planned cancellation");
    run.startupControl.cancellation=await cancelBrowserConversionBeforeCleanup(page);
    assert.equal(run.startupControl.cancellation.terminalState,"cancelled");
    run.startupControl.afterCancellation=await page.evaluate(()=>window.__WITHIN_TEST__.getState());
    assert.equal(run.startupControl.afterCancellation.metrics.pendingOperations,0);
    assert.equal(run.startupControl.afterCancellation.metrics.queuedBytes,0);
    observer.setPhase(\`cleanup-\${number}\`);
    await emptyOpfs();await page.waitForFunction(()=>window.__WITHIN_TEST__?.getState().workerStatus==="ready");
    run.recovery=await stable(\`cleanup-\${number}\`,loadedIdle.privateBytes+96*MiB);
    run.startupControl.fullOutputValidationPerformed=false;
`;
  const scope = value.match(/scope: "Private full-completion test[^\r\n]+/)[0];
  const edits = [
    ['const diagnosticOnly = false;', 'const diagnosticOnly = true;'],
    ['    if (diagnosticOnly && number > 1) break;', '    // Three startup/cancellation controls; never three completed conversions.'],
    ['      // No partial-output cancellation: complete original source or fail the real gates.',
      '      if(Date.now()-conversionAt>=10000){run.plannedStartupStopAt=Date.now();break;}\n      // Remaining terminal/error and memory assertions are unchanged.'],
    [validation, cancellation],
    ['assert.equal(diagnosticOnly, false, "Private allocation/stack diagnostic cannot certify protected acceptance");',
      'assert.equal(diagnosticOnly,true);assert.equal(runs.length,3);assert.ok(runs.every(run=>run.startupControl?.cancellation.terminalState==="cancelled"));'],
    ['status: failure ? "failed" : "passed-private-protected-session"', 'status: failure ? "failed-original-startup-diagnostic" : "three-original-startup-cancellations-observed-not-acceptance"'],
    [scope, 'scope: "Bounded ORIGINAL-file startup diagnostic using full test Chrome launch/flags, five-minute lower blank, all-tree250MiB and normal production cancellation. Ten seconds per attempted job; no complete conversion or independent full-output validation, no public/profile/speed acceptance. No native conversion, resized/substituted source, forced GC, process omission, or larger baseline.",'],
    ['limitMiB: 250, requestedRuns: diagnosticOnly ? 1 : 3,', 'limitMiB: 250, requestedStartupControls:3, requestedCompletedConversions:0, requestedRuns:3,'],
  ];
  const recipe = exactPatch(value, edits);
  return { ...recipe, parentEdits: parent.edits, diagnosticOnly: true,
    partialStopAfterMs: 10000, fullOutputValidationPerformed: false,
    fullOriginalAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false };
}

export function deriveOriginalStartupCaller(source, root) {
  const parent = deriveRecordedTimelineCaller(source, root);
  const uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const value = parent.generated;
  const recipe = exactPatch(value, [
    [`import {deriveRecordedTimelineDriver as deriveUpdatedChromeFullDriver,deriveUpdatedChromeFullStager,deriveRecordedTimelineSupervisor as deriveUpdatedChromeSupervisor} from ${JSON.stringify(uri("recorded-timeline-full-recipe.mjs"))};`,
      `import {deriveUpdatedChromeFullStager,deriveRecordedTimelineSupervisor as deriveUpdatedChromeSupervisor} from ${JSON.stringify(uri("recorded-timeline-full-recipe.mjs"))};\nimport {deriveOriginalStartupDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("original-startup-control.mjs"))};`],
    ['  const ownFiles=[', '  const ownFiles=["scripts/diagnose-original-startup.mjs","scripts/lib/original-startup-control.mjs","tests/original-startup-control.test.mjs",'],
    ['const traceHelper=previous.traceHelper.replaceAll("updated-chrome-full-wrapper-haSh5X",path.basename(wrapper.directory));',
      'const traceHelper=previous.traceHelper.replaceAll("updated-chrome-full-wrapper-haSh5X",path.basename(wrapper.directory)).replaceAll("2026-10-15T22-27-06-823Z",stamp);'],
    ['    requestedRuns:3,primaryLimitMiB:250,', '    requestedStartupControls:3,requestedCompletedConversions:0,requestedRuns:3,primaryLimitMiB:250,'],
    ['assert.equal(row.status,"passed-private-protected-session");assert.equal(row.runs.length,3);',
      'assert.equal(row.status,"three-original-startup-cancellations-observed-not-acceptance");assert.equal(row.runs.length,3);assert.ok(row.runs.every(run=>run.independentValidation===null&&run.startupControl?.cancellation.terminalState==="cancelled"));'],
    ['"three-full-runs-completed-pending-independent-audit"', '"original-startup-controls-finished-pending-audit-not-acceptance"'],
    ['completedRuns:row.runs.length,', 'completedRuns:row.runs.filter(run=>run.independentValidation!==null).length,attemptedStartupControls:row.runs.length,'],
  ]);
  const generated = recipe.generated.replaceAll('${stamp}-recorded-timeline-full-', '${stamp}-original-startup-')
    .replace('/recorded-timeline-full-(?:live|terminal)', '/(?:recorded-timeline-full|original-startup)-(?:live|terminal)');
  return { generated, edits: recipe.edits, fullOriginalAcceptance: false, publicAcceptance: false };
}
