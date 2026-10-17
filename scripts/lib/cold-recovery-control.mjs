import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveRecoveryRuntimeDriver, deriveRecoveryRuntimeCaller } from "./recovery-runtime-control.mjs";
const files = ["scripts/lib/cold-recovery-control.mjs", "scripts/diagnose-cold-recovery.mjs", "tests/cold-recovery-control.test.mjs"];
export function deriveColdRecoveryDriver(...args) {
  const parent = deriveRecoveryRuntimeDriver(...args);
  return exactPatch(parent.generated, [
    ['let recoveryExecution=null;', 'let recoveryExecution=null,coldExecution=null;'],
    ['async()=>{recoveryExecution=createRecoveryExecutionTrace(',
      'async()=>{if(coldExecution)progressProbe.coldExecution=await coldExecution.stop("before-recovery-window");recoveryExecution=createRecoveryExecutionTrace('],
    ['      recoveryExecution?.noteBudgetFailure(event);', '      coldExecution?.noteBudgetFailure(event);recoveryExecution?.noteBudgetFailure(event);'],
    ['  observer.setPhase("conversion-completed-save-control");', `  coldExecution=createRecoveryExecutionTrace({root,reportBase:reportBase+"-cold",createSession:()=>browser.newBrowserCDPSession(),
    windowKind:"cold-start",categories:["v8.wasm","v8","disabled-by-default-v8.compile","disabled-by-default-v8.gc"]});
  const firstCodec=page.workers().filter(worker=>worker.url().startsWith(origin+"/assets/conversion.worker-"));
  assert.equal(firstCodec.length,1);
  firstCodec[0].once("close",()=>{void coldExecution.stop("first-codec-retired").then(value=>{progressProbe.coldExecution=value;});});
  await coldExecution.start();
  observer.setPhase("conversion-completed-save-control");`],
    ['      if(recoveryExecution)progressProbe.recoveryExecution=await recoveryExecution.stop("after-production-cancel");',
      '      if(coldExecution)progressProbe.coldExecution=await coldExecution.stop("after-production-cancel");\n      if(recoveryExecution)progressProbe.recoveryExecution=await recoveryExecution.stop("after-production-cancel");'],
    ['    if(recoveryExecution)progressProbe.recoveryExecution=await recoveryExecution.stop();',
      '    if(coldExecution)progressProbe.coldExecution=await coldExecution.stop();\n    if(recoveryExecution)progressProbe.recoveryExecution=await recoveryExecution.stop();'],
    ['"failed-recovery-runtime-diagnostic"', '"failed-cold-recovery-runtime-diagnostic"'],
    ['"six-small-recovery-runtime-diagnostic-not-acceptance"', '"six-small-cold-and-recovery-runtime-diagnostic-not-acceptance"'],
    [parent.generated.match(/scope: "Diagnostic around actual[^\r\n]+/)[0],
      'scope: "Two nonoverlapping bounded event windows: coarse first codec execution and detailed post-write-failure recovery if reached. First closes on production codec retirement and is awaited before recovery trace. Same production app/cores/flags/validators/all-process250MiB and immediate cancellation; no GC/heap manipulation or acceptance from diagnostic timing/memory.",'],
  ]);
}
export function deriveColdRecoveryCaller(source, root) {
  const parent = deriveRecoveryRuntimeCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveRecoveryRuntimeDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("recovery-runtime-control.mjs"))};`,
      `import {deriveColdRecoveryDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("cold-recovery-control.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
    ['assert.equal(row.status,"six-small-recovery-runtime-diagnostic-not-acceptance");', 'assert.equal(row.status,"six-small-cold-and-recovery-runtime-diagnostic-not-acceptance");'],
    ['"recovery-runtime-diagnostic-finished-pending-audit-not-acceptance"', '"cold-recovery-diagnostic-finished-pending-audit-not-acceptance"'],
  ]);
  return { generated: result.generated.replaceAll('${stamp}-recovery-runtime-control-', '${stamp}-cold-recovery-control-')
    .replace('|recovery-runtime-control|paint-boundary-control', '|recovery-runtime-control|cold-recovery-control|paint-boundary-control'), publicAcceptance: false };
}
