import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { heldWriterSource, summarizeStagedWriterTiming, STAGED_WRITER_CONTROL as plan } from "../scripts/lib/staged-writer-control.mjs";
import archived from "../fixtures/source/staged-save-before-held-writer-2026-11-17.json" with { type: "json" };
const previous=gunzipSync(Buffer.from(archived.gzipBase64,"base64"),{maxOutputLength:16384}).toString();
test("single writer changes only lock lifetime and dispatch; original buffer, read, backpressure, cancellation and cleanup remain exact",async()=>{
  const proposal=heldWriterSource(previous);assert.equal(previous,await readFile("workers/staged-save-runtime.ts","utf8"),"Measured rejection leaves production unchanged");
  assert.equal(proposal.edits.length,5);assert.equal(proposal.source.split("finalWritable.getWriter()").length,2);
  assert.ok(proposal.source.includes("try { releaseWriter(); } catch"));
  assert.throws(()=>heldWriterSource(previous.replace("finalWritable.write(value)","finalWritable.write(other)")));
});
test("matched order, extent, unchanged memory limits and meaningful gain rule do not certify conversion speed or universal fastest",()=>{
  assert.deepEqual(plan.order,["baseline","candidate","candidate","baseline","baseline","candidate"]);
  assert.equal(plan.bytes,268435439);assert.equal(plan.chunkBytes,524288);assert.equal(plan.primaryLimitMiB,250);assert.equal(plan.cleanupLimitMiB,96);
  const rows=plan.order.map(arm=>({arm,elapsedMs:arm==="baseline"?100:90})),pass=summarizeStagedWriterTiming(rows);
  assert.equal(pass.conversionSpeedupProven,false);assert.equal(pass.universalFastestClaim,false);
  assert.equal(pass.matchedCopyTimingGatePassed,true);assert.equal(summarizeStagedWriterTiming(rows.map(r=>({...r,elapsedMs:100}))).matchedCopyTimingGatePassed,false);
});
