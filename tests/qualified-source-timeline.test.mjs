import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {createQualifiedSourceTimeline,sourceTimestampAt,verifyOriginalSourceTimelineProof} from "../scripts/lib/qualified-source-timeline.mjs";
const root=path.resolve(import.meta.dirname,".."),proof=JSON.parse(await readFile(path.join(root,"evidence/2026-10-16T21-01-48-525Z-source-timestamp-csv-diagnostic.json")));
test("reconstruct all296160 source timestamps with exact independently decoded digest",()=>{
  const values=createQualifiedSourceTimeline(proof);assert.equal(values.length,296160);assert.equal(values.byteLength,2369280);
  assert.equal(values[0],0);assert.equal(values[1],.042);assert.equal(values[2],.083);assert.equal(values.at(-1),12339.958);
  assert.equal(verifyOriginalSourceTimelineProof(proof).frames,296160);
  assert.throws(()=>sourceTimestampAt(-1));assert.throws(()=>sourceTimestampAt(296160));
});
test("reference rejects changed source, missing/extra frames, changed clocks, stderr or acceptance claims",()=>{
  for(const mutate of [value=>{value.protectedAfter.sha256="0".repeat(64);},value=>{value.stream.strictFrames--;},
    value=>{value.stream.floatFrames++;},value=>{value.executedParser.orderedTimestampSha256="0".repeat(64);},
    value=>{value.stderr.bytes=1;},value=>{value.acceptanceParserChanged=true;}]) {
    const changed=structuredClone(proof);mutate(changed);assert.throws(()=>createQualifiedSourceTimeline(changed));
  }
});
