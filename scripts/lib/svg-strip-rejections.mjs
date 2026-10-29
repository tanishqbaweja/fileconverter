import assert from "node:assert/strict";
export function assertSvgStripLifecycleNotCompleted(ledger,candidate){
  const keys=["nativeWasmSha256","workerImplementationSha256","lifecycleQualifierSha256","lifecycleRecoverySha256"];
  for(const key of keys)assert.match(candidate[key]??"",/^[a-f0-9]{64}$/,key);
  const done=ledger.completedPremultipliedLifecycleControl;
  assert.ok(!done||!keys.every(key=>done[key]===candidate[key]),
    "Completed lifecycle implementation must not be replayed unchanged to seek green: "+done?.evidence);
}
export function assertSvgStripExperimentNotRejected(ledger,{wasmSha256,centralRows,fixtureSha256,workerImplementationSha256}){
  assert.equal(ledger.schemaVersion,1);assert.match(wasmSha256,/^[a-f0-9]{64}$/);
  assert.ok([64,80,128].includes(centralRows));assert.match(fixtureSha256,/^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(ledger.experiments)&&ledger.experiments.length<=32);
  if(ledger.fixtureSha256!==fixtureSha256)return;
  const rejected=ledger.experiments.find(row=>row.wasmSha256===wasmSha256&&row.centralRows===centralRows);
  assert.ok(!rejected,"Rejected private SVG experiment must not be replayed: "+JSON.stringify(rejected)+". "+ledger.requiredNextChange);
  const completed=ledger.completedPremultipliedOriginal6MControl;
  if(completed?.nativeWasmSha256===wasmSha256&&completed.centralRows===centralRows){
    assert.match(workerImplementationSha256??"",/^[a-f0-9]{64}$/, "Completed functional repeat needs explicit changed implementation provenance, not another attempt for green memory");
    assert.notEqual(workerImplementationSha256,completed.workerImplementationSha256,
      "Completed original6M implementation must not be replayed unchanged to seek a stable/green baseline: "+completed.evidence);
  }
}
