import assert from "node:assert/strict";
import { createBoundedAsyncifyStorage } from "./bounded-asyncify-storage.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";

export const ORIGINAL_ASYNCIFY_GLUE_SHA = "c819ad21398ebf90dac4b58588969221cdcf21ef0d208492cc43c81dd923f85a";
export function makeAsyncifyStorageGlue(source) {
  assert.equal(sha(source), ORIGINAL_ASYNCIFY_GLUE_SHA);
  assert.equal(source.split("StackSize:262144").length, 2);
  const edits = [
    ["var Asyncify={", `var withinSuspensionStorage=(${createBoundedAsyncifyStorage.toString()})({malloc:bytes=>_malloc(bytes),free:ptr=>_free(ptr),heap:()=>HEAPU8});var Asyncify={`],
    ["allocateData(){var ptr=_malloc(12+Asyncify.StackSize);Asyncify.setDataHeader(ptr,ptr+12,Asyncify.StackSize);Asyncify.setDataRewindFunc(ptr);return ptr}",
      'allocateData(){assert(!Asyncify.currData,"Another Asyncify operation is active");assert(Asyncify.StackSize===262144,"Compiled Asyncify stack changed");var ptr=withinSuspensionStorage.acquire();try{Asyncify.setDataHeader(ptr,ptr+12,Asyncify.StackSize);Asyncify.setDataRewindFunc(ptr);return ptr}catch(error){withinSuspensionStorage.release(ptr);throw error}}'],
    ["_free(Asyncify.currData);Asyncify.currData=null;", "withinSuspensionStorage.release(Asyncify.currData);Asyncify.currData=null;"],
    ['if(ABORT)return;initRuntime();Module["onRuntimeInitialized"]?.();',
      'if(ABORT)return;initRuntime();withinSuspensionStorage.reserve();Module["withinAsyncifyStorageMetrics"]=()=>withinSuspensionStorage.metrics();Module["withinAsyncifyStorageClose"]=()=>{if(!ABORT)withinSuspensionStorage.close();return {...withinSuspensionStorage.metrics(),abortedReleaseDeferredUntilWorkerTermination:!!ABORT}};Module["onRuntimeInitialized"]?.();'],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source, "Only suspension allocation/lifecycle changes; native Wasm/settings remain identical");
  return { generated, generatedSha256: sha(generated), originalSha256: sha(source), edits,
    nativeWasmChanged: false, heapLimitsChanged: false, stackSizeChanged: false, publicAcceptance: false };
}
