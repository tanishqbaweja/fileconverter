import assert from "node:assert/strict";
import { readFile,access } from "node:fs/promises";
import test from "node:test";
import { assertSvgStripExperimentNotRejected } from "../scripts/lib/svg-strip-rejections.mjs";
test("all recorded native/config failures prevent unchanged expensive replay; distinct native code remains eligible",async()=>{
  const ledger=JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  assert.equal(ledger.experiments.length,4);
  for(const row of ledger.experiments){
    await access(row.evidence);
    assert.throws(()=>assertSvgStripExperimentNotRejected(ledger,{wasmSha256:row.wasmSha256,centralRows:row.centralRows,fixtureSha256:ledger.fixtureSha256}),/must not be replayed/);
  }
  assert.doesNotThrow(()=>assertSvgStripExperimentNotRejected(ledger,{wasmSha256:"a".repeat(64),centralRows:64,fixtureSha256:ledger.fixtureSha256}));
  assert.throws(()=>assertSvgStripExperimentNotRejected(ledger,{wasmSha256:"a".repeat(64),centralRows:128,fixtureSha256:ledger.fixtureSha256}));
});
