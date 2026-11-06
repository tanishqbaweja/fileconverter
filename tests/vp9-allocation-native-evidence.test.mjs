import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const json=async f=>JSON.parse(await readFile(new URL("../evidence/"+f,import.meta.url))),
  native=await json("2026-11-06-vp9-original-width-native-42135708757.json"),
  controls=await json("2026-11-06-vp9-allocation-compiler-controls-42135708757.json");
test("actual paired linker controls identify missing allocator APIs and successful unchanged production allocator",()=>{
  assert.equal(controls.runId,42135708757);assert.equal(controls.head,native.head);assert.equal(controls.artifactSha256,native.artifact.sha256);
  const [before,after]=controls.linkControls.cases;assert.equal(before.productionAllocator,false);assert.equal(before.code,1);
  for(const name of ["emmalloc_dynamic_heap_size","emmalloc_free_dynamic_memory","emmalloc_unclaimed_heap_memory"])
    assert.ok(before.errorLines.some(line=>line.includes("undefined symbol: "+name)));
  assert.equal(after.productionAllocator,true);assert.equal(after.code,0);assert.equal(controls.linkControls.wasmInstantiated,false);
  assert.equal(controls.frameAllocatorCControls.totalFunctionCalls,24);
  assert.ok(controls.frameAllocatorCControls.variants.every(row=>row.successfulPathStatisticCalls===0&&row.failureReports===1));
  assert.equal(controls.actualBrowserHeapMeasurements,null);
});
test("actual diagnostic native artifact binds both vendor sources, configure preimages and unchanged heap/thread settings",async()=>{
  const terminal=await json("2026-11-06-vp9-original-width-build-42135708757-terminal.json"), contract=native.nativeContract;
  assert.equal(terminal.conclusion,"success");assert.equal(terminal.cleanupStepsPassed,true);
  assert.equal(terminal.head,"7f5217f8c602d2937dfb6c1afd2ec99f71f0255b");assert.equal(native.head,terminal.head);
  assert.equal(contract.engine,"private-vp9-allocation-diagnostic");assert.equal(Object.keys(contract.artifacts).length,25);
  assert.equal(contract.candidate.allocationDiagnostics.encoderEdits,3);assert.equal(contract.candidate.allocationDiagnostics.allocatorEdits,2);
  assert.equal(contract.candidate.allocationDiagnostics.configureProbeAllocatorAlignedToFinal,true);
  assert.equal(contract.candidate.allocationDiagnostics.productionFinalLinkFlagsChanged,false);
  assert.equal(contract.artifacts["within-remux.wasm"].bytes,9876481);
  assert.equal(contract.artifacts["within-remux.wasm"].sha256,"30b95d6a0bce643bf87a8c9e3170119f25e6720b1f0c152126d8161bf15e4283");
  assert.deepEqual(contract.candidate.wasmMemoryLimits,[{imported:true,initialPages:512,maximumPages:1536,shared:true}]);
  assert.equal(contract.candidate.memoryLimitsRaised,false);assert.equal(contract.candidate.compiledWrapperSha256,"480532d89a4b4f696fced0faaa7be4f29cdbe7a71b990c69dfd2ddef6d346aa6");
  assert.equal(contract.modules[0].videoCodecThreads,1);assert.equal(contract.modules[0].wasmPthreadPoolSize,0);
  assert.equal(native.publicAcceptance,false);assert.equal(native.browserValidated,false);assert.equal(native.nodeInstantiated,false);
});
