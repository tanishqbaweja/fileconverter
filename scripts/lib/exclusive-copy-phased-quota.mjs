// A sanitized quota estimate is remaining headroom, not total physical capacity.
// Keep the full two-file peak disk preflight; recheck additional bytes per phase.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeStagedCopyDiagnosticWorker } from "./staged-copy-diagnostic-worker.mjs";
import { makeLowerCopyDiagnostic } from "./exclusive-copy-lower-baseline.mjs";
export function planDiagnosticCopyAllocation(estimate, bytes) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > Number.MAX_SAFE_INTEGER / 2 ||
    !Number.isSafeInteger(estimate?.usage) || estimate.usage < 0 ||
    !Number.isSafeInteger(estimate.quota) || estimate.quota < estimate.usage)
    throw new TypeError("Valid measured storage estimate and allocation size required");
  const available = estimate.quota - estimate.usage;
  if (available < bytes) throw new DOMException(`Additional allocation needs${bytes}B, reported headroom${available}B`, "QuotaExceededError");
  return { estimate, reportedAvailableBytes: available, additionalBytesRequiredNow: bytes,
    fullPlannedPeakFileBytes: bytes * 2, quotaIsAnEstimateNotAHardCapacity: true,
    noSmallerFixture: true, physicalPreflightMinimumBytes: 32 * 1024 ** 3 };
}
export function makePhasedQuotaCopyWorker(source) {
  const parent = makeStagedCopyDiagnosticWorker(source);
  const recipe = exactPatch(parent.generated, [
    ["const SOURCE='copy-diagnostic-source.bin'", `const planDiagnosticCopyAllocation=(${planDiagnosticCopyAllocation.toString()});\nconst SOURCE='copy-diagnostic-source.bin'`],
    ["const estimate=await navigator.storage.estimate();if(estimate.quota-estimate.usage<BYTES*2)throw new Error('Insufficient diagnostic quota');",
      "const quotaPlan=planDiagnosticCopyAllocation(await navigator.storage.estimate(),BYTES);"],
    ["generatedBytes:at,maximumBufferBytes:buffer.length,sparse:false", "generatedBytes:at,quotaPlan,maximumBufferBytes:buffer.length,sparse:false"],
    ["   const finalHandle=await root.getFileHandle(OUTPUT,{create:true})", "   const quotaPlan=planDiagnosticCopyAllocation(await navigator.storage.estimate(),BYTES);\n   const finalHandle=await root.getFileHandle(OUTPUT,{create:true})"],
    ["const result={mode:data.mode,outputBytes:", "const result={mode:data.mode,quotaPlan,outputBytes:"],
  ]);
  return { ...parent, ...recipe, productionLoopSha256: parent.productionLoopSha256,
    noSmallerFixture: true, quotaRecheckedBeforeEachAdditionalAllocation: true, publicAcceptance: false };
}
export function makePhasedQuotaDiagnostic(source, root) {
  const parent = makeLowerCopyDiagnostic(source, root), uri = file => pathToFileURL(path.join(root, file)).href;
  const renamed = parent.generated.replaceAll("${stamp}-exclusive-staged-copy-lower", "${stamp}-exclusive-staged-copy-phased");
  return exactPatch(parent.generated, [
    [parent.generated, renamed],
    [`import { makeStagedCopyDiagnosticWorker } from ${JSON.stringify(uri("scripts/lib/staged-copy-diagnostic-worker.mjs"))};`,
      `import { makePhasedQuotaCopyWorker as makeStagedCopyDiagnosticWorker } from ${JSON.stringify(uri("scripts/lib/exclusive-copy-phased-quota.mjs"))};`],
    ['const files = ["scripts/benchmark-exclusive-staged-copy-lower.mjs",', 'const files = ["scripts/benchmark-exclusive-staged-copy-phased.mjs", "scripts/lib/exclusive-copy-phased-quota.mjs", "scripts/benchmark-exclusive-staged-copy-lower.mjs",'],
    ["async function command(operation) {\n  return page.evaluate", "async function command(operation) {\n  state.currentOperation={...operation};state.status='storage-operation';await checkpoint();\n  return page.evaluate"],
    ['  observer.setPhase("fixture-generation"); const generated', '  state.persistenceRequested=true;state.persistenceGranted=await page.evaluate(()=>navigator.storage.persist());\n  observer.setPhase("fixture-generation"); const generated'],
    ['async () => { if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },',
      'async () => { if (server) { server.closeAllConnections();await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } },'],
    ['async () => { if (browser) await browser.close(); },', `async () => { if(browser) { let timer;try { await Promise.race([browser.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Owned browser disconnect timed out')),10000);})]); }finally{clearTimeout(timer);} } },`],
    ['stack: String(error.stack).slice(0, 4096)', 'stack: String(error.stack).replace(/data:text\\/javascript;base64,[A-Za-z0-9+/=]+/g,"generated-storage-diagnostic").slice(0, 4096)'],
  ]);
}
