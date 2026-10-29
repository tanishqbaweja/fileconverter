import assert from "node:assert/strict";
import { readFile,access } from "node:fs/promises";
import test from "node:test";
import { assertSvgStripExperimentNotRejected,assertSvgStripLifecycleNotCompleted } from "../scripts/lib/svg-strip-rejections.mjs";
test("all recorded native/config failures prevent unchanged expensive replay; distinct native code remains eligible",async()=>{
  const ledger=JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  assert.ok(ledger.experiments.length>=4&&ledger.experiments.length<=32);
  for(const row of ledger.experiments){
    await access(row.evidence);
    assert.throws(()=>assertSvgStripExperimentNotRejected(ledger,{wasmSha256:row.wasmSha256,centralRows:row.centralRows,fixtureSha256:ledger.fixtureSha256}),/must not be replayed/);
  }
  assert.doesNotThrow(()=>assertSvgStripExperimentNotRejected(ledger,{wasmSha256:"a".repeat(64),centralRows:64,fixtureSha256:ledger.fixtureSha256}));
  assert.throws(()=>assertSvgStripExperimentNotRejected(ledger,{wasmSha256:"a".repeat(64),centralRows:129,fixtureSha256:ledger.fixtureSha256}));
  const completed=ledger.completedPremultipliedOriginal6MControl;
  const candidate={wasmSha256:completed.nativeWasmSha256,centralRows:completed.centralRows,fixtureSha256:ledger.fixtureSha256};
  assert.throws(()=>assertSvgStripExperimentNotRejected(ledger,candidate),/explicit changed implementation/);
  assert.throws(()=>assertSvgStripExperimentNotRejected(ledger,{...candidate,workerImplementationSha256:completed.workerImplementationSha256}),/must not be replayed unchanged/);
  assert.doesNotThrow(()=>assertSvgStripExperimentNotRejected(ledger,{...candidate,workerImplementationSha256:"c".repeat(64)}));
  const lifecycle=ledger.completedPremultipliedLifecycleControl;
  assert.throws(()=>assertSvgStripLifecycleNotCompleted(ledger,lifecycle),/must not be replayed unchanged/);
  assert.doesNotThrow(()=>assertSvgStripLifecycleNotCompleted(ledger,{...lifecycle,workerImplementationSha256:"e".repeat(64)}));
});
