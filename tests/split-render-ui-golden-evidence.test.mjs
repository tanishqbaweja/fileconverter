import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { verifySplitRenderUiGoldens } from "../scripts/lib/split-render-ui-golden-evidence.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const proofPath="evidence/2026-10-08T23-16-24-605Z-split-render-ui-goldens.json";
test("Actual new split-render browser conversions are independently hash-bound with original golden fidelity and exact geometry; no promotion",async()=>{
  const actual=await verifySplitRenderUiGoldens(root,proofPath);
  const frozen=JSON.parse(await read("evidence/2026-10-08T23-16-24-605Z-split-render-ui-golden-validation.json"));
  assert.equal(frozen.status,"independently-verified-and-losslessly-compacted");
  for(const [key,value] of Object.entries(actual))assert.deepEqual(value,frozen[key],key);
  assert.equal(actual.sourcePinCount,25);assert.equal(actual.conversions.length,3);
  assert.equal(actual.conversions[0].outputBytes,321692);assert.equal(actual.conversions[1].outputBytes,652521);
  assert.equal(actual.conversions[2].destination,"direct");assert.equal(actual.maximumGeometryDeltaCssPixels,0);
  for(const [file,hash] of Object.entries(frozen.sourcePins))assert.equal(sha(await read(file)),hash,file);
});
test("Actual redundant raw report is gone only after exact archival proof; reviewed private screenshots do not certify public labels",async()=>{
  const frozen=JSON.parse(await read("evidence/2026-10-08T23-16-24-605Z-split-render-ui-golden-validation.json"));
  assert.equal(frozen.rawRemovedAfterIdentityShaAndLosslessVerification,true);assert.equal(frozen.bytesSaved,509062);
  await assert.rejects(access(path.join(root,frozen.rawReport.rawPath)),{code:"ENOENT"});
  const review=(await read("evidence/2026-10-08T23-16-24-605Z-split-render-ui-visual-review.md")).toString();
  assert.ok(review.includes("All six actual 1280x900 screenshots")&&review.includes("NOT suitable for public promotion"));
  assert.equal(frozen.publicAcceptance,false);assert.equal(frozen.conversionSpeedAcceptance,false);assert.equal(frozen.completeChromiumMemoryAcceptance,false);
});
