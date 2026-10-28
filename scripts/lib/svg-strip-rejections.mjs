import assert from "node:assert/strict";
export function assertSvgStripExperimentNotRejected(ledger,{wasmSha256,centralRows,fixtureSha256}){
  assert.equal(ledger.schemaVersion,1);assert.match(wasmSha256,/^[a-f0-9]{64}$/);
  assert.ok([64,80,128].includes(centralRows));assert.match(fixtureSha256,/^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(ledger.experiments)&&ledger.experiments.length<=32);
  if(ledger.fixtureSha256!==fixtureSha256)return;
  const rejected=ledger.experiments.find(row=>row.wasmSha256===wasmSha256&&row.centralRows===centralRows);
  assert.ok(!rejected,"Rejected private SVG experiment must not be replayed: "+JSON.stringify(rejected)+". "+ledger.requiredNextChange);
}
