import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeSplitRenderUiSource } from "../scripts/lib/split-render-ui-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),original=await readFile(path.join(root,"app/converter/ConverterApp.tsx"),"utf8");
const candidate=makeSplitRenderUiSource(original,root);
test("Private render decomposition preserves exact model body and exposes no fabricated memory or speed acceptance",()=>{
  assert.equal(candidate.sections.length,15);assert.equal(candidate.newReactComponentBoundaries,0);
  assert.equal(candidate.hooksHandlersAndLifecycleUnchanged,true);assert.equal(candidate.markupChanged,false);
  for(const key of ["nativeAllocationCauseProven","publicAcceptance","conversionSpeedAcceptance","completeChromiumMemoryAcceptance"])assert.equal(candidate[key],false);
  assert.ok(candidate.modelFunctionBytes<candidate.originalComponentBytes*0.7);
  assert.ok(candidate.renderHelperBytes.every(row=>row.bytes<candidate.originalComponentBytes*0.25));
  const parsed=ts.createSourceFile("candidate.tsx",candidate.source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.deepEqual(parsed.parseDiagnostics,[]);
  assert.ok(candidate.snapshotFields.includes("file")&&candidate.snapshotFields.includes("cancelConversion"));
  assert.throws(()=>makeSplitRenderUiSource(original+"\n",root),/AssertionError/);
});
