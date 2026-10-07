// Uses the ACTUALLY browser-validated exclusive stager, not worker interception.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeFlexOriginalDriver } from "./mpeg2-flex-original-recipe.mjs";
import { makeAbortSplitAdapter } from "./mpeg2-abort-original-recipe.mjs";
const sha = data => createHash("sha256").update(data).digest("hex");
export function makeStagedAbortOriginalDriver(source, root, resolvePackage, adapter, helper) {
  const prior = makeFlexOriginalDriver(source, root, resolvePackage);
  const changed = makeAbortSplitAdapter(adapter, helper);
  const stageBefore = 'await exec(process.execPath, ["scripts/stage-mpeg2-split-direct.mjs", "stage"]); staged = true;';
  const stageAfter = `await exec(process.execPath, ["scripts/stage-mpeg2-split-abort-diagnostic.mjs", "stage"]); staged = true;
  for(const name of ["within-remux.mjs","within-mpeg4.mjs","within-direct.mjs"]){
    const file=path.join(root,"dist/client/engines/remux",name);
    assert.equal((await stat(file)).size,${Buffer.byteLength(changed)});
    assert.equal(await shaFile(file),${JSON.stringify(sha(changed))},"Exact controlled staged abort adapter");
    abortDiagnostic.stagedAdapters.push({name,bytes:${Buffer.byteLength(changed)},sha256:${JSON.stringify(sha(changed))}});
  }`;
  const listener = `  page.on("console", message => {
    const text=message.text(),prefix="WITHIN_BOUNDED_WASM_ABORT ";
    if(!text.startsWith(prefix))return;
    try{
      assert.ok(text.length<=65536);assert.ok(abortDiagnostic.records.length<8);
      const row=JSON.parse(text.slice(prefix.length));
      assert.ok(["decoder","encoder"].includes(row.role));
      assert.ok(typeof row.reason==="string"&&row.reason.length<=512);
      assert.ok(typeof row.stack==="string"&&row.stack.length<=8192);
      assert.equal(row.failedIndividualAllocationBytes,null);assert.equal(row.heapLiveBytes,null);
      abortDiagnostic.records.push(row);
    }catch(error){abortDiagnostic.captureError=String(error).slice(0,1024);}
  });
  await page.goto("about:blank");`;
  const patches = [
    ['let startupSettlement = null;', `const abortDiagnostic={records:[],maximumRecords:8,queuedRecords:0,stagedAdapters:[],captureError:null,
  noNormalNativeCalls:true,noForcedGc:true,noDebuggerPause:true,syntheticMallocInvoked:false,
  originalFailureCause:null,publicAcceptance:false,acceptanceWithheldForDiagnostic:true};
let startupSettlement = null;`],
    [stageBefore,stageAfter],
    ['await exec(process.execPath, ["scripts/stage-mpeg2-split-direct.mjs", "restore"]);',
      'await exec(process.execPath, ["scripts/stage-mpeg2-split-abort-diagnostic.mjs", "restore"]);'],
    ['const sourceFiles = ["scripts/mpeg2-flex-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-staged-abort-original-memory.mjs", "scripts/lib/mpeg2-staged-abort-original-recipe.mjs", "scripts/stage-mpeg2-split-abort-diagnostic.mjs", "scripts/lib/mpeg2-abort-original-recipe.mjs", "scripts/lib/bounded-wasm-abort-capture.mjs", "scripts/validate-mpeg2-split-abort-goldens.mjs", "tests/browser/mpeg2-split-direct-candidate.spec.ts", "evidence/mpeg2-abort-golden-regression-2026-10-08.json", "evidence/mpeg2-abort-preconversion-analysis-2026-10-08.json", "evidence/wasm-abort-capture-control-origin-checked-2026-10-08.json", "scripts/mpeg2-flex-original-memory.mjs",'],
    ['await page.goto("about:blank");\n  startupSettlement =',listener+'\n  startupSettlement ='],
    ['    await observer.through(Date.now());\n    const conversionAt =',
      '    assert.equal(abortDiagnostic.stagedAdapters.length,3);\n    await observer.through(Date.now());\n    const conversionAt ='],
    ['nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, failure,',
      'nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, abortDiagnostic, failure,'],
    ['-private-mpeg2-flex-original-native-100ms','-private-mpeg2-staged-abort-original-native-100ms'],
    ['"mpeg2-flex-original-runtime-"','"mpeg2-staged-abort-original-runtime-"'],
    ['Full protected original with measured equivalent dynamic-control flex CSS ONLY;',
      'Full protected original with equivalent flex CSS and actually validated generated-adapter onAbort observers;'],
    ['  assert.deepEqual(forbiddenRequests, []);',
      '  assert.deepEqual(forbiddenRequests, []);\n  assert.equal(abortDiagnostic.captureError,null);'],
  ];
  let result=prior;
  for(const[before,after]of patches){assert.equal(result.split(before).length,2,before);result=result.replace(before,after);}
  let reversed=result;
  for(const[before,after]of [...patches].reverse()){assert.equal(reversed.split(after).length,2,after);reversed=reversed.replace(after,before);}
  assert.equal(reversed,prior,"Only proven stager/actual failure collector/provenance; EVERY full original gate preserved");
  return result;
}
