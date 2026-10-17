import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveOriginalStartupCaller, deriveOriginalStartupDriver } from "./original-startup-control.mjs";

// One isolated factor: replacement codec worker waits26min before restart.
// Neither a completed-save simulation nor native validation pressure emulation.
export function deriveOriginalIdleDriver(source, root, wrapper, candidateName, files) {
  const parent = deriveOriginalStartupDriver(source, root, wrapper, candidateName, files);
  const marker = '    observer.setPhase(`pre-conversion-${number}`);';
  const idle = `    if(number===2){
      const idleControl=progressProbe.idleControl={scope:"elapsed-idle-after-normal-cancellation-only",
        minimumMs:1560000,startedAt:Date.now(),finishedAt:null,actualMs:null,observations:0,
        noPageReload:true,noForcedGc:true,noNativeValidationLoad:true,successfulSaveExercised:false,
        originalLongRunFailureResolved:false,fullOriginalAcceptance:false,publicAcceptance:false};
      observer.setPhase("diagnostic-idle-after-cancel");
      const idlePageUrl=page.url(),idleWorker=page.workers()[0];
      assert.ok(idleWorker);assert.equal(page.workers().length,1);
      process.stdout.write("IDLE CONTROL: owned original conversion cancelled and scratch removed; waiting26min before second startup.\\n");
      while(Date.now()-idleControl.startedAt<idleControl.minimumMs){
        observer.healthy();
        const idleSample=await takeSample("diagnostic-idle-after-cancel");
        assert.equal(page.url(),idlePageUrl);assert.equal(page.workers().length,1);
        assert.equal(page.workers()[0],idleWorker,"Do not replace workers to evade retention");
        assert.equal(lastState.jobState,"cancelled");assert.equal(lastState.workerStatus,"ready");
        assert.equal(lastState.metrics.pendingOperations,0);assert.equal(lastState.metrics.queuedBytes,0);
        assert.equal(lastState.metrics.scratchBytes,0);
        if(idleSample.privateBytes!==null)assert.ok((idleSample.privateBytes-blankBaseline.privateBytes)/MiB<=250,
          "Idle complete-tree250MiB limit unchanged");
        assert.ok(++idleControl.observations<=192,"Bounded idle observation cap");
        await delay(Math.min(10000,Math.max(0,idleControl.minimumMs-(Date.now()-idleControl.startedAt))));
      }
      idleControl.finishedAt=Date.now();idleControl.actualMs=idleControl.finishedAt-idleControl.startedAt;
      const resumeHost=await (await import("file:///H:/Github%20Repositories/fileconverter/scripts/lib/host-memory-preflight.mjs")).inspectStressHostMemory();
      idleControl.resumeHost=resumeHost;assert.equal(resumeHost.safeToStart,true,"Preserve2GiB safety checks before resumed conversion");
      process.stdout.write("IDLE CONTROL:26min interval complete; resuming same original file/page/worker/baseline.\\n");
    }
`;
  const result = exactPatch(parent.generated, [[marker, idle + marker]]);
  return { ...result, parentEdits: parent.edits, idleMinimumMs: 1560000,
    completedConversionRequired: false, fullOriginalAcceptance: false, publicAcceptance: false };
}

export function deriveOriginalIdleCaller(source, root) {
  const parent = deriveOriginalStartupCaller(source, root);
  const uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveOriginalStartupDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("original-startup-control.mjs"))};`,
      `import {deriveOriginalIdleDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("original-idle-control.mjs"))};`],
    ['  const ownFiles=[', '  const ownFiles=["scripts/diagnose-original-idle.mjs","scripts/lib/original-idle-control.mjs","tests/original-idle-control.test.mjs",'],
    ['assert.equal(row.status,"three-original-startup-cancellations-observed-not-acceptance");',
      'assert.equal(row.status,"three-original-startup-cancellations-observed-not-acceptance");assert.ok(row.progressProbe.idleControl.actualMs>=1560000);'],
  ]);
  const generated = result.generated.replaceAll('${stamp}-original-startup-', '${stamp}-original-idle-')
    .replace('/(?:recorded-timeline-full|original-startup)-(?:live|terminal)',
      '/(?:recorded-timeline-full|original-startup|original-idle)-(?:live|terminal)');
  assert.ok(generated.includes('${stamp}-original-idle-live.json'));
  return { generated, fullOriginalAcceptance: false, publicAcceptance: false };
}
