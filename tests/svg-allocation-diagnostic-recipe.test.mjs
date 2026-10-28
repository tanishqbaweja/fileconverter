import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeSvgEffectsDiagnostic } from "../scripts/lib/svg-effects-diagnostic-recipe.mjs";
import { makeSvgAllocationDiagnostic } from "../scripts/lib/svg-allocation-diagnostic-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."), read=file=>readFile(path.join(root,file));
const options={root,runtime:path.join(root,"work/svg-reproduced-qualification-aBc123"),
  driverBytes:await read("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await read("tests/browser/image-conversions.spec.ts"),
  generatorBytes:await read("scripts/generate-svg-stress-fixture.py")};
test("probe qualification edits only exact descriptor/byte validation and independently reverses the real served module; all effects assertions survive",()=>{
  const base=makeSvgEffectsDiagnostic(options), probed=makeSvgAllocationDiagnostic(options);
  let restored=probed.suite.replace(/^import \{ removeAllocationProbe \} from [^\r\n]+;\n/,"");
  for(const[before,after]of[...probed.suiteEdits].reverse()) { assert.equal(restored.split(after).length-1,1); restored=restored.replace(after,before); }
  assert.equal(restored,base.suite); assert.equal(probed.config,base.config); assert.equal(probed.fixtureRoot,base.fixtureRoot);
  assert.equal(probed.proof.countersOnlyNotConversionOptimization,true); assert.equal(probed.proof.memoryAcceptance,false);
  for(const anchor of ['removeAllocationProbe(bytes)','addAllocationProbe(members[pins.wasmMember])',
    'assert.deepEqual(definedWasmMemories(probed.bytes), report.wasmMemory)','report.memoryAcceptance = false',
    'report.memory.incrementalPrivateMiB <= 250','baselineDeadline = baselineStarted + 30000']) assert.ok((probed.suite+probed.driver).includes(anchor),anchor);
  assert.match(probed.driver,/report.staticAbi.namesAndKindsEqual, true/);
  for(const[name,source]of[["probe.mjs",probed.driver],["suite.ts",probed.suite]])
    assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
});
